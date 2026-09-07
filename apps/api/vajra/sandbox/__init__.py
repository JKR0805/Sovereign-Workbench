"""Docker sandbox: isolation policy, static guard, execution.

Section J. The guard and the policy are implemented; the container lifecycle is
not, and refuses to run code rather than running it with weaker isolation.
"""

from vajra.sandbox.docker import DockerSandbox
from vajra.sandbox.guard import DENIED_CALLS, DENIED_MODULES, enforce, scan
from vajra.sandbox.models import (
    GuardFinding,
    NetworkPolicy,
    ResourceLimits,
    SandboxPolicy,
    SandboxRequest,
    SandboxResult,
    SandboxStatus,
)
from vajra.sandbox.policy import build_policy, container_arguments

__all__ = [
    "DENIED_CALLS",
    "DENIED_MODULES",
    "DockerSandbox",
    "GuardFinding",
    "NetworkPolicy",
    "ResourceLimits",
    "SandboxPolicy",
    "SandboxRequest",
    "SandboxResult",
    "SandboxStatus",
    "build_policy",
    "container_arguments",
    "enforce",
    "scan",
]
