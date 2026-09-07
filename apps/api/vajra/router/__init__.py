"""Capability-scoring router.

Section F. Contains zero model names by construction and by test
(``tests/unit/test_architecture.py::test_router_is_model_agnostic``).
"""

from vajra.router.classify import Attachment, LexiconTaskClassifier, TaskClassifier
from vajra.router.engine import RouterEngine
from vajra.router.models import (
    CandidateScore,
    ModelCandidate,
    RejectedModel,
    RejectionReason,
    RoutingContext,
    RoutingDecision,
    ScoringWeights,
    TaskFeatures,
    TaskIntent,
    TaskSpec,
)
from vajra.router.policy import RoutingPolicy, parse_policy

__all__ = [
    "Attachment",
    "CandidateScore",
    "LexiconTaskClassifier",
    "ModelCandidate",
    "RejectedModel",
    "RejectionReason",
    "RouterEngine",
    "RoutingContext",
    "RoutingDecision",
    "RoutingPolicy",
    "ScoringWeights",
    "TaskClassifier",
    "TaskFeatures",
    "TaskIntent",
    "TaskSpec",
    "parse_policy",
]
