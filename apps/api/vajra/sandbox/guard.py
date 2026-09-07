"""Static AST guard (Section J, "The code loop").

Rejects generated code that imports networking or process-spawning modules
*before* it is executed. Defence in depth: the container already has no network
interface, but a visible pre-execution rejection is both a security property and
a demonstrable one.

This is implemented for real. It parses the code with :mod:`ast` and inspects
every import, attribute access and dynamic-execution call. It is a guard, not a
sandbox: it exists to catch the obvious case early and to make the refusal
legible. The container isolation is what actually contains untrusted code.
"""

from __future__ import annotations

import ast
from collections.abc import Iterable

from vajra.core.exceptions import StaticGuardRejection
from vajra.sandbox.models import GuardFinding

#: Modules that must never be imported by generated analysis code.
DENIED_MODULES: frozenset[str] = frozenset(
    {
        "socket",
        "ssl",
        "urllib",
        "urllib2",
        "urllib3",
        "http",
        "httplib",
        "httpx",
        "requests",
        "aiohttp",
        "ftplib",
        "telnetlib",
        "smtplib",
        "poplib",
        "imaplib",
        "xmlrpc",
        "subprocess",
        "multiprocessing",
        "ctypes",
        "socketserver",
        "asyncio",
        "webbrowser",
        "pty",
        "pickle",
        "shelve",
        "importlib",
    }
)

#: Builtins that defeat static analysis entirely.
DENIED_CALLS: frozenset[str] = frozenset({"eval", "exec", "compile", "__import__"})

#: Attribute accesses that reach the OS process or filesystem boundary.
DENIED_ATTRIBUTES: frozenset[str] = frozenset(
    {"system", "popen", "fork", "execv", "execve", "spawnv", "spawnl", "kill"}
)


def _root_module(name: str) -> str:
    return name.split(".", 1)[0]


def scan(code: str) -> list[GuardFinding]:
    """Return every guard finding. An empty list means the code passes."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [
            GuardFinding(
                rule="syntax",
                symbol="<module>",
                line=exc.lineno or 0,
                detail=f"code does not parse: {exc.msg}",
            )
        ]

    findings: list[GuardFinding] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module = _root_module(alias.name)
                if module in DENIED_MODULES:
                    findings.append(
                        GuardFinding(
                            rule="denied_import",
                            symbol=alias.name,
                            line=node.lineno,
                            detail=f"import of {alias.name!r} is not permitted in the sandbox",
                        )
                    )
        elif isinstance(node, ast.ImportFrom):
            module = _root_module(node.module or "")
            if module in DENIED_MODULES:
                findings.append(
                    GuardFinding(
                        rule="denied_import",
                        symbol=node.module or "",
                        line=node.lineno,
                        detail=f"import from {node.module!r} is not permitted in the sandbox",
                    )
                )
        elif isinstance(node, ast.Call):
            findings.extend(_scan_call(node))
        elif isinstance(node, ast.Attribute) and node.attr in DENIED_ATTRIBUTES:
            findings.append(
                GuardFinding(
                    rule="denied_attribute",
                    symbol=node.attr,
                    line=node.lineno,
                    detail=f"attribute {node.attr!r} reaches the process boundary",
                )
            )

    return findings


def _scan_call(node: ast.Call) -> Iterable[GuardFinding]:
    func = node.func
    if isinstance(func, ast.Name) and func.id in DENIED_CALLS:
        yield GuardFinding(
            rule="denied_call",
            symbol=func.id,
            line=node.lineno,
            detail=f"{func.id}() defeats static analysis and is not permitted",
        )
    elif isinstance(func, ast.Attribute) and func.attr in DENIED_CALLS:
        yield GuardFinding(
            rule="denied_call",
            symbol=func.attr,
            line=node.lineno,
            detail=f"{func.attr}() defeats static analysis and is not permitted",
        )


def enforce(code: str) -> None:
    """Raise :class:`StaticGuardRejection` if the code violates the guard."""
    findings = scan(code)
    if not findings:
        return
    summary = "; ".join(
        f"line {finding.line}: {finding.detail}" for finding in findings[:5]
    )
    raise StaticGuardRejection(
        f"Static guard rejected the code: {summary}",
        findings=[finding.model_dump(mode="json") for finding in findings],
    )
