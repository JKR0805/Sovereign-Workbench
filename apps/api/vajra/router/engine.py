"""The routing engine: classification, filtering, scoring, policy, fallback.

A pure function of its inputs. It takes candidates and a context; it does not
read the database, call a runtime, or touch HTTP. That is what makes every
routing rule testable without infrastructure, and what keeps the router
model-agnostic: it never sees a display name and cannot match on one.

Pipeline (Section F)::

    classification -> hard filtering -> scoring -> policy overlay -> fallback
"""

from __future__ import annotations

import time
from collections.abc import Sequence

from vajra.core.exceptions import NoCandidateModels
from vajra.router.classify import Attachment, LexiconTaskClassifier, TaskClassifier
from vajra.router.filters import apply_hard_filters
from vajra.router.models import (
    CandidateScore,
    ModelCandidate,
    RejectedModel,
    RoutingContext,
    RoutingDecision,
    ScoringWeights,
    TaskSpec,
)
from vajra.router.policy import (
    PolicyOutcome,
    RoutingPolicy,
    apply_preferences,
    apply_requirements,
    select_policy,
)
from vajra.router.scoring import build_rationale, score_all

#: How many alternates to carry in ``RoutingDecision.fallbacks``.
MAX_FALLBACKS = 3


class RouterEngine:
    """Turns a task and a candidate fleet into an explainable decision."""

    def __init__(
        self,
        *,
        classifier: TaskClassifier | None = None,
        default_weights: ScoringWeights | None = None,
    ) -> None:
        self._classifier = classifier or LexiconTaskClassifier()
        self._default_weights = default_weights or ScoringWeights()

    async def classify(
        self, task_id: str, prompt: str, attachments: Sequence[Attachment] = ()
    ) -> TaskSpec:
        """Stage 1. Delegates to the configured classifier."""
        return await self._classifier.classify(task_id, prompt, attachments)

    def route(
        self,
        spec: TaskSpec,
        candidates: Sequence[ModelCandidate],
        context: RoutingContext | None = None,
        *,
        policies: Sequence[RoutingPolicy] = (),
        weights: ScoringWeights | None = None,
        task_labels: dict[str, str] | None = None,
    ) -> RoutingDecision:
        """Stages 2 to 5. Raises :class:`NoCandidateModels` when nothing survives."""
        started = time.perf_counter()
        routing_context = context or RoutingContext()

        policy = select_policy(policies, spec, task_labels)
        outcome = PolicyOutcome()
        pool = list(candidates)

        if policy is not None:
            outcome.applied = policy.name
            outcome.weights = policy.weights
            outcome.require_capability_verified = policy.require_capability_verified
            outcome.preferred = list(policy.prefer)
            pool, outcome.excluded = apply_requirements(policy, pool)

        survivors, rejected = apply_hard_filters(
            pool,
            spec,
            routing_context,
            require_verified_capabilities=outcome.require_capability_verified,
        )
        rejected = [*outcome.excluded, *rejected]

        if not survivors:
            raise NoCandidateModels(
                "Every registered model was eliminated by the hard filters.",
                task_id=spec.task_id,
                required_capabilities=sorted(cap.value for cap in spec.required_caps),
                rejected=[rejection.model_dump(mode="json") for rejection in rejected],
            )

        effective_weights = weights or outcome.weights or self._default_weights
        scores = score_all(survivors, spec, routing_context, effective_weights)
        if policy is not None:
            scores = apply_preferences(policy, scores)

        winner = scores[0]
        elapsed_ms = (time.perf_counter() - started) * 1000

        return RoutingDecision(
            task_id=spec.task_id,
            selected=winner.model_id,
            score=winner.total,
            rationale=build_rationale(winner, spec),
            candidates=scores,
            rejected=rejected,
            fallbacks=_fallbacks(scores),
            policy_applied=outcome.applied,
            weights=effective_weights,
            decided_in_ms=elapsed_ms,
        )


def _fallbacks(scores: Sequence[CandidateScore]) -> list[str]:
    """Ordered alternates after the winner (Section F, stage 5)."""
    return [score.model_id for score in scores[1 : 1 + MAX_FALLBACKS]]


def rejection_summary(rejected: Sequence[RejectedModel]) -> dict[str, int]:
    """Rejection counts by reason. Used by the run inspector's collapsed list."""
    summary: dict[str, int] = {}
    for rejection in rejected:
        summary[rejection.reason.value] = summary.get(rejection.reason.value, 0) + 1
    return summary
