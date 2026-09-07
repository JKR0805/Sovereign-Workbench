"""Layer 4: live connection audit (Section K).

Polls ``psutil.net_connections(kind="inet")`` and classifies every established
connection as LOCAL, INTERNAL or EXTERNAL. Implemented for real: these are the
machine's actual sockets, and during the demo the table should show only
127.0.0.1 and 172.x entries.

``psutil.net_connections`` needs elevated privileges on some platforms (notably
macOS, and Linux when inspecting other users' sockets). When it is denied, the
snapshot reports :attr:`ConnectionSnapshot.available` as False with the reason.
It never falls back to counting zero, because "no external connections" and "we
could not look" are entirely different claims and only one of them is evidence.
"""

from __future__ import annotations

from datetime import UTC, datetime

import psutil
from pydantic import BaseModel, Field

from vajra.core.enums import AddressClass
from vajra.sovereignty.policy import EgressPolicy


class ConnectionRow(BaseModel):
    """One row of the Network page connection table."""

    pid: int | None = None
    process: str | None = None
    laddr: str | None = None
    raddr: str | None = None
    status: str | None = None
    classification: AddressClass


class ConnectionSnapshot(BaseModel):
    """A poll of the machine's inet sockets.

    Counts are ``None`` when the poll could not run. Reporting 0 in that case
    would be a fabricated sovereignty claim.
    """

    ts: datetime
    available: bool
    detail: str
    rows: list[ConnectionRow] = Field(default_factory=list)
    local: int | None = None
    internal: int | None = None
    external: int | None = None


class ConnectionAuditor:
    """Reads and classifies the live connection table."""

    def __init__(self, policy: EgressPolicy) -> None:
        self._policy = policy
        self._process_names: dict[int, str] = {}

    def snapshot(self) -> ConnectionSnapshot:
        ts = datetime.now(UTC)
        try:
            connections = psutil.net_connections(kind="inet")
        except (psutil.AccessDenied, PermissionError) as exc:
            return ConnectionSnapshot(
                ts=ts,
                available=False,
                detail=(
                    "psutil.net_connections requires elevated privileges on this platform: "
                    f"{exc}"
                ),
            )
        except Exception as exc:
            return ConnectionSnapshot(
                ts=ts, available=False, detail=f"Connection audit failed: {exc}"
            )

        rows: list[ConnectionRow] = []
        counts = {AddressClass.LOCAL: 0, AddressClass.INTERNAL: 0, AddressClass.EXTERNAL: 0}

        for connection in connections:
            raddr = connection.raddr
            if not raddr:
                continue
            host = raddr[0] if isinstance(raddr, tuple) else getattr(raddr, "ip", "")
            port = raddr[1] if isinstance(raddr, tuple) else getattr(raddr, "port", 0)
            classification = self._policy.classify(str(host))
            counts[classification] += 1
            laddr = connection.laddr
            local_str = (
                f"{laddr[0]}:{laddr[1]}"
                if isinstance(laddr, tuple)
                else (f"{laddr.ip}:{laddr.port}" if laddr else None)
            )
            rows.append(
                ConnectionRow(
                    pid=connection.pid,
                    process=self._process_name(connection.pid),
                    laddr=local_str,
                    raddr=f"{host}:{port}",
                    status=connection.status,
                    classification=classification,
                )
            )

        return ConnectionSnapshot(
            ts=ts,
            available=True,
            detail=f"{len(rows)} established connections",
            rows=rows,
            local=counts[AddressClass.LOCAL],
            internal=counts[AddressClass.INTERNAL],
            external=counts[AddressClass.EXTERNAL],
        )

    def _process_name(self, pid: int | None) -> str | None:
        if pid is None:
            return None
        cached = self._process_names.get(pid)
        if cached is not None:
            return cached
        try:
            name = psutil.Process(pid).name()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None
        self._process_names[pid] = name
        return name
