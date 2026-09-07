"""Routing data contracts (Section F, "Output contract").

Nothing in ``vajra.router`` may name a model. These types describe *candidates*
and *requirements*; the identifiers they carry come from the registry at runtime.
``tests/unit/test_architecture.py`` greps this package for model family names.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from vajra.core.enums import Capability, HealthState, Modality, RuntimeKind


class TaskIntent(str, Enum):
    """Coarse intent. Drives template plan selection and preferred capabilities."""

    QUESTION_ANSWER = "question_answer"
    SUMMARISE = "summarise"
    EXTRACT = "extract"
    ANALYSE = "analyse"
    CODE = "code"
    DOCUMENT_GENERATION = "document_generation"
    UNKNOWN = "unknown"


class TaskComplexity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TaskFeatures(BaseModel):
    """Hard facts about a request (Section F, stage 1).

    These are extracted deterministically from the prompt and its attachments and
    **can never be overridden by a model**. A classifier may add intent and
    domain; it may not decide that an attached image is not an image.
    """

    model_config = ConfigDict(frozen=True)

    has_image_input: bool = False
    has_scanned_pages: bool = False
    has_tabular_input: bool = False
    has_code_input: bool = False
    estimated_input_tokens: int = 0
    attachment_types: list[str] = Field(default_factory=list)
    requires_file_output: bool = False


class TaskSpec(BaseModel):
    """What the task needs. The router's only input about the work itself."""

    model_config = ConfigDict(frozen=True)

    task_id: str
    prompt: str
    intent: TaskIntent = TaskIntent.UNKNOWN
    domain: str | None = None
    complexity: TaskComplexity = TaskComplexity.MEDIUM
    required_caps: frozenset[Capability] = frozenset()
    preferred_caps: frozenset[Capability] = frozenset()
    features: TaskFeatures = TaskFeatures()
    latency_budget_ms: float = 30_000.0
    classifier: str = "unclassified"
    """Which classifier produced this spec. Shown in the run inspector."""


class ModelCandidate(BaseModel):
    """A registry model, reduced to exactly what the router is allowed to see.

    Building candidates in the orchestrator rather than letting the router read
    the database is what keeps the router a pure, testable function. Note the
    absence of a display name: the router cannot accidentally match on one.
    """

    model_config = ConfigDict(frozen=True)

    model_id: str
    runtime_id: str
    runtime_kind: RuntimeKind
    capabilities: dict[Capability, float] = Field(default_factory=dict)
    verified_capabilities: frozenset[Capability] = frozenset()
    modalities_in: frozenset[Modality] = frozenset({Modality.TEXT})
    context_window: int = 0
    effective_context: int | None = None
    vram_gb: float = 0.0
    priority: int = 50
    enabled: bool = True
    health: HealthState = HealthState.UNKNOWN
    resident: bool = False
    host_is_loopback: bool = False
    avg_latency_ms: float | None = None
    request_count: int = 0
    error_count: int = 0

    @property
    def usable_context(self) -> int:
        """``num_ctx`` when the operator capped it, otherwise the model's window."""
        return self.effective_context or self.context_window

    @property
    def error_rate(self) -> float:
        return self.error_count / self.request_count if self.request_count else 0.0


class RoutingContext(BaseModel):
    """Hardware and fleet state at decision time.

    ``available_vram_gb`` and ``evictable_vram_gb`` are ``None`` when nothing has
    measured them. The VRAM filter is then skipped rather than run against a
    guessed number.
    """

    model_config = ConfigDict(frozen=True)

    available_vram_gb: float | None = None
    evictable_vram_gb: float | None = None
    resident_model_ids: frozenset[str] = frozenset()


class RejectionReason(str, Enum):
    """Why a model was eliminated. The UI renders these verbatim (Section F)."""

    DISABLED = "disabled"
    UNHEALTHY = "unhealthy"
    MISSING_CAPABILITY = "missing_capability"
    UNVERIFIED_CAPABILITY = "unverified_capability"
    MISSING_MODALITY = "missing_modality"
    CONTEXT_TOO_SMALL = "context_too_small"
    INSUFFICIENT_VRAM = "insufficient_vram"
    POLICY_EXCLUDED = "policy_excluded"


class RejectedModel(BaseModel):
    model_config = ConfigDict(frozen=True)

    model_id: str
    reason: RejectionReason
    detail: str


class ScoreTerm(BaseModel):
    """One weighted term of the score. Maps to one segment of the UI score bar."""

    model_config = ConfigDict(frozen=True)

    name: str
    value: float
    weight: float

    @property
    def contribution(self) -> float:
        return self.value * self.weight


class CandidateScore(BaseModel):
    model_config = ConfigDict(frozen=True)

    model_id: str
    total: float
    terms: list[ScoreTerm]
    resident: bool
    policy_bonus: float = 0.0

    def term(self, name: str) -> ScoreTerm | None:
        return next((term for term in self.terms if term.name == name), None)

    def top_terms(self, count: int = 3) -> list[ScoreTerm]:
        return sorted(self.terms, key=lambda term: term.contribution, reverse=True)[:count]


class ScoringWeights(BaseModel):
    """The seven weights of Section F, stage 3. Tunable from the Routing Studio."""

    model_config = ConfigDict(frozen=True)

    capability: float = 0.40
    preferred: float = 0.15
    context: float = 0.10
    latency: float = 0.10
    priority: float = 0.10
    residency: float = 0.10
    reliability: float = 0.05

    def as_mapping(self) -> dict[str, float]:
        return self.model_dump()

    @property
    def total(self) -> float:
        return sum(self.model_dump().values())


class RoutingDecision(BaseModel):
    """The router's output. Everything the run inspector needs, in one object."""

    model_config = ConfigDict(frozen=True)

    task_id: str
    selected: str
    score: float
    rationale: str
    candidates: list[CandidateScore] = Field(default_factory=list)
    rejected: list[RejectedModel] = Field(default_factory=list)
    fallbacks: list[str] = Field(default_factory=list)
    policy_applied: str | None = None
    weights: ScoringWeights = ScoringWeights()
    decided_in_ms: float = 0.0
