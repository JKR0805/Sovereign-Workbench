"""Address classification and the egress decision (Section K, layers 1 and 4).

The trust boundary is defined once, here: loopback, RFC1918, link-local, the
Docker bridge ranges, and anything an operator explicitly adds. Everything else
is external.

This module has no I/O and no dependency beyond the standard library, because
:mod:`vajra.sovereignty.guard` must be importable before any third-party package.
"""

from __future__ import annotations

import ipaddress
from datetime import UTC, datetime
from typing import NamedTuple

from vajra.core.enums import AddressClass, EgressLayer, EgressVerdict

#: Loopback and the private ranges. Docker's default bridge pools (172.17/16
#: upwards) fall inside 172.16.0.0/12 and are therefore already covered.
_DEFAULT_ALLOWED = (
    "127.0.0.0/8",
    "::1/128",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "169.254.0.0/16",
    "fe80::/10",
    "fc00::/7",
)

_LOCAL_NETWORKS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
)


class EgressAttempt(NamedTuple):
    """A connection this process is about to make."""

    host: str
    port: int
    ts: datetime
    stack_frame: str | None = None
    process: str | None = None


class EgressDecision(NamedTuple):
    """The verdict on an attempt, with the reason it was reached."""

    verdict: EgressVerdict
    address_class: AddressClass
    layer: EgressLayer
    reason: str


class EgressPolicy:
    """Decides whether a destination is inside the trust boundary."""

    def __init__(self, extra_allowed_cidrs: list[str] | None = None) -> None:
        networks = list(_DEFAULT_ALLOWED) + list(extra_allowed_cidrs or [])
        self._allowed = [ipaddress.ip_network(cidr, strict=False) for cidr in networks]

    def classify(self, host: str) -> AddressClass:
        """Classify a destination.

        A hostname that is not an IP literal is ``EXTERNAL``: resolving it would
        itself be a DNS egress, and a name we cannot classify without leaving the
        machine is exactly what the boundary exists to stop.
        """
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            return AddressClass.EXTERNAL

        if any(address in network for network in _LOCAL_NETWORKS):
            return AddressClass.LOCAL
        if any(address in network for network in self._allowed):
            return AddressClass.INTERNAL
        return AddressClass.EXTERNAL

    def decide(self, host: str, port: int) -> EgressDecision:
        """Allow or block a destination."""
        address_class = self.classify(host)
        if address_class is AddressClass.EXTERNAL:
            return EgressDecision(
                verdict=EgressVerdict.BLOCK,
                address_class=address_class,
                layer=EgressLayer.APP,
                reason=f"{host}:{port} is outside the trust boundary",
            )
        return EgressDecision(
            verdict=EgressVerdict.ALLOW,
            address_class=address_class,
            layer=EgressLayer.APP,
            reason=f"{host}:{port} is {address_class.value}",
        )

    def is_allowed(self, host: str) -> bool:
        return self.classify(host) is not AddressClass.EXTERNAL


def now() -> datetime:
    return datetime.now(UTC)
