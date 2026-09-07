"""Hard filters (Section F, stage 2).

Eliminate any model that is disabled, unhealthy, missing a required capability,
missing a required input modality, has ``context_window < estimated_tokens * 1.3``,
or needs more VRAM than is available plus evictable.

Every elimination records a reason. "The UI shows rejections with reasons.
Showing your work is what makes routing believable."
"""

from __future__ import annotations

from collections.abc import Sequence

from vajra.core.enums import Capability, HealthState
from vajra.registry.capabilities import required_modalities
from vajra.router.models import (
    ModelCandidate,
    RejectedModel,
    RejectionReason,
    RoutingContext,
    TaskSpec,
)

#: Safety margin applied to the estimated input size before comparing to a
#: model's context window (Section F, stage 2).
CONTEXT_MARGIN = 1.3

#: Health states a model may be in and still be dispatched to.
DISPATCHABLE_HEALTH = frozenset({HealthState.HEALTHY, HealthState.UNKNOWN, HealthState.DEGRADED})


def apply_hard_filters(
    candidates: Sequence[ModelCandidate],
    spec: TaskSpec,
    context: RoutingContext,
    *,
    require_verified_capabilities: bool = False,
) -> tuple[list[ModelCandidate], list[RejectedModel]]:
    """Split candidates into survivors and rejections with reasons."""
    survivors: list[ModelCandidate] = []
    rejected: list[RejectedModel] = []

    needed_modalities = required_modalities(spec.required_caps)
    needed_context = int(spec.features.estimated_input_tokens * CONTEXT_MARGIN)

    for candidate in candidates:
        rejection = _reject(
            candidate,
            spec,
            context,
            needed_modalities=needed_modalities,
            needed_context=needed_context,
            require_verified_capabilities=require_verified_capabilities,
        )
        if rejection is None:
            survivors.append(candidate)
        else:
            rejected.append(rejection)

    return survivors, rejected


def _reject(
    candidate: ModelCandidate,
    spec: TaskSpec,
    context: RoutingContext,
    *,
    needed_modalities: frozenset,
    needed_context: int,
    require_verified_capabilities: bool,
) -> RejectedModel | None:
    if not candidate.enabled:
        return RejectedModel(
            model_id=candidate.model_id,
            reason=RejectionReason.DISABLED,
            detail="model is disabled in the registry",
        )

    if candidate.health not in DISPATCHABLE_HEALTH:
        return RejectedModel(
            model_id=candidate.model_id,
            reason=RejectionReason.UNHEALTHY,
            detail=f"health is {candidate.health.value}",
        )

    missing_caps = sorted(
        capability.value
        for capability in spec.required_caps
        if capability not in candidate.capabilities
    )
    if missing_caps:
        return RejectedModel(
            model_id=candidate.model_id,
            reason=RejectionReason.MISSING_CAPABILITY,
            detail=f"does not declare {', '.join(missing_caps)}",
        )

    if require_verified_capabilities:
        unverified = sorted(
            capability.value
            for capability in spec.required_caps
            if capability not in candidate.verified_capabilities
        )
        if unverified:
            detail = f"policy requires verified capabilities; unverified: {', '.join(unverified)}"
            return RejectedModel(
                model_id=candidate.model_id,
                reason=RejectionReason.UNVERIFIED_CAPABILITY,
                detail=detail,
            )

    missing_modalities = sorted(
        modality.value
        for modality in needed_modalities
        if modality not in candidate.modalities_in
    )
    if missing_modalities:
        return RejectedModel(
            model_id=candidate.model_id,
            reason=RejectionReason.MISSING_MODALITY,
            detail=f"does not accept {', '.join(missing_modalities)} input",
        )

    if needed_context and candidate.usable_context < needed_context:
        return RejectedModel(
            model_id=candidate.model_id,
            reason=RejectionReason.CONTEXT_TOO_SMALL,
            detail=(
                f"usable context {candidate.usable_context} < required {needed_context} "
                f"(estimate x{CONTEXT_MARGIN})"
            ),
        )

    # VRAM is only a filter when something has actually measured it. An unknown
    # VRAM budget must not silently eliminate models.
    if context.available_vram_gb is not None and candidate.vram_gb > 0:
        budget = context.available_vram_gb + (context.evictable_vram_gb or 0.0)
        if candidate.vram_gb > budget:
            return RejectedModel(
                model_id=candidate.model_id,
                reason=RejectionReason.INSUFFICIENT_VRAM,
                detail=f"needs {candidate.vram_gb:.1f} GB, budget is {budget:.1f} GB",
            )

    return None


def missing_capabilities(
    candidate: ModelCandidate, required: frozenset[Capability]
) -> frozenset[Capability]:
    """Capabilities a candidate does not declare. Used by tests and the inspector."""
    return frozenset(
        capability for capability in required if capability not in candidate.capabilities
    )
