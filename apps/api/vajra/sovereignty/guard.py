"""Layer 1: the in-process egress guard (Section K).

Installs a hook on ``socket.socket.connect``. Any destination outside loopback,
RFC1918 or the Docker bridge ranges raises
:class:`~vajra.core.exceptions.SovereigntyViolation` and is recorded.

This catches the realistic threat, which is not an attacker but a careless
dependency: a telemetry callback in some library phoning home. That is why the
guard captures the calling stack frame and names the module responsible.

**Import order matters.** This module must be imported before any third-party
package that might open a socket at import time. It therefore depends on nothing
but the standard library and :mod:`vajra.core` / :mod:`vajra.sovereignty.policy`.
It does not import the event bus: sinks are registered by the application after
boot, and the guard buffers everything it sees in the meantime.
"""

from __future__ import annotations

import socket
import threading
import traceback
from collections import deque
from collections.abc import Callable
from typing import Any

from vajra.core.enums import EgressVerdict
from vajra.core.exceptions import SovereigntyViolation
from vajra.sovereignty.policy import EgressAttempt, EgressDecision, EgressPolicy, now

#: A sink is called synchronously from whichever thread attempted the connection.
#: It must not block. The application registers one that hands the record to the
#: event loop.
EgressSink = Callable[[EgressAttempt, EgressDecision], None]

#: Attempts observed before any sink was registered, so nothing is lost at boot.
_BUFFER_SIZE = 256


class EgressGuard:
    """Patches ``socket.socket.connect`` and enforces the trust boundary."""

    def __init__(self, policy: EgressPolicy) -> None:
        self._policy = policy
        self._sinks: list[EgressSink] = []
        self._buffer: deque[tuple[EgressAttempt, EgressDecision]] = deque(maxlen=_BUFFER_SIZE)
        self._lock = threading.Lock()
        self._original_connect: Callable[..., Any] | None = None
        self._blocked_count = 0
        self._allowed_count = 0

    # --- lifecycle -------------------------------------------------------

    @property
    def installed(self) -> bool:
        return self._original_connect is not None

    def install(self) -> None:
        """Patch ``socket.socket.connect``. Idempotent."""
        if self.installed:
            return
        original = socket.socket.connect
        self._original_connect = original
        guard = self

        def guarded_connect(sock: socket.socket, address: Any) -> Any:
            host, port = guard._destination(sock, address)
            if host is not None:
                guard._check(host, port)
            return original(sock, address)

        socket.socket.connect = guarded_connect  # type: ignore[method-assign]

    def uninstall(self) -> None:
        """Restore the original ``connect``. Used by tests and shutdown."""
        if self._original_connect is not None:
            socket.socket.connect = self._original_connect  # type: ignore[method-assign]
            self._original_connect = None

    # --- inspection ------------------------------------------------------

    @staticmethod
    def _destination(sock: socket.socket, address: Any) -> tuple[str | None, int]:
        """Extract host and port, ignoring address families we do not police.

        AF_UNIX sockets carry a filesystem path and never leave the machine.
        """
        family = getattr(sock, "family", None)
        if family not in (socket.AF_INET, socket.AF_INET6):
            return None, 0
        if isinstance(address, tuple) and len(address) >= 2:
            return str(address[0]), int(address[1])
        return None, 0

    def _check(self, host: str, port: int) -> None:
        decision = self._policy.decide(host, port)
        attempt = EgressAttempt(
            host=host,
            port=port,
            ts=now(),
            stack_frame=_calling_frame() if decision.verdict is EgressVerdict.BLOCK else None,
        )
        self._record(attempt, decision)
        if decision.verdict is EgressVerdict.BLOCK:
            raise SovereigntyViolation(
                f"Blocked outbound connection to {host}:{port}. {decision.reason}",
                host=host,
                port=port,
                caller=attempt.stack_frame,
            )

    def _record(self, attempt: EgressAttempt, decision: EgressDecision) -> None:
        with self._lock:
            if decision.verdict is EgressVerdict.BLOCK:
                self._blocked_count += 1
            else:
                self._allowed_count += 1
            sinks = list(self._sinks)
            if not sinks:
                self._buffer.append((attempt, decision))
        for sink in sinks:
            try:
                sink(attempt, decision)
            except Exception:  # noqa: S110 - a sink must never break a connection
                pass

    # --- sinks -----------------------------------------------------------

    def add_sink(self, sink: EgressSink) -> None:
        """Register a sink and flush anything buffered before it existed."""
        with self._lock:
            self._sinks.append(sink)
            buffered = list(self._buffer)
            self._buffer.clear()
        for attempt, decision in buffered:
            try:
                sink(attempt, decision)
            except Exception:  # noqa: S110
                pass

    def remove_sink(self, sink: EgressSink) -> None:
        with self._lock:
            if sink in self._sinks:
                self._sinks.remove(sink)

    # --- counters --------------------------------------------------------

    @property
    def blocked_count(self) -> int:
        """Attempts this process blocked. A real counter, incremented on block."""
        return self._blocked_count

    @property
    def allowed_count(self) -> int:
        return self._allowed_count


def _calling_frame() -> str:
    """Identify the module that attempted the connection.

    Walks out of the standard library and out of VAJRA's own guard frames so the
    reported frame is the actual caller: usually a third-party package.
    """
    frames = traceback.extract_stack()[:-3]
    for frame in reversed(frames):
        filename = frame.filename.replace("\\", "/")
        if "/vajra/sovereignty/" in filename:
            continue
        if "/socket.py" in filename or "/ssl.py" in filename:
            continue
        return f"{frame.filename}:{frame.lineno} in {frame.name}"
    return "<unknown>"


#: Process-wide guard. ``install_guard`` creates it; ``get_guard`` reads it.
_GUARD: EgressGuard | None = None


def install_guard(extra_allowed_cidrs: list[str] | None = None) -> EgressGuard:
    """Install the process-wide guard. Call this before third-party imports."""
    global _GUARD
    if _GUARD is None:
        _GUARD = EgressGuard(EgressPolicy(extra_allowed_cidrs))
    _GUARD.install()
    return _GUARD


def get_guard() -> EgressGuard | None:
    """The installed guard, or ``None`` when the guard is disabled."""
    return _GUARD


def reset_guard() -> None:
    """Uninstall and forget the guard. Test helper."""
    global _GUARD
    if _GUARD is not None:
        _GUARD.uninstall()
    _GUARD = None
