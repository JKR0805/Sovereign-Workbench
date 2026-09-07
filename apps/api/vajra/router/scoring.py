"""Weighted scoring (Section F, stage 3).

::

    score = 100 * sum(w_i * f_i) / sum(w_i)

    f_capability  = mean(strength[c] for c in required_caps)   w=0.40
    f_preferred   = mean(strength[c] for c in preferred_caps)  w=0.15
    f_context     = clamp(log(ctx/needed) / log(8), 0, 1)      w=0.10
    f_latency     = 1 - clamp(ema_latency / latency_budget, 0, 1)  w=0.10
    f_priority    = priority / 100                             w=0.10
    f_residency   = 1.0 if resident else 0.35                  w=0.10
    f_reliability = 1 - error_rate                             w=0.05

Deterministic, explainable and tunable. Every term is returned so the UI can
render it as a segment of the score bar, and so a rationale sentence can be
generated from the top contributors.

``f_residency`` is deliberate and honest: on constrained hardware a slightly
weaker model already in VRAM often *is* the better choice.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from vajra.core.enums import Capability
from vajra.router.models import (
    CandidateScore,
    ModelCandidate,
    RoutingContext,
    ScoreTerm,
    ScoringWeights,
    TaskSpec,
)

#: Score for a model that is not currently in VRAM. Not zero: a non-resident
#: model is a worse choice, not an unusable one.
NON_RESIDENT_SCORE = 0.35

#: The context term saturates at 8x headroom over what the task needs.
CONTEXT_SATURATION = 8.0

#: Latency term for a model that has never been measured. Neutral by design:
#: an unmeasured model is neither rewarded nor punished for its speed.
UNMEASURED_LATENCY_SCORE = 0.5


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def capability_fit(candidate: ModelCandidate, capabilities: frozenset[Capability]) -> float:
    """Mean declared strength across a capability set.

    An empty set scores 1.0: a task with no preferences does not penalise anyone.
    A capability the model does not declare contributes 0.0, though the hard
    filters will already have removed such a model when the capability was
    *required*.
    """
    if not capabilities:
        return 1.0
    strengths = [candidate.capabilities.get(capability, 0.0) for capability in capabilities]
    return sum(strengths) / len(strengths)


def context_fit(candidate: ModelCandidate, needed_tokens: int) -> float:
    """Log-scaled headroom. Saturates at 8x, so a huge window is not a free win."""
    if needed_tokens <= 0:
        return 1.0
    usable = candidate.usable_context
    if usable <= 0:
        return 0.0
    ratio = usable / needed_tokens
    if ratio <= 1.0:
        return 0.0
    return clamp(math.log(ratio) / math.log(CONTEXT_SATURATION))


def latency_fit(candidate: ModelCandidate, budget_ms: float) -> float:
    """Faster is better, measured against the task's latency budget."""
    if candidate.avg_latency_ms is None:
        return UNMEASURED_LATENCY_SCORE
    if budget_ms <= 0:
        return UNMEASURED_LATENCY_SCORE
    return 1.0 - clamp(candidate.avg_latency_ms / budget_ms)


def score_candidate(
    candidate: ModelCandidate,
    spec: TaskSpec,
    context: RoutingContext,
    weights: ScoringWeights,
    *,
    needed_tokens: int | None = None,
) -> CandidateScore:
    """Score one candidate and return every weighted term."""
    needed = spec.features.estimated_input_tokens if needed_tokens is None else needed_tokens
    resident = candidate.resident or candidate.model_id in context.resident_model_ids

    terms = [
        ScoreTerm(
            name="capability",
            value=capability_fit(candidate, spec.required_caps),
            weight=weights.capability,
        ),
        ScoreTerm(
            name="preferred",
            value=capability_fit(candidate, spec.preferred_caps),
            weight=weights.preferred,
        ),
        ScoreTerm(name="context", value=context_fit(candidate, needed), weight=weights.context),
        ScoreTerm(
            name="latency",
            value=latency_fit(candidate, spec.latency_budget_ms),
            weight=weights.latency,
        ),
        ScoreTerm(
            name="priority", value=clamp(candidate.priority / 100.0), weight=weights.priority
        ),
        ScoreTerm(
            name="residency",
            value=1.0 if resident else NON_RESIDENT_SCORE,
            weight=weights.residency,
        ),
        ScoreTerm(
            name="reliability",
            value=1.0 - clamp(candidate.error_rate),
            weight=weights.reliability,
        ),
    ]

    weight_total = sum(term.weight for term in terms)
    total = (
        100.0 * sum(term.contribution for term in terms) / weight_total
        if weight_total > 0
        else 0.0
    )
    return CandidateScore(
        model_id=candidate.model_id, total=total, terms=terms, resident=resident
    )


def score_all(
    candidates: Sequence[ModelCandidate],
    spec: TaskSpec,
    context: RoutingContext,
    weights: ScoringWeights,
) -> list[CandidateScore]:
    """Score every survivor, highest first. Ties break on model id for determinism."""
    scores = [score_candidate(candidate, spec, context, weights) for candidate in candidates]
    scores.sort(key=lambda score: (-score.total, score.model_id))
    return scores


def build_rationale(score: CandidateScore, spec: TaskSpec) -> str:
    """A plain-English sentence generated from the top three contributing terms.

    Names the capabilities and the terms, never a model family. The winning
    model's *id* comes from the registry and appears only as an interpolated
    value.
    """
    descriptions = {
        "capability": "matches the required capabilities",
        "preferred": "matches the preferred capabilities",
        "context": "has ample context headroom",
        "latency": "is measurably fast",
        "priority": "has a high operator priority",
        "residency": "is already resident in VRAM",
        "reliability": "has a clean error record",
    }
    top = [descriptions.get(term.name, term.name) for term in score.top_terms(3)]
    required = ", ".join(sorted(cap.value for cap in spec.required_caps)) or "text"
    return (
        f"{score.model_id} scored {score.total:.0f} for a task requiring {required}: "
        f"it {top[0]}"
        + (f", {top[1]}" if len(top) > 1 else "")
        + (f" and {top[2]}" if len(top) > 2 else "")
        + "."
    )
