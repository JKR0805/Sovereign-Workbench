"""Model registry service: register, validate, probe, persist.

Not named in the plan's file list; added because model CRUD needs a home that is
neither the data contracts (:mod:`vajra.registry.models`) nor the persistence
layer. It implements the workflow of Section E::

    register -> validate -> probe -> record capabilities -> record health
             -> record metrics -> make available to router

The stages that are implemented are marked below. Capability verification and
benchmarking raise :class:`~vajra.core.exceptions.NotImplementedYet` from
:mod:`vajra.registry.health`; registration succeeds without them and the record
carries capabilities in state ``DECLARED``.
"""

from __future__ import annotations

from vajra.core.enums import ComputeDevice, HealthState
from vajra.core.exceptions import Conflict, NotFound, ValidationError
from vajra.events.bus import EventBus
from vajra.registry.health import ModelProber, initial_verification_state, now
from vajra.registry.models import (
    ModelRegistration,
    ModelUpdate,
    ProbeReport,
)
from vajra.registry.runtimes import RuntimeManager
from vajra.store.database import Database
from vajra.store.models import ModelRecord
from vajra.store.repositories.registry import RegistryRepository


class ModelRegistry:
    """CRUD over :class:`~vajra.store.models.ModelRecord` plus probing."""

    def __init__(
        self, database: Database, runtimes: RuntimeManager, events: EventBus | None = None
    ) -> None:
        self._database = database
        self._runtimes = runtimes
        self._events = events

    # --- read ------------------------------------------------------------

    async def list(self, *, enabled_only: bool = False) -> list[ModelRecord]:
        async with self._database.session() as session:
            return await RegistryRepository(session).list_models(enabled_only=enabled_only)

    async def get(self, model_id: str) -> ModelRecord:
        async with self._database.session() as session:
            record = await RegistryRepository(session).get_model(model_id)
        if record is None:
            raise NotFound(f"Model {model_id!r} is not registered", model_id=model_id)
        return record

    # --- write -----------------------------------------------------------

    async def register(self, registration: ModelRegistration, *, probe: bool = True) -> ModelRecord:
        """Validate, optionally probe, and persist a model record.

        A failed probe does not block registration: an operator may register a
        model before pulling it. The record is stored with health ``UNHEALTHY``
        and the probe detail attached, so the Model Hub shows the truth rather
        than an optimistic default.
        """
        async with self._database.session() as session:
            repository = RegistryRepository(session)
            if await repository.get_model(registration.id) is not None:
                raise Conflict(
                    f"Model {registration.id!r} is already registered", model_id=registration.id
                )
            runtime = await repository.get_runtime(registration.runtime_id)
            if runtime is None:
                raise ValidationError(
                    f"Runtime {registration.runtime_id!r} is not registered",
                    runtime_id=registration.runtime_id,
                )

        report: ProbeReport | None = None
        health = HealthState.UNKNOWN
        health_detail: str | None = None
        if probe:
            report = await self.probe(registration.runtime_id, registration.runtime_model_id)
            health = HealthState.HEALTHY if report.ok else HealthState.UNHEALTHY
            health_detail = "; ".join(report.errors) or None

        record = ModelRecord(
            id=registration.id,
            display_name=registration.display_name,
            runtime_id=registration.runtime_id,
            runtime_model_id=registration.runtime_model_id,
            capabilities=dict(registration.capabilities),
            capabilities_verified=initial_verification_state(registration.capabilities),
            context_window=registration.context_window,
            max_output_tokens=registration.max_output_tokens,
            num_ctx=registration.num_ctx,
            device=registration.device.value,
            vram_gb=registration.vram_gb,
            quantization=registration.quantization,
            modalities_in=[modality.value for modality in registration.modalities_in],
            priority=registration.priority,
            enabled=registration.enabled,
            license=registration.license,
            health=health,
            health_detail=health_detail,
            last_probe_at=now() if probe else None,
        )

        async with self._database.session() as session:
            await RegistryRepository(session).add_model(record)
        return record

    async def update(self, model_id: str, update: ModelUpdate) -> ModelRecord:
        async with self._database.session() as session:
            repository = RegistryRepository(session)
            record = await repository.get_model(model_id)
            if record is None:
                raise NotFound(f"Model {model_id!r} is not registered", model_id=model_id)

            data = update.model_dump(exclude_unset=True, exclude_none=True)
            if "capabilities" in data:
                record.capabilities = dict(data.pop("capabilities"))
                # Changing a declaration invalidates any prior verification.
                record.capabilities_verified = initial_verification_state(record.capabilities)
            if "modalities_in" in data:
                record.modalities_in = [
                    modality.value if hasattr(modality, "value") else str(modality)
                    for modality in data.pop("modalities_in")
                ]
            if "device" in data:
                device = data.pop("device")
                record.device = (
                    device.value if isinstance(device, ComputeDevice) else str(device)
                )
            for field, value in data.items():
                setattr(record, field, value)
            await repository.save(record)
            return record

    async def delete(self, model_id: str) -> None:
        async with self._database.session() as session:
            repository = RegistryRepository(session)
            record = await repository.get_model(model_id)
            if record is None:
                raise NotFound(f"Model {model_id!r} is not registered", model_id=model_id)
            await repository.delete_model(record)

    # --- probing ---------------------------------------------------------

    async def probe(self, runtime_id: str, runtime_model_id: str) -> ProbeReport:
        """Run the probe chain against a runtime without persisting anything."""
        adapter = await self._runtimes.adapter(runtime_id)
        return await ModelProber(adapter).probe(runtime_model_id)

    async def refresh_health(self, model_id: str) -> ModelRecord:
        """Re-probe a registered model and persist the measured health."""
        record = await self.get(model_id)
        report = await self.probe(record.runtime_id, record.runtime_model_id)
        async with self._database.session() as session:
            repository = RegistryRepository(session)
            stored = await repository.get_model(model_id)
            if stored is None:
                raise NotFound(f"Model {model_id!r} is not registered", model_id=model_id)
            stored.health = HealthState.HEALTHY if report.ok else HealthState.UNHEALTHY
            stored.health_detail = "; ".join(report.errors) or None
            stored.last_probe_at = now()
            await repository.save(stored)
            return stored

    # --- residency -------------------------------------------------------

    async def load(self, model_id: str) -> None:
        """Bring a model into VRAM through its runtime adapter."""
        record = await self.get(model_id)
        adapter = await self._runtimes.adapter(record.runtime_id)
        await adapter.load(record.runtime_model_id)

    async def unload(self, model_id: str) -> None:
        record = await self.get(model_id)
        adapter = await self._runtimes.adapter(record.runtime_id)
        await adapter.unload(record.runtime_model_id)
