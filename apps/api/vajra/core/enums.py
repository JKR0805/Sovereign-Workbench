"""Enumerations shared across every layer.

These live in ``core`` rather than in the subsystem that owns them because the
persistence layer (``store``) must be able to type its columns without importing
a higher layer. ``registry.capabilities`` re-exports :class:`Capability` and owns
all capability *logic*; this module owns only the vocabulary.
"""

from __future__ import annotations

from enum import Enum


class RuntimeKind(str, Enum):
    """Wire protocol family of a model runtime."""

    OLLAMA = "ollama"
    VLLM = "vllm"
    OPENAI_COMPATIBLE = "openai_compatible"


class Capability(str, Enum):
    """What a model is good at. Declared in the registry, verified by probing.

    Capabilities are *data*. The router reads them; it never reads a model name.
    """

    TEXT = "text"
    REASONING = "reasoning"
    CODING = "coding"
    VISION = "vision"
    DOC_UNDERSTANDING = "doc_understanding"
    TOOL_CALLING = "tool_calling"
    STRUCTURED_OUTPUT = "structured_output"
    LONG_CONTEXT = "long_context"
    EMBEDDING = "embedding"
    RERANKING = "reranking"


class VerificationState(str, Enum):
    """Whether a *declared* capability has been proven by a probe."""

    DECLARED = "declared"
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    FAILED = "failed"


class HealthState(str, Enum):
    """Measured liveness of a runtime or a model."""

    UNKNOWN = "unknown"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class Modality(str, Enum):
    """Accepted input modality."""

    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"


class ComputeDevice(str, Enum):
    """Where a model executes. Section V makes this per-model configuration."""

    GPU = "gpu"
    CPU = "cpu"


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepStatus(str, Enum):
    WAITING = "waiting"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ExecutionMode(str, Enum):
    """How a run is executed.

    ``DEMO`` is the deterministic scaffold path: it performs no model inference
    and exists to prove the event/SSE/persistence spine end to end. ``AGENT`` is
    the production path driven by :mod:`vajra.agent`; it is not implemented yet
    and fails explicitly rather than degrading to ``DEMO``.
    """

    DEMO = "demo"
    AGENT = "agent"


class DocumentStatus(str, Enum):
    PENDING = "pending"
    PARSING = "parsing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXED = "indexed"
    FAILED = "failed"


class ArtifactKind(str, Enum):
    DOCX = "docx"
    XLSX = "xlsx"
    PPTX = "pptx"
    PDF = "pdf"


class ToolSideEffect(str, Enum):
    NONE = "none"
    FILESYSTEM = "filesystem"
    COMPUTE = "compute"


class EgressVerdict(str, Enum):
    """Outcome of an egress decision."""

    ALLOW = "allow"
    BLOCK = "block"


class EgressLayer(str, Enum):
    """Which of the four enforcement layers produced a network event."""

    APP = "app"
    DOCKER = "docker"
    NFT = "nft"
    CONNECTION_AUDIT = "connection_audit"


class AddressClass(str, Enum):
    """Classification of a network peer, per Section K layer 4."""

    LOCAL = "local"
    INTERNAL = "internal"
    EXTERNAL = "external"
