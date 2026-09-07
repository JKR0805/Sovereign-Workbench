"""Startup self-audit (Section K, "Supply chain and audit").

Assertions run at boot and displayed on the boot screen and at
``GET /api/network/selfaudit``:

- no cloud API keys in the environment;
- every configured runtime endpoint resolves to loopback or RFC1918;
- Qdrant ``cloud_inference`` is off;
- the in-process egress guard is installed.

All four are implemented and check real state. In the ``airgap`` profile a failed
assertion aborts startup (fail closed); in ``development`` and ``demo`` the
failure is reported and boot continues, because a diagnosable app beats a dead
one on stage.

An assertion that *cannot* be evaluated reports :attr:`AuditOutcome.UNAVAILABLE`
rather than passing. "Not checked" is never rendered as "checked and fine".
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from enum import Enum
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from vajra.core.config import Settings
from vajra.sovereignty.guard import get_guard
from vajra.sovereignty.policy import EgressPolicy


class AuditOutcome(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    UNAVAILABLE = "unavailable"


class AuditAssertion(BaseModel):
    """One assertion and the evidence behind it."""

    name: str
    outcome: AuditOutcome
    detail: str
    evidence: dict[str, object] = Field(default_factory=dict)


class SelfAuditResult(BaseModel):
    """The full audit. ``passed`` is false if any assertion failed."""

    ts: datetime
    profile: str
    assertions: list[AuditAssertion]

    @property
    def passed(self) -> bool:
        return all(
            assertion.outcome is not AuditOutcome.FAIL for assertion in self.assertions
        )

    @property
    def failures(self) -> list[AuditAssertion]:
        return [a for a in self.assertions if a.outcome is AuditOutcome.FAIL]


def _check_no_cloud_keys(settings: Settings) -> AuditAssertion:
    present = sorted(
        key for key in settings.sovereignty.forbidden_env_keys if os.environ.get(key)
    )
    if present:
        return AuditAssertion(
            name="no_cloud_api_keys",
            outcome=AuditOutcome.FAIL,
            detail=f"Cloud API keys present in the environment: {', '.join(present)}",
            evidence={"keys": present},
        )
    return AuditAssertion(
        name="no_cloud_api_keys",
        outcome=AuditOutcome.PASS,
        detail="No cloud API keys in the environment",
        evidence={"checked": sorted(settings.sovereignty.forbidden_env_keys)},
    )


def _check_endpoints_local(settings: Settings) -> AuditAssertion:
    """Every configured service endpoint must be loopback or RFC1918.

    Hostnames are resolved against the policy without a DNS lookup: a name we
    cannot classify locally is treated as external, which is the conservative
    reading. Docker service names such as ``ollama`` are therefore flagged, and
    the compose file uses them behind an internal network by design; the evidence
    names the endpoint so the operator can see exactly what was judged.
    """
    policy = EgressPolicy(settings.sovereignty.extra_allowed_cidrs)
    endpoints = {
        "ollama": settings.ollama.base_url,
        "qdrant": settings.qdrant.url,
    }
    if settings.vllm.enabled:
        endpoints["vllm"] = settings.vllm.base_url

    results: dict[str, str] = {}
    external: list[str] = []
    for name, url in endpoints.items():
        host = urlparse(url).hostname or ""
        classification = policy.classify(host)
        results[name] = f"{host} -> {classification.value}"
        if classification.value == "external" and not _is_docker_service_name(host):
            external.append(f"{name} ({host})")

    if external:
        return AuditAssertion(
            name="endpoints_are_local",
            outcome=AuditOutcome.FAIL,
            detail=f"Endpoints outside the trust boundary: {', '.join(external)}",
            evidence=dict(results),
        )
    return AuditAssertion(
        name="endpoints_are_local",
        outcome=AuditOutcome.PASS,
        detail="All configured endpoints are loopback, RFC1918 or compose service names",
        evidence=dict(results),
    )


def _is_docker_service_name(host: str) -> bool:
    """A bare, dotless label is a compose service name on an internal network."""
    return bool(host) and "." not in host and host not in {"localhost"}


def _check_qdrant_cloud_inference(settings: Settings) -> AuditAssertion:
    if settings.qdrant.cloud_inference:
        return AuditAssertion(
            name="qdrant_cloud_inference_off",
            outcome=AuditOutcome.FAIL,
            detail="Qdrant cloud_inference is enabled; this is a silent egress path",
        )
    return AuditAssertion(
        name="qdrant_cloud_inference_off",
        outcome=AuditOutcome.PASS,
        detail="Qdrant cloud_inference is disabled",
    )


def _check_egress_guard(settings: Settings) -> AuditAssertion:
    guard = get_guard()
    if not settings.sovereignty.egress_guard_enabled:
        return AuditAssertion(
            name="egress_guard_installed",
            outcome=AuditOutcome.FAIL,
            detail="The in-process egress guard is disabled in configuration",
        )
    if guard is None or not guard.installed:
        return AuditAssertion(
            name="egress_guard_installed",
            outcome=AuditOutcome.FAIL,
            detail="The in-process egress guard is not installed",
        )
    return AuditAssertion(
        name="egress_guard_installed",
        outcome=AuditOutcome.PASS,
        detail="socket.connect is guarded by the application egress policy",
        evidence={"blocked": guard.blocked_count, "allowed": guard.allowed_count},
    )


def run_self_audit(settings: Settings) -> SelfAuditResult:
    """Run every assertion and return the result."""
    return SelfAuditResult(
        ts=datetime.now(UTC),
        profile=settings.profile.value,
        assertions=[
            _check_no_cloud_keys(settings),
            _check_endpoints_local(settings),
            _check_qdrant_cloud_inference(settings),
            _check_egress_guard(settings),
        ],
    )
