"""Capability semantics.

Section E, layer 2: a model's capabilities are declarative data with a strength
in ``0.0..1.0``. The router reads strengths; it never reads a model name.

Capabilities are *declared* when registered and *verified* by probing (Section E,
"Adding a model without touching the router", step 3). A declared capability the
probe disproves becomes :attr:`VerificationState.FAILED` and the UI flags it
before the record can be saved. This module owns that vocabulary and its
validation. It does not own routing logic.
"""

from __future__ import annotations

from collections.abc import Mapping

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import Capability, Modality, VerificationState
from vajra.core.exceptions import ValidationError

__all__ = [
    "Capability",
    "CapabilityProbeResult",
    "CapabilityRequirement",
    "VerificationState",
    "modalities_for",
    "normalise_capabilities",
    "parse_capability",
    "required_modalities",
    "validate_strengths",
]

#: Capabilities that imply an input modality beyond text. Used by the hard
#: filters to reject a model whose runtime cannot accept the input at all.
CAPABILITY_MODALITIES: Mapping[Capability, frozenset[Modality]] = {
    Capability.VISION: frozenset({Modality.IMAGE}),
    Capability.DOC_UNDERSTANDING: frozenset({Modality.TEXT}),
}

#: Capabilities that describe a service role rather than a generation skill.
#: A model declaring one of these is not a candidate for chat routing.
SERVICE_CAPABILITIES: frozenset[Capability] = frozenset(
    {Capability.EMBEDDING, Capability.RERANKING}
)


def parse_capability(value: str | Capability) -> Capability:
    """Coerce a wire value to :class:`Capability`, raising a typed error."""
    if isinstance(value, Capability):
        return value
    try:
        return Capability(value.lower())
    except ValueError as exc:
        raise ValidationError(
            f"Unknown capability: {value!r}",
            allowed=[capability.value for capability in Capability],
        ) from exc


def validate_strengths(raw: Mapping[str, float]) -> dict[Capability, float]:
    """Validate a declared ``capability -> strength`` mapping.

    Raises :class:`~vajra.core.exceptions.ValidationError` on an unknown
    capability or a strength outside ``0.0..1.0``. Declaring a capability with
    strength 0 is legal and means "supported but weak"; omitting it means "not
    supported", and the hard filters treat those differently.
    """
    validated: dict[Capability, float] = {}
    for key, value in raw.items():
        capability = parse_capability(key)
        try:
            strength = float(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                f"Capability strength for {capability.value} must be a number",
                capability=capability.value,
                value=value,
            ) from exc
        if not 0.0 <= strength <= 1.0:
            raise ValidationError(
                f"Capability strength for {capability.value} must be within 0.0..1.0",
                capability=capability.value,
                value=strength,
            )
        validated[capability] = strength
    return validated


def normalise_capabilities(raw: Mapping[str, float]) -> dict[str, float]:
    """Validate and return a JSON-storable mapping keyed by capability value."""
    return {
        capability.value: strength for capability, strength in validate_strengths(raw).items()
    }


def modalities_for(capabilities: Mapping[Capability, float]) -> frozenset[Modality]:
    """Input modalities implied by a set of declared capabilities."""
    modalities: set[Modality] = {Modality.TEXT}
    for capability in capabilities:
        modalities |= set(CAPABILITY_MODALITIES.get(capability, ()))
    return frozenset(modalities)


def required_modalities(capabilities: frozenset[Capability]) -> frozenset[Modality]:
    """Input modalities a task requires, derived from its required capabilities."""
    modalities: set[Modality] = set()
    for capability in capabilities:
        modalities |= set(CAPABILITY_MODALITIES.get(capability, ()))
    return frozenset(modalities)


class CapabilityRequirement(BaseModel):
    """A capability a task needs, and whether a weak model will do."""

    model_config = ConfigDict(frozen=True)

    capability: Capability
    minimum_strength: float = 0.0


class CapabilityProbeResult(BaseModel):
    """Outcome of probing one declared capability against a live model.

    ``state`` is never ``VERIFIED`` unless a probe actually ran and succeeded.
    A model that was never probed stays ``DECLARED``.
    """

    model_config = ConfigDict(frozen=True)

    capability: Capability
    declared_strength: float
    state: VerificationState
    latency_ms: float | None = None
    detail: str | None = None
    evidence: dict[str, object] = Field(default_factory=dict)
