"""Isolation policy construction (Section J).

Builds the :class:`~vajra.sandbox.models.SandboxPolicy` from settings and renders
it into the exact keyword arguments ``docker.containers.run`` needs.

Rendering the arguments here, separately from the executor, means the policy is
testable without a Docker daemon: a test can assert that ``network_disabled`` is
True and ``cap_drop`` is ``["ALL"]`` on a machine that has no Docker at all.

Do not weaken these defaults to make something work. If an execution needs a
capability the policy denies, the answer is that the execution does not happen.
"""

from __future__ import annotations

from typing import Any

from vajra.core.config import SandboxSettings
from vajra.sandbox.models import (
    FilesystemPolicy,
    NetworkPolicy,
    ResourceLimits,
    SandboxPolicy,
    SecurityPolicy,
)

_NANO_CPU = 1_000_000_000


def build_policy(settings: SandboxSettings) -> SandboxPolicy:
    """Assemble the policy from configuration."""
    return SandboxPolicy(
        image=settings.image,
        limits=ResourceLimits(
            mem_limit=settings.mem_limit,
            memswap_limit=settings.mem_limit,
            cpu_cores=settings.cpu_cores,
            pids_limit=settings.pids_limit,
            wall_clock_timeout_s=settings.wall_clock_timeout_s,
            output_truncate_bytes=settings.output_truncate_bytes,
        ),
        filesystem=FilesystemPolicy(
            tmpfs_mounts={"/tmp": f"size={settings.tmpfs_size},noexec"},
        ),
        network=NetworkPolicy(),
        security=SecurityPolicy(
            user=settings.run_as_user,
            seccomp_profile_path=(
                str(settings.seccomp_profile_path) if settings.seccomp_profile_path else None
            ),
        ),
    )


def container_arguments(policy: SandboxPolicy, work_dir: str) -> dict[str, Any]:
    """Render the policy as ``docker.containers.run`` keyword arguments.

    Mirrors the block in Section J exactly. ``work_dir`` is a host path created
    per execution; the sandbox never sees anything else from the host.
    """
    security_opt = []
    if policy.security.no_new_privileges:
        security_opt.append("no-new-privileges:true")
    if policy.security.seccomp_profile_path:
        security_opt.append(f"seccomp={policy.security.seccomp_profile_path}")

    return {
        "image": policy.image,
        "command": ["python", f"{policy.filesystem.work_dir}/main.py"],
        "network_disabled": policy.network.network_disabled,
        "network_mode": policy.network.network_mode,
        "mem_limit": policy.limits.mem_limit,
        "memswap_limit": policy.limits.memswap_limit,
        "nano_cpus": int(policy.limits.cpu_cores * _NANO_CPU),
        "pids_limit": policy.limits.pids_limit,
        "read_only": policy.filesystem.read_only_rootfs,
        "tmpfs": dict(policy.filesystem.tmpfs_mounts),
        "volumes": {
            work_dir: {"bind": policy.filesystem.work_dir, "mode": "rw"},
        },
        "user": policy.security.user,
        "cap_drop": list(policy.security.cap_drop),
        "security_opt": security_opt,
        "detach": True,
    }
