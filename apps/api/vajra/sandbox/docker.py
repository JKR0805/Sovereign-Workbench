"""Docker sandbox executor (Section J).

Implemented: :meth:`DockerSandbox.status`, which genuinely pings the Docker
daemon and reports whether the sandbox image is present. It reports what it
finds; it never assumes availability.

Not implemented: :meth:`DockerSandbox.execute`. Executing untrusted generated
code requires the full isolation policy to be applied correctly, the image to be
built offline from a pinned base, output truncation and a wall-clock kill. A
partial implementation of a sandbox is a security hazard, not a scaffold, so it
raises rather than running anything with weaker isolation.

The static guard in :mod:`vajra.sandbox.guard` and the policy rendering in
:mod:`vajra.sandbox.policy` are both complete and independently testable, so the
remaining work is the container lifecycle alone.
"""

from __future__ import annotations

from typing import Any

from vajra.core.config import SandboxSettings
from vajra.core.exceptions import InfrastructureUnavailable, NotImplementedYet
from vajra.sandbox.guard import enforce
from vajra.sandbox.models import SandboxPolicy, SandboxRequest, SandboxResult, SandboxStatus
from vajra.sandbox.policy import build_policy


def _load_docker() -> Any:
    try:
        import docker
    except ImportError as exc:
        raise InfrastructureUnavailable(
            "The docker SDK is not installed. Install the 'sandbox' extra to enable it.",
            extra="sandbox",
        ) from exc
    return docker


class DockerSandbox:
    """Container lifecycle for sandboxed code execution."""

    def __init__(self, settings: SandboxSettings) -> None:
        self._settings = settings
        self._policy: SandboxPolicy = build_policy(settings)

    @property
    def policy(self) -> SandboxPolicy:
        return self._policy

    def status(self) -> SandboxStatus:
        """Measure availability by talking to the daemon."""
        if not self._settings.enabled:
            return SandboxStatus(
                available=False,
                detail="Sandbox is disabled in configuration (VAJRA_SANDBOX__ENABLED).",
                image=self._policy.image,
                policy=self._policy,
            )
        try:
            docker = _load_docker()
        except InfrastructureUnavailable as exc:
            return SandboxStatus(
                available=False,
                detail=exc.detail,
                image=self._policy.image,
                policy=self._policy,
            )
        try:
            client = (
                docker.DockerClient(base_url=self._settings.docker_host)
                if self._settings.docker_host
                else docker.from_env()
            )
            client.ping()
            images = client.images.list(name=self._policy.image)
            present = bool(images)
        except Exception as exc:
            return SandboxStatus(
                available=False,
                detail=f"Docker daemon is not reachable: {exc}",
                image=self._policy.image,
                policy=self._policy,
            )
        return SandboxStatus(
            available=present,
            detail=(
                "Docker reachable and sandbox image present"
                if present
                else f"Docker reachable but image {self._policy.image!r} is not built"
            ),
            image=self._policy.image,
            image_present=present,
            policy=self._policy,
        )

    async def execute(self, request: SandboxRequest) -> SandboxResult:
        """Run code under the isolation policy.

        Not implemented. The static guard below runs first regardless, so a
        caller integrating this path gets the guard's behaviour immediately.
        """
        enforce(request.code)
        raise NotImplementedYet(
            "Sandbox execution is not implemented. Implementing it means creating a "
            "per-run work directory, copying the allowlisted files in, starting the "
            "container with sandbox.policy.container_arguments(), enforcing the "
            "wall-clock kill and truncating output. Executing code with anything less "
            "than the full policy would be a security regression.",
            image=self._policy.image,
            run_id=request.run_id,
        )
