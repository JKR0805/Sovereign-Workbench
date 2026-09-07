"""Runtime records and the adapter cache.

Owns the mapping from a persisted :class:`~vajra.store.models.RuntimeRecord` to a
live :class:`~vajra.runtimes.base.RuntimeAdapter`, and keeps one adapter instance
per runtime so HTTP connections are pooled rather than rebuilt per request.
"""

from __future__ import annotations

from datetime import UTC, datetime

from vajra.core.config import Settings
from vajra.core.enums import HealthState, RuntimeKind
from vajra.core.exceptions import Conflict, NotFound
from vajra.registry.models import RuntimeRegistration
from vajra.runtimes.base import RuntimeAdapter, RuntimeHealth
from vajra.runtimes.factory import build_adapter
from vajra.store.database import Database
from vajra.store.models import RuntimeRecord
from vajra.store.repositories.registry import RegistryRepository

#: Identifier of the runtime seeded from configuration on first boot.
DEFAULT_OLLAMA_RUNTIME_ID = "ollama-local"


class RuntimeManager:
    """Runtime CRUD plus a cache of live adapters."""

    def __init__(self, database: Database, settings: Settings) -> None:
        self._database = database
        self._settings = settings
        self._adapters: dict[str, RuntimeAdapter] = {}

    # --- lifecycle -------------------------------------------------------

    async def ensure_default_runtimes(self) -> None:
        """Seed the runtimes named in configuration.

        This registers the *runtime*, not any model. A runtime record says only
        "there is a server at this URL"; whether it is reachable is measured by
        :meth:`probe`, and which models exist is read from the runtime itself.
        """
        async with self._database.session() as session:
            repository = RegistryRepository(session)
            if await repository.get_runtime(DEFAULT_OLLAMA_RUNTIME_ID) is None:
                await repository.add_runtime(
                    RuntimeRecord(
                        id=DEFAULT_OLLAMA_RUNTIME_ID,
                        kind=RuntimeKind.OLLAMA,
                        base_url=self._settings.ollama.base_url,
                        enabled=True,
                    )
                )
            if self._settings.vllm.enabled:
                if await repository.get_runtime("vllm-local") is None:
                    await repository.add_runtime(
                        RuntimeRecord(
                            id="vllm-local",
                            kind=RuntimeKind.VLLM,
                            base_url=self._settings.vllm.base_url,
                            enabled=True,
                        )
                    )

    async def aclose(self) -> None:
        for adapter in self._adapters.values():
            await adapter.aclose()
        self._adapters.clear()

    # --- CRUD ------------------------------------------------------------

    async def register(self, registration: RuntimeRegistration) -> RuntimeRecord:
        async with self._database.session() as session:
            repository = RegistryRepository(session)
            if await repository.get_runtime(registration.id) is not None:
                raise Conflict(
                    f"Runtime {registration.id!r} is already registered",
                    runtime_id=registration.id,
                )
            return await repository.add_runtime(
                RuntimeRecord(
                    id=registration.id,
                    kind=registration.kind,
                    base_url=registration.base_url,
                    enabled=registration.enabled,
                )
            )

    async def get(self, runtime_id: str) -> RuntimeRecord:
        async with self._database.session() as session:
            record = await RegistryRepository(session).get_runtime(runtime_id)
        if record is None:
            raise NotFound(f"Runtime {runtime_id!r} is not registered", runtime_id=runtime_id)
        return record

    async def list(self, *, enabled_only: bool = False) -> list[RuntimeRecord]:
        async with self._database.session() as session:
            return await RegistryRepository(session).list_runtimes(enabled_only=enabled_only)

    # --- adapters --------------------------------------------------------

    def adapter_for_record(self, record: RuntimeRecord) -> RuntimeAdapter:
        """Return a cached adapter, building one if this runtime has none yet."""
        cached = self._adapters.get(record.id)
        if cached is not None and cached.base_url == record.base_url.rstrip("/"):
            return cached
        adapter = build_adapter(
            runtime_id=record.id,
            kind=record.kind,
            base_url=record.base_url,
            api_key=self._settings.vllm.api_key if record.kind is RuntimeKind.VLLM else None,
            request_timeout_s=self._settings.ollama.request_timeout_s,
            connect_timeout_s=self._settings.ollama.connect_timeout_s,
            keep_alive=self._settings.ollama.keep_alive,
        )
        self._adapters[record.id] = adapter
        return adapter

    async def adapter(self, runtime_id: str) -> RuntimeAdapter:
        return self.adapter_for_record(await self.get(runtime_id))

    # --- health ----------------------------------------------------------

    async def probe(self, runtime_id: str) -> RuntimeHealth:
        """Measure runtime health and persist the result."""
        record = await self.get(runtime_id)
        adapter = self.adapter_for_record(record)
        health = await adapter.health()
        async with self._database.session() as session:
            repository = RegistryRepository(session)
            stored = await repository.get_runtime(runtime_id)
            if stored is not None:
                stored.health = health.state
                stored.health_detail = health.detail
                stored.version = health.version
                stored.last_probe_at = datetime.now(UTC)
                await repository.save(stored)
        return health

    async def probe_all(self) -> dict[str, RuntimeHealth]:
        results: dict[str, RuntimeHealth] = {}
        for record in await self.list(enabled_only=True):
            try:
                results[record.id] = await self.probe(record.id)
            except Exception as exc:
                results[record.id] = RuntimeHealth(
                    state=HealthState.UNHEALTHY,
                    kind=record.kind,
                    base_url=record.base_url,
                    detail=str(exc),
                    checked_at=datetime.now(UTC),
                )
        return results
