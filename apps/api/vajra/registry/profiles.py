"""Hardware-aware model profile parser and registry synchronizer (Section V).

This module loads declarative hardware profiles from YAML (e.g. laptop-8gb.yaml,
mid-16gb.yaml, high-perf-24gb.yaml) and synchronizes them into the ModelRecord
store without hardcoding model names in the routing logic.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import HealthState, RuntimeKind
from vajra.registry.health import initial_verification_state, now
from vajra.registry.runtimes import RuntimeManager
from vajra.store.database import Database
from vajra.store.models import ModelRecord, RuntimeRecord
from vajra.store.repositories.registry import RegistryRepository

logger = logging.getLogger(__name__)


class HardwareConfig(BaseModel):
    """Hardware envelope and residency limits."""

    model_config = ConfigDict(extra="ignore")

    profile: str
    description: str = ""
    vram_mb: int = 8192
    max_usable_vram_mb: int | None = None
    max_loaded_models: int = 1
    keep_alive: str = "30m"
    preferred_embedding_device: str = "cpu"


class ProfileRuntimeConfig(BaseModel):
    """Target runtime configuration."""

    model_config = ConfigDict(extra="ignore")

    id: str = "ollama"
    kind: RuntimeKind = RuntimeKind.OLLAMA
    base_url: str = "http://127.0.0.1:11434"


class ProfileModelConfig(BaseModel):
    """Model definition within a profile."""

    model_config = ConfigDict(extra="ignore")

    id: str
    display_name: str
    role: str = "general"
    runtime_id: str = "ollama"
    runtime_model_id: str
    capabilities: dict[str, float] = Field(default_factory=dict)
    context_window: int = 4096
    max_output_tokens: int = 2048
    num_ctx: int | None = None
    device: str = "gpu"
    vram_gb: float = 0.0
    quantization: str = "unknown"
    modalities_in: list[str] = Field(default_factory=lambda: ["text"])
    priority: int = 50
    enabled: bool = True
    license: str = "unknown"


class HardwareProfileConfig(BaseModel):
    """Complete hardware model profile schema."""

    model_config = ConfigDict(extra="ignore")

    hardware: HardwareConfig
    runtime: ProfileRuntimeConfig
    models: list[ProfileModelConfig] = Field(default_factory=list)


class SyncResult(BaseModel):
    """Summary of model registry synchronization."""

    profile: str
    runtime_id: str
    runtime_synced: bool
    models_added: list[str] = Field(default_factory=list)
    models_updated: list[str] = Field(default_factory=list)
    models_untouched: list[str] = Field(default_factory=list)
    probed: dict[str, bool] = Field(default_factory=dict)


def load_profile(path_or_name: str | Path, config_dir: Path | None = None) -> HardwareProfileConfig:
    """Load and validate a hardware profile YAML file."""
    candidate_path = Path(path_or_name)
    if not candidate_path.is_file():
        # Search relative to config_dir / models
        search_dirs = []
        if config_dir is not None:
            search_dirs.extend([config_dir, config_dir / "models"])
        # Standard repository location
        repo_root = Path(__file__).resolve().parents[4]
        search_dirs.extend([
            repo_root / "config",
            repo_root / "config" / "models",
        ])

        found: Path | None = None
        for base in search_dirs:
            p1 = base / f"{path_or_name}.yaml"
            p2 = base / f"{path_or_name}.yml"
            p3 = base / path_or_name
            for p in (p1, p2, p3):
                if p.is_file():
                    found = p
                    break
            if found:
                candidate_path = found
                break

    if not candidate_path.is_file():
        raise FileNotFoundError(f"Hardware profile YAML not found: {path_or_name}")

    content = candidate_path.read_text(encoding="utf-8")
    parsed: Any = yaml.safe_load(content)
    if not isinstance(parsed, dict):
        raise ValueError(f"Profile {candidate_path} must be a YAML mapping")

    return HardwareProfileConfig.model_validate(parsed)


async def sync_model_registry(
    database: Database,
    profile: HardwareProfileConfig,
    *,
    runtimes: RuntimeManager | None = None,
    probe: bool = True,
) -> SyncResult:
    """Synchronize declared models from a hardware profile into the database registry.

    - Upserts configured models into the registry.
    - Probes runtime availability if reachable and requested.
    - Preserves existing manual models in the database.
    - Does NOT delete models not present in this profile (non-destructive).
    """
    result = SyncResult(
        profile=profile.hardware.profile,
        runtime_id=profile.runtime.id,
        runtime_synced=False,
    )

    # 1. Ensure runtime record exists
    async with database.session() as session:
        repo = RegistryRepository(session)
        rt = await repo.get_runtime(profile.runtime.id)
        if rt is None:
            rt = RuntimeRecord(
                id=profile.runtime.id,
                kind=profile.runtime.kind,
                base_url=profile.runtime.base_url,
                enabled=True,
                health=HealthState.UNKNOWN,
            )
            await repo.add_runtime(rt)
            result.runtime_synced = True
        else:
            # Update base_url if changed
            if rt.base_url != profile.runtime.base_url:
                rt.base_url = profile.runtime.base_url
                await repo.save(rt)

    # 2. Probe available models on the runtime if prober available
    available_runtime_models: set[str] = set()
    runtime_reachable = False
    if probe and runtimes is not None:
        try:
            adapter = await runtimes.adapter(profile.runtime.id)
            health = await adapter.health()
            runtime_reachable = health.state is HealthState.HEALTHY
            if runtime_reachable:
                available = await adapter.list_available()
                for info in available:
                    available_runtime_models.add(info.id)
                    available_runtime_models.add(info.id.split(":")[0])
        except Exception as exc:
            logger.warning("Could not probe runtime %s during sync: %s", profile.runtime.id, exc)

    # 3. Synchronize models
    async with database.session() as session:
        repo = RegistryRepository(session)
        existing_models = {m.id: m for m in await repo.list_models()}

        for model_cfg in profile.models:
            is_healthy = HealthState.UNKNOWN
            detail: str | None = None

            if probe and runtimes is not None:
                if runtime_reachable:
                    target = model_cfg.runtime_model_id
                    target_base = target.split(":")[0]
                    found = (
                        target in available_runtime_models
                        or target_base in available_runtime_models
                    )
                    result.probed[model_cfg.id] = found
                    if found:
                        is_healthy = HealthState.HEALTHY
                        detail = "model available on runtime"
                    else:
                        is_healthy = HealthState.UNHEALTHY
                        detail = f"model {target!r} not pulled on runtime"
                else:
                    is_healthy = HealthState.UNHEALTHY
                    detail = f"runtime {profile.runtime.id!r} is unreachable"
                    result.probed[model_cfg.id] = False
            elif probe and runtimes is None:
                is_healthy = HealthState.UNKNOWN
                detail = "probing skipped: no runtime manager provided"

            if model_cfg.id in existing_models:
                existing = existing_models[model_cfg.id]
                existing.display_name = model_cfg.display_name
                existing.runtime_id = model_cfg.runtime_id
                existing.runtime_model_id = model_cfg.runtime_model_id
                existing.capabilities = dict(model_cfg.capabilities)
                existing.context_window = model_cfg.context_window
                existing.max_output_tokens = model_cfg.max_output_tokens
                existing.num_ctx = model_cfg.num_ctx
                existing.device = model_cfg.device
                existing.vram_gb = model_cfg.vram_gb
                existing.quantization = model_cfg.quantization
                existing.modalities_in = list(model_cfg.modalities_in)
                existing.priority = model_cfg.priority
                existing.license = model_cfg.license
                if probe and runtimes is not None:
                    existing.health = is_healthy
                    existing.health_detail = detail
                    existing.last_probe_at = now()
                await repo.save(existing)
                result.models_updated.append(model_cfg.id)
            else:
                record = ModelRecord(
                    id=model_cfg.id,
                    display_name=model_cfg.display_name,
                    runtime_id=model_cfg.runtime_id,
                    runtime_model_id=model_cfg.runtime_model_id,
                    capabilities=dict(model_cfg.capabilities),
                    capabilities_verified=initial_verification_state(model_cfg.capabilities),
                    context_window=model_cfg.context_window,
                    max_output_tokens=model_cfg.max_output_tokens,
                    num_ctx=model_cfg.num_ctx,
                    device=model_cfg.device,
                    vram_gb=model_cfg.vram_gb,
                    quantization=model_cfg.quantization,
                    modalities_in=list(model_cfg.modalities_in),
                    priority=model_cfg.priority,
                    enabled=model_cfg.enabled,
                    license=model_cfg.license,
                    health=is_healthy,
                    health_detail=detail,
                    last_probe_at=now() if probe and runtimes is not None else None,
                )
                await repo.add_model(record)
                result.models_added.append(model_cfg.id)

    return result
