"""Unit test proving model pluggability and router-registry decoupling.

Demonstrates:
  new model -> registry -> router
without editing any router source code.
"""

from __future__ import annotations

import inspect

import pytest

from vajra.core.config import DatabaseSettings
from vajra.core.enums import Capability, HealthState, RuntimeKind
from vajra.router.classify import LexiconTaskClassifier
from vajra.router.engine import RouterEngine
from vajra.router.models import ModelCandidate
from vajra.store.database import Database
from vajra.store.models import ModelRecord, RuntimeRecord
from vajra.store.repositories.registry import RegistryRepository


@pytest.mark.asyncio
async def test_new_synthetic_model_registered_and_routed_without_router_modification(
    tmp_path: pytest.TempPathFactory,
) -> None:
    """A newly registered model in the database is selectable by RouterEngine purely via capabilities."""
    db_path = str(tmp_path / "plug_test.db")  # type: ignore[operator]
    database = Database(DatabaseSettings(path=db_path))
    await database.init()

    # 1. Register a new synthetic model with high coding capability
    synthetic_id = "synthetic-deep-coder-v99"
    async with database.session() as session:
        repo = RegistryRepository(session)
        await repo.add_runtime(
            RuntimeRecord(
                id="ollama-local",
                kind=RuntimeKind.OLLAMA,
                base_url="http://127.0.0.1:11434",
            )
        )
        # Register a baseline generalist
        await repo.add_model(
            ModelRecord(
                id="baseline-generalist",
                display_name="Baseline 7B",
                runtime_id="ollama-local",
                runtime_model_id="baseline:7b",
                capabilities={"text": 0.75, "coding": 0.50},
                health=HealthState.HEALTHY,
                context_window=8192,
                max_output_tokens=2048,
            )
        )
        # Register the new synthetic model
        await repo.add_model(
            ModelRecord(
                id=synthetic_id,
                display_name="Synthetic Expert 14B",
                runtime_id="ollama-local",
                runtime_model_id="synthetic:14b",
                capabilities={"text": 0.85, "coding": 0.98, "structured_output": 0.95},
                health=HealthState.HEALTHY,
                context_window=16384,
                max_output_tokens=4096,
            )
        )

    # 2. Retrieve model records from registry repository and convert to routing candidates
    async with database.session() as session:
        repo = RegistryRepository(session)
        records = await repo.list_models()

    candidates = [
        ModelCandidate(
            model_id=record.id,
            runtime_id=record.runtime_id,
            runtime_kind=RuntimeKind.OLLAMA,
            context_window=record.context_window,
            max_output_tokens=record.max_output_tokens,
            vram_gb=record.vram_gb,
            capabilities={
                Capability(k): v
                for k, v in record.capabilities.items()
                if k in Capability._value2member_map_
            },
            health_state=record.health,
        )
        for record in records
    ]

    # 3. Classify a coding task
    classifier = LexiconTaskClassifier()
    spec = await classifier.classify(
        "task-pluggability-1",
        "Write a Python algorithm to optimize AST visitor traversal with caching",
    )
    assert Capability.CODING in spec.required_caps

    # 4. Route task without modifying router source code
    router = RouterEngine()
    decision = router.route(spec, candidates)

    # 5. Verify the router selected the new synthetic model purely based on capability score
    assert decision.selected == synthetic_id
    assert decision.score > 0.8
    assert synthetic_id in decision.rationale

    # 6. Verify RouterEngine source contains zero mentions of this new model
    router_source = inspect.getsource(RouterEngine)
    assert synthetic_id not in router_source
