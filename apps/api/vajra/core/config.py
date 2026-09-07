"""Configuration.

Profiles (Section K / Section Q):

``development``
    Local iteration. Optional subsystems may be missing; they report themselves
    unavailable rather than failing the boot.
``demo``
    Rehearsal and stage. The startup self-audit runs and its findings are shown,
    but a failed assertion does not prevent boot (you want a diagnosable app on
    stage, not a dead one).
``airgap``
    Fail closed. A failed self-audit assertion aborts startup.

Every value is overridable by environment variable using the ``VAJRA_`` prefix
and ``__`` as the nesting delimiter, e.g. ``VAJRA_OLLAMA__BASE_URL``. Paths
default to locations relative to the repository root; no machine-specific
absolute path is ever hardcoded.
"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_data_dir() -> Path:
    """Repository ``data/`` directory.

    This file is ``<repo>/apps/api/vajra/core/config.py``, so four parents up is
    the repository root.
    """
    return Path(__file__).resolve().parents[4] / "data"


class Profile(str, Enum):
    DEVELOPMENT = "development"
    DEMO = "demo"
    AIRGAP = "airgap"


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class DatabaseSettings(BaseModel):
    """SQLite, WAL mode (Section D, "Persistence")."""

    path: Path = Field(default_factory=lambda: _default_data_dir() / "sqlite" / "vajra.db")
    echo: bool = False
    busy_timeout_ms: int = 5_000

    @property
    def url(self) -> str:
        return f"sqlite+aiosqlite:///{self.path.as_posix()}"


class OllamaSettings(BaseModel):
    base_url: str = "http://127.0.0.1:11434"
    request_timeout_s: float = 300.0
    connect_timeout_s: float = 5.0
    # Section V: single-resident policy on constrained hardware.
    keep_alive: str = "30m"
    max_loaded_models: int = 1


class QdrantSettings(BaseModel):
    url: str = "http://127.0.0.1:6333"
    collection: str = "vajra_kb"
    request_timeout_s: float = 30.0
    path: Path | None = None
    # Section G, "Critical sovereignty detail": must never be True.
    cloud_inference: bool = False

    @field_validator("cloud_inference")
    @classmethod
    def _forbid_cloud_inference(cls, value: bool) -> bool:
        if value:
            raise ValueError(
                "qdrant.cloud_inference must be False: it is a silent egress path "
                "(Implementation Plan, Section G)"
            )
        return value


class VLLMSettings(BaseModel):
    """Optional OpenAI-compatible runtime for the high-performance profile."""

    enabled: bool = False
    base_url: str = "http://127.0.0.1:8001"
    api_key: str | None = None
    request_timeout_s: float = 300.0


class PathSettings(BaseModel):
    data_dir: Path = Field(default_factory=_default_data_dir)
    uploads_dir: Path | None = None
    artifacts_dir: Path | None = None
    page_images_dir: Path | None = None
    config_dir: Path | None = None

    def resolved(self) -> PathSettings:
        """Fill unset sub-directories relative to ``data_dir``."""
        return PathSettings(
            data_dir=self.data_dir,
            uploads_dir=self.uploads_dir or self.data_dir / "uploads",
            artifacts_dir=self.artifacts_dir or self.data_dir / "artifacts",
            page_images_dir=self.page_images_dir or self.data_dir / "page_images",
            config_dir=self.config_dir or self.data_dir.parent / "config",
        )


class EventSettings(BaseModel):
    """Event bus and SSE tuning (Section D, "The event system")."""

    subscriber_queue_size: int = 1024
    sse_keepalive_s: float = 15.0
    sse_replay_batch: int = 500
    # Recent events kept per stream in memory, for diagnostics only. The
    # authoritative log is the ``events`` table.
    memory_ring_size: int = 256


class SovereigntySettings(BaseModel):
    """Section K. Layers needing Linux privileges declare themselves unavailable."""

    # Layer 1: in-process socket guard.
    egress_guard_enabled: bool = True
    # Loopback, RFC1918 and Docker bridge ranges are always allowed.
    extra_allowed_cidrs: list[str] = Field(default_factory=list)
    # Layer 3: nftables. Requires Linux and CAP_NET_ADMIN.
    nftables_enabled: bool = False
    nftables_table: str = "vajra"
    kernel_log_path: Path = Path("/var/log/kern.log")
    nft_log_prefix: str = "VAJRA-EGRESS-BLOCK"
    # Layer 4: psutil connection audit.
    connection_audit_enabled: bool = True
    connection_audit_interval_s: float = 1.0
    # Startup self-audit.
    selfaudit_enabled: bool = True
    forbidden_env_keys: list[str] = Field(
        default_factory=lambda: [
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "HF_TOKEN",
            "HUGGINGFACE_TOKEN",
            "GOOGLE_API_KEY",
            "COHERE_API_KEY",
        ]
    )
    # Destination used by POST /api/network/probe (the "Attempt External Call" button).
    probe_target_url: str = "https://api.openai.com/v1/models"


class SandboxSettings(BaseModel):
    """Section J. Defaults encode the isolation policy; do not weaken them."""

    enabled: bool = False
    image: str = "vajra-sandbox:py311"
    docker_host: str | None = None
    wall_clock_timeout_s: int = 30
    mem_limit: str = "1g"
    cpu_cores: float = 2.0
    pids_limit: int = 128
    output_truncate_bytes: int = 256 * 1024
    tmpfs_size: str = "64m"
    run_as_user: str = "65534:65534"
    seccomp_profile_path: Path | None = None


class RagSettings(BaseModel):
    enabled: bool = True
    embedding_model: str = "bge-m3"
    reranker_model: str = "bge-reranker-v2-m3"
    rerank_enabled: bool = True
    # Section G: structure-aware chunking.
    chunk_target_tokens: int = 700
    chunk_overlap_ratio: float = 0.15
    # Section I: text-layer coverage below this fraction means "scanned".
    scanned_page_coverage_threshold: float = 0.15
    page_render_dpi: int = 200
    retrieve_prefetch_limit: int = 40
    retrieve_fused_limit: int = 20
    rerank_top_k: int = 5
    rrf_k: int = 60


class AgentSettings(BaseModel):
    """Section H, "Hard budgets, enforced and displayed"."""

    max_steps: int = 8
    max_tool_calls: int = 12
    max_wall_clock_s: float = 240.0
    max_repairs: int = 2


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="VAJRA_",
        env_nested_delimiter="__",
        env_file=(".env", "../../.env"),
        extra="ignore",
    )

    profile: Profile = Profile.DEVELOPMENT
    model_profile: str = "laptop-8gb"
    log_level: LogLevel = LogLevel.INFO
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    paths: PathSettings = Field(default_factory=PathSettings)
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    ollama: OllamaSettings = Field(default_factory=OllamaSettings)
    vllm: VLLMSettings = Field(default_factory=VLLMSettings)
    qdrant: QdrantSettings = Field(default_factory=QdrantSettings)
    events: EventSettings = Field(default_factory=EventSettings)
    sovereignty: SovereigntySettings = Field(default_factory=SovereigntySettings)
    sandbox: SandboxSettings = Field(default_factory=SandboxSettings)
    rag: RagSettings = Field(default_factory=RagSettings)
    agent: AgentSettings = Field(default_factory=AgentSettings)

    @property
    def fail_closed(self) -> bool:
        """Airgap refuses to boot on a failed self-audit assertion."""
        return self.profile is Profile.AIRGAP

    def ensure_directories(self) -> None:
        """Create every writable directory this process needs."""
        paths = self.paths.resolved()
        for directory in (
            paths.data_dir,
            paths.uploads_dir,
            paths.artifacts_dir,
            paths.page_images_dir,
            self.database.path.parent,
            paths.data_dir / "qdrant",
        ):
            if directory is not None:
                directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton. Call ``get_settings.cache_clear()`` in tests."""
    return Settings()
