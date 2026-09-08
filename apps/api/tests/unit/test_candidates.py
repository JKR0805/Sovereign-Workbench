"""Unit tests for vajra.orchestrator.candidates."""

from __future__ import annotations

from vajra.core.enums import HealthState, Modality
from vajra.orchestrator.candidates import host_is_loopback, is_service_model, parse_modalities
from vajra.store.models import ModelRecord


def _model(**overrides: object) -> ModelRecord:
    defaults: dict[str, object] = dict(
        id="m1",
        display_name="Test Model",
        runtime_id="rt-1",
        runtime_model_id="test:latest",
        context_window=8192,
        health=HealthState.HEALTHY,
    )
    defaults.update(overrides)
    return ModelRecord(**defaults)


def test_is_service_model_true_for_pure_embedding() -> None:
    record = _model(capabilities={"embedding": 0.95})
    assert is_service_model(record) is True


def test_is_service_model_false_when_capable_of_chat_too() -> None:
    record = _model(capabilities={"embedding": 0.9, "text": 0.8})
    assert is_service_model(record) is False


def test_is_service_model_false_for_undeclared_capabilities() -> None:
    """An undeclared model is unknown, not excluded."""
    record = _model(capabilities={})
    assert is_service_model(record) is False


def test_is_service_model_true_for_reranking() -> None:
    record = _model(capabilities={"reranking": 0.9})
    assert is_service_model(record) is True


def test_host_is_loopback() -> None:
    assert host_is_loopback("http://127.0.0.1:11434") is True
    assert host_is_loopback("http://localhost:8001") is True
    assert host_is_loopback("http://10.0.0.5:11434") is False


def test_parse_modalities_defaults_to_text_on_empty() -> None:
    assert parse_modalities([]) == {Modality.TEXT}


def test_parse_modalities_drops_unknown_values() -> None:
    assert parse_modalities(["image", "not-a-real-modality"]) == {Modality.IMAGE}
