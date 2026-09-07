"""Policy overlay (Section F, stage 4).

Policies are declarative constraints applied *after* scoring::

    policies:
      - name: "Vision work stays on verified VLMs"
        when: { required_caps_contains: vision }
        require_capability_verified: true
      - name: "Confidential class A"
        when: { document_classification: restricted }
        require: { runtime_kind: ollama, host_is_loopback: true }

``prefer`` lists model ids. That is not a violation of "the router contains no
model names": the *code* names no model, and the ids come from an operator-authored
policy row stored in the database, exactly like the registry ids the router
already handles. What the router must never do is embed one in a source file.

The policy vocabulary is deliberately small and closed. An unknown key is a
validation error rather than a silently ignored rule, because a policy that
quietly does nothing is worse than one that fails loudly.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from vajra.core.enums import Capability, RuntimeKind
from vajra.core.exceptions import ValidationError
from vajra.router.models import (
    CandidateScore,
    ModelCandidate,
    RejectedModel,
    RejectionReason,
    ScoringWeights,
    TaskSpec,
)

#: Bonus added to a preferred model's score. Large enough to reorder near-ties,
#: small enough that a preference cannot beat a genuine capability mismatch.
PREFERENCE_BONUS = 10.0

WHEN_KEYS = frozenset(
    {"required_caps_contains", "intent", "complexity", "document_classification"}
)
REQUIRE_KEYS = frozenset({"runtime_kind", "host_is_loopback", "device"})


class PolicyCondition(BaseModel):
    """The ``when`` clause. All present keys must match."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    required_caps_contains: Capability | None = None
    intent: str | None = None
    complexity: str | None = None
    document_classification: str | None = None

    def matches(self, spec: TaskSpec, task_labels: dict[str, str]) -> bool:
        if (
            self.required_caps_contains is not None
            and self.required_caps_contains not in spec.required_caps
        ):
            return False
        if self.intent is not None and spec.intent.value != self.intent:
            return False
        if self.complexity is not None and spec.complexity.value != self.complexity:
            return False
        if self.document_classification is not None:
            if task_labels.get("document_classification") != self.document_classification:
                return False
        return True


class PolicyRequirement(BaseModel):
    """The ``require`` clause. A candidate failing any key is excluded."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    runtime_kind: RuntimeKind | None = None
    host_is_loopback: bool | None = None
    device: str | None = None

    def satisfied_by(self, candidate: ModelCandidate) -> tuple[bool, str]:
        if self.runtime_kind is not None and candidate.runtime_kind is not self.runtime_kind:
            return False, f"policy requires runtime_kind={self.runtime_kind.value}"
        if (
            self.host_is_loopback is not None
            and candidate.host_is_loopback is not self.host_is_loopback
        ):
            return False, f"policy requires host_is_loopback={self.host_is_loopback}"
        return True, ""


class RoutingPolicy(BaseModel):
    """One declarative policy."""

    model_config = ConfigDict(extra="forbid")

    name: str
    enabled: bool = True
    priority: int = 50
    when: PolicyCondition = PolicyCondition()
    require: PolicyRequirement = PolicyRequirement()
    prefer: list[str] = Field(default_factory=list)
    require_capability_verified: bool = False
    weights: ScoringWeights | None = None

    @field_validator("prefer")
    @classmethod
    def _dedupe(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for item in value:
            if item not in seen:
                seen.append(item)
        return seen


class PolicyOutcome(BaseModel):
    """What the overlay did. Feeds ``RoutingDecision.policy_applied``."""

    applied: str | None = None
    excluded: list[RejectedModel] = Field(default_factory=list)
    weights: ScoringWeights | None = None
    require_capability_verified: bool = False
    preferred: list[str] = Field(default_factory=list)


def parse_policy(raw: dict[str, Any]) -> RoutingPolicy:
    """Validate a stored policy row. Unknown keys fail loudly."""
    when = raw.get("when") or {}
    require = raw.get("require") or {}
    if unknown := set(when) - WHEN_KEYS:
        raise ValidationError(
            f"Unknown policy 'when' keys: {sorted(unknown)}", allowed=sorted(WHEN_KEYS)
        )
    if unknown := set(require) - REQUIRE_KEYS:
        raise ValidationError(
            f"Unknown policy 'require' keys: {sorted(unknown)}", allowed=sorted(REQUIRE_KEYS)
        )
    try:
        return RoutingPolicy.model_validate(raw)
    except Exception as exc:  # pydantic validation detail is the useful part
        raise ValidationError(f"Invalid routing policy: {exc}") from exc


def select_policy(
    policies: Sequence[RoutingPolicy], spec: TaskSpec, task_labels: dict[str, str] | None = None
) -> RoutingPolicy | None:
    """Highest-priority enabled policy whose condition matches, or ``None``."""
    labels = task_labels or {}
    matching = [
        policy for policy in policies if policy.enabled and policy.when.matches(spec, labels)
    ]
    if not matching:
        return None
    matching.sort(key=lambda policy: (-policy.priority, policy.name))
    return matching[0]


def apply_requirements(
    policy: RoutingPolicy, candidates: Sequence[ModelCandidate]
) -> tuple[list[ModelCandidate], list[RejectedModel]]:
    """Exclude candidates that fail the policy's ``require`` clause."""
    kept: list[ModelCandidate] = []
    excluded: list[RejectedModel] = []
    for candidate in candidates:
        ok, detail = policy.require.satisfied_by(candidate)
        if ok:
            kept.append(candidate)
        else:
            excluded.append(
                RejectedModel(
                    model_id=candidate.model_id,
                    reason=RejectionReason.POLICY_EXCLUDED,
                    detail=f"{detail} ({policy.name})",
                )
            )
    return kept, excluded


def apply_preferences(
    policy: RoutingPolicy, scores: Sequence[CandidateScore]
) -> list[CandidateScore]:
    """Add the preference bonus and re-sort. Returns new objects; scores are frozen."""
    if not policy.prefer:
        return list(scores)
    adjusted = [
        score.model_copy(
            update={
                "total": score.total + PREFERENCE_BONUS,
                "policy_bonus": PREFERENCE_BONUS,
            }
        )
        if score.model_id in policy.prefer
        else score
        for score in scores
    ]
    adjusted.sort(key=lambda score: (-score.total, score.model_id))
    return adjusted
