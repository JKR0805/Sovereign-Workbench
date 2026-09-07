"""Sandbox contracts (Section J)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ResourceLimits(BaseModel):
    """Hard limits applied to the container. Defaults are the policy of Section J."""

    model_config = ConfigDict(frozen=True)

    mem_limit: str = "1g"
    memswap_limit: str = "1g"
    cpu_cores: float = 2.0
    pids_limit: int = 128
    wall_clock_timeout_s: int = 30
    output_truncate_bytes: int = 256 * 1024


class FilesystemPolicy(BaseModel):
    """Immutable rootfs, a noexec tmpfs, and one writable work mount."""

    model_config = ConfigDict(frozen=True)

    read_only_rootfs: bool = True
    tmpfs_mounts: dict[str, str] = Field(default_factory=lambda: {"/tmp": "size=64m,noexec"})
    work_dir: str = "/work"
    work_dir_writable: bool = True
    allowed_input_files: list[str] = Field(default_factory=list)


class NetworkPolicy(BaseModel):
    """No interfaces at all, not merely no route (Section J).

    ``network_disabled`` is not a tunable. It is expressed as a field so the
    Tools page can display the value it was actually run with, and so a test can
    assert it, not so an operator can turn it off.
    """

    model_config = ConfigDict(frozen=True)

    network_disabled: bool = True
    network_mode: str = "none"


class SecurityPolicy(BaseModel):
    model_config = ConfigDict(frozen=True)

    user: str = "65534:65534"
    cap_drop: list[str] = Field(default_factory=lambda: ["ALL"])
    no_new_privileges: bool = True
    seccomp_profile_path: str | None = None


class SandboxPolicy(BaseModel):
    """The complete isolation policy applied to every execution."""

    model_config = ConfigDict(frozen=True)

    image: str = "vajra-sandbox:py311"
    limits: ResourceLimits = ResourceLimits()
    filesystem: FilesystemPolicy = FilesystemPolicy()
    network: NetworkPolicy = NetworkPolicy()
    security: SecurityPolicy = SecurityPolicy()


class SandboxRequest(BaseModel):
    """A unit of code to execute, with the files it may read."""

    model_config = ConfigDict(frozen=True)

    code: str
    files: dict[str, str] = Field(default_factory=dict)
    """Filename to host path. Copied in; the sandbox never mounts a host directory."""

    entrypoint: str = "main.py"
    run_id: str | None = None
    step_id: str | None = None


class SandboxResult(BaseModel):
    """Real captured output. Nothing here is ever synthesised."""

    model_config = ConfigDict(frozen=True)

    exit_code: int
    stdout: str = ""
    stderr: str = ""
    truncated: bool = False
    timed_out: bool = False
    duration_ms: float = 0.0
    files_created: list[str] = Field(default_factory=list)
    container_id: str | None = None


class SandboxStatus(BaseModel):
    """What ``GET /api/sandbox/status`` reports.

    ``available`` is measured by pinging the Docker daemon, never assumed.
    """

    available: bool
    detail: str
    image: str
    image_present: bool | None = None
    policy: SandboxPolicy


class GuardFinding(BaseModel):
    """One rejection from the static AST guard."""

    model_config = ConfigDict(frozen=True)

    rule: str
    symbol: str
    line: int
    detail: str
