"""Layer 3: nftables integration (Section K, "the centrepiece").

Reads the real kernel ruleset and the real drop counter, and parses
``VAJRA-EGRESS-BLOCK`` lines out of the kernel log into network events.

Implemented: ruleset reading, counter reading, and kernel-log line parsing.
All three read actual system state; the parser is a pure function and is unit
tested against real log line formats.

Not available off Linux, and not available without ``CAP_NET_ADMIN``. In those
cases every method reports :class:`NftStatus` with ``available=False`` and the
reason. **The counter is never synthesised.** A hardcoded "3 blocked" on the
Network page would destroy the one claim this project is built to make.
"""

from __future__ import annotations

import platform
import re
import shutil
import subprocess
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from vajra.core.config import SovereigntySettings
from vajra.core.enums import EgressLayer, EgressVerdict

#: A kernel log line produced by the nft LOG statement, e.g.
#: ``... VAJRA-EGRESS-BLOCK IN= OUT=eth0 SRC=172.29.0.3 DST=104.18.0.1 PROTO=TCP SPT=51234 DPT=443``
_LOG_FIELD = re.compile(r"\b([A-Z]+)=(\S*)")

_COUNTER = re.compile(r"counter packets (\d+) bytes (\d+)")


class NftStatus(BaseModel):
    """Whether kernel enforcement is present, and why not when it is not."""

    available: bool
    detail: str
    platform: str
    table: str


class NftCounter(BaseModel):
    """The drop counter. ``packets`` is ``None`` when it could not be read."""

    available: bool
    detail: str
    packets: int | None = None
    bytes: int | None = None
    read_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class NftRuleset(BaseModel):
    """``nft list ruleset`` output, verbatim, for the in-app disclosure."""

    available: bool
    detail: str
    text: str | None = None


class ParsedLogLine(BaseModel):
    """A kernel log line parsed into the network-event shape."""

    ts: datetime
    src: str | None = None
    dst_ip: str | None = None
    dst_port: int | None = None
    proto: str | None = None
    verdict: EgressVerdict = EgressVerdict.BLOCK
    layer: EgressLayer = EgressLayer.NFT
    raw_log: str = ""


def parse_kernel_log_line(line: str, *, prefix: str) -> ParsedLogLine | None:
    """Parse one ``VAJRA-EGRESS-BLOCK`` line. Returns ``None`` for other lines.

    A pure function, so it is testable without a kernel.
    """
    if prefix not in line:
        return None
    fields = dict(_LOG_FIELD.findall(line))
    port = fields.get("DPT")
    return ParsedLogLine(
        ts=datetime.now(UTC),
        src=fields.get("SRC"),
        dst_ip=fields.get("DST"),
        dst_port=int(port) if port and port.isdigit() else None,
        proto=fields.get("PROTO"),
        raw_log=line.rstrip("\n"),
    )


class NftablesSentinel:
    """Reads kernel enforcement state via the ``nft`` binary."""

    def __init__(self, settings: SovereigntySettings) -> None:
        self._settings = settings

    # --- availability ----------------------------------------------------

    def status(self) -> NftStatus:
        system = platform.system()
        if not self._settings.nftables_enabled:
            return NftStatus(
                available=False,
                detail="nftables enforcement is disabled in configuration",
                platform=system,
                table=self._settings.nftables_table,
            )
        if system != "Linux":
            return NftStatus(
                available=False,
                detail=f"nftables requires Linux; this host is {system}",
                platform=system,
                table=self._settings.nftables_table,
            )
        if shutil.which("nft") is None:
            return NftStatus(
                available=False,
                detail="the nft binary is not on PATH",
                platform=system,
                table=self._settings.nftables_table,
            )
        return NftStatus(
            available=True,
            detail="nft is available; reading requires CAP_NET_ADMIN",
            platform=system,
            table=self._settings.nftables_table,
        )

    # --- reads -----------------------------------------------------------

    def _run_nft(self, args: list[str]) -> tuple[bool, str]:
        try:
            completed = subprocess.run(  # noqa: S603 - fixed argv, no shell
                ["nft", *args],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except FileNotFoundError:
            return False, "the nft binary is not on PATH"
        except subprocess.TimeoutExpired:
            return False, "nft timed out"
        except OSError as exc:
            return False, f"nft could not be executed: {exc}"
        if completed.returncode != 0:
            return False, (completed.stderr or "nft returned a non-zero exit code").strip()
        return True, completed.stdout

    def ruleset(self) -> NftRuleset:
        status = self.status()
        if not status.available:
            return NftRuleset(available=False, detail=status.detail)
        ok, output = self._run_nft(["list", "ruleset"])
        if not ok:
            return NftRuleset(available=False, detail=output)
        return NftRuleset(available=True, detail="read from the kernel", text=output)

    def counter(self) -> NftCounter:
        """Read the drop counter from the VAJRA table.

        Returns ``packets=None`` when the table cannot be read. That is a
        different answer from zero and the UI renders it differently.
        """
        status = self.status()
        if not status.available:
            return NftCounter(available=False, detail=status.detail)
        ok, output = self._run_nft(["list", "table", "inet", self._settings.nftables_table])
        if not ok:
            return NftCounter(available=False, detail=output)
        match = _COUNTER.search(output)
        if match is None:
            return NftCounter(
                available=False,
                detail=f"no counter found in table inet {self._settings.nftables_table}",
            )
        return NftCounter(
            available=True,
            detail="read from the kernel counter",
            packets=int(match.group(1)),
            bytes=int(match.group(2)),
        )
