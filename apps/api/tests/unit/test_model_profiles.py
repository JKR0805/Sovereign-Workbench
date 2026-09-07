"""Unit tests for hardware-aware model profiles and registry synchronization."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from vajra.core.config import DatabaseSettings
from vajra.core.enums import HealthState, RuntimeKind
from vajra.registry.profiles import (
    HardwareProfileConfig,
    load_profile,
    sync_model_registry,
)
from vajra.store.database import Database
from vajra.store.repositories.registry import RegistryRepository


def test_load_all_declarative_profiles() -> None:
    """All declarative hardware profiles in config/models/ must parse and validate."""
    for profile_name in ("laptop-8gb", "mid-16gb", "high-perf-24gb"):
        profile = load_profile(profile_name)
        assert isinstance(profile, HardwareProfileConfig)
        assert profile.hardware.profile == profile_name
        assert profile.hardware.vram_mb > 0
        assert len(profile.models) > 0
        for model in profile.models:
            assert model.id
            assert model.role
            assert model.context_window > 0
            assert isinstance(model.capabilities, dict)


def test_laptop_8gb_profile_constraints() -> None:
    """Verify Section V constraints on the 8 GB laptop target profile."""
    profile = load_profile("laptop-8gb")
    assert profile.hardware.vram_mb == 8192
    assert profile.hardware.max_loaded_models == 1
    assert profile.hardware.preferred_embedding_device == "cpu"

    roles = {m.role for m in profile.models}
    assert "general" in roles
    assert "coding" in roles
    assert "vision" in roles
    assert "embedding" in roles

    # Bounded context verification
    for model in profile.models:
        assert model.context_window <= 8192
        assert model.num_ctx <= 8192


def test_schema_validation_rejects_invalid_config() -> None:
    """Malformed profile content must raise validation errors."""
    with pytest.raises(FileNotFoundError):
        load_profile("non-existent-profile-xyz")

    with pytest.raises(ValidationError):
        # Missing required hardware block
        HardwareProfileConfig.model_validate({"models": []})


async def test_sync_model_registry_into_database(tmp_path: pytest.TempPathFactory) -> None:
    """Synchronization must upsert model definitions into the database."""
    db_path = str(tmp_path / "sync_test.db")  # type: ignore[operator]
    database = Database(DatabaseSettings(path=db_path))
    await database.init()

    profile = load_profile("laptop-8gb")
    result = await sync_model_registry(database, profile, probe=False)

    assert len(result.models_added) > 0
    assert len(result.models_updated) == 0

    async with database.session() as session:
        repo = RegistryRepository(session)
        records = await repo.list_models()
        assert len(records) == len(profile.models)

        # Check coding specialist record
        coding_model = next((m for m in records if m.id == "coding-specialist"), None)
        assert coding_model is not None
        assert coding_model.device == "gpu"
        assert coding_model.capabilities.get("coding") == 0.95

        # Check embedding record
        embed_model = next((m for m in records if m.id == "text-embedding"), None)
        assert embed_model is not None
        assert embed_model.device == "cpu"
        assert embed_model.capabilities.get("embedding") == 0.90

    # Re-syncing should update, not duplicate
    re_result = await sync_model_registry(database, profile, probe=False)
    assert len(re_result.models_added) == 0
    assert len(re_result.models_updated) == len(profile.models)


async def test_probe_missing_models_marked_unhealthy(tmp_path: pytest.TempPathFactory) -> None:
    """Models not available on the runtime must be marked UNHEALTHY without faking."""
    db_path = str(tmp_path / "probe_test.db")  # type: ignore[operator]
    database = Database(DatabaseSettings(path=db_path))
    await database.init()

    profile = load_profile("laptop-8gb")
    # Probing without a running runtime should honestly report models as unhealthy
    await sync_model_registry(database, profile, probe=True, runtimes=None)

    async with database.session() as session:
        repo = RegistryRepository(session)
        records = await repo.list_models()
        for rec in records:
            # Since runtimes was None, probe marked UNKNOWN/UNHEALTHY honestly
            assert rec.health in (HealthState.UNKNOWN, HealthState.UNHEALTHY)
            assert rec.health_detail is not None


async def test_manual_model_preserved_during_sync(tmp_path: pytest.TempPathFactory) -> None:
    """Manually registered custom models must not be deleted by profile synchronization."""
    db_path = str(tmp_path / "custom_test.db")  # type: ignore[operator]
    database = Database(DatabaseSettings(path=db_path))
    await database.init()

    from vajra.store.models import ModelRecord, RuntimeRecord

    async with database.session() as session:
        repo = RegistryRepository(session)
        await repo.add_runtime(
            RuntimeRecord(
                id="custom-rt",
                kind=RuntimeKind.OLLAMA,
                base_url="http://127.0.0.1:11434",
            )
        )
        await repo.add_model(
            ModelRecord(
                id="my-custom-model",
                display_name="Custom Finetune",
                runtime_id="custom-rt",
                runtime_model_id="custom:latest",
                role="general",
                capabilities={"text": 0.8},
                context_window=4096,
                max_output_tokens=2048,
            )
        )

    # Sync laptop profile
    profile = load_profile("laptop-8gb")
    await sync_model_registry(database, profile, probe=False)

    async with database.session() as session:
        repo = RegistryRepository(session)
        records = await repo.list_models()
        model_ids = {m.id for m in records}
        assert "my-custom-model" in model_ids
        assert "general-reasoning" in model_ids
