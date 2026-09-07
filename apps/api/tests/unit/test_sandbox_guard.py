"""Unit tests for the sandbox AST guard (Section J: the code loop)."""

from __future__ import annotations

import pytest

from vajra.core.exceptions import StaticGuardRejection
from vajra.sandbox.guard import enforce, scan


def test_guard_allows_safe_code() -> None:
    """Safe analytical code without forbidden imports or attributes passes without findings."""
    safe_code = """
import math
import json

data = [1, 2, 3, 4, 5]
squared = [math.pow(x, 2) for x in data]
result = json.dumps({"mean": sum(squared) / len(squared)})
print(result)
"""
    findings = scan(safe_code)
    assert len(findings) == 0
    # enforce should not raise
    enforce(safe_code)


def test_guard_rejects_network_imports() -> None:
    """Imports of networking modules (socket, requests, httpx, urllib) are detected and rejected."""
    forbidden_snippets = [
        "import socket",
        "from socket import create_connection",
        "import httpx",
        "import requests",
        "from urllib.request import urlopen",
    ]

    for snippet in forbidden_snippets:
        findings = scan(snippet)
        assert len(findings) > 0
        assert any(f.rule == "denied_import" for f in findings)
        with pytest.raises(StaticGuardRejection):
            enforce(snippet)


def test_guard_rejects_process_and_eval() -> None:
    """Subprocess spawning, eval/exec, and process-boundary attribute accesses are rejected."""
    code_eval = "eval('1 + 1')"
    findings_eval = scan(code_eval)
    assert any(f.rule == "denied_call" for f in findings_eval)

    code_subp = "import subprocess\nsubprocess.run(['ls'])"
    findings_subp = scan(code_subp)
    assert any(f.rule == "denied_import" for f in findings_subp)

    code_os_system = "import os\nos.system('dir')"
    findings_os = scan(code_os_system)
    assert any(f.rule == "denied_attribute" for f in findings_os)


def test_guard_handles_syntax_error() -> None:
    """Code with syntax error produces a syntax finding."""
    bad_syntax = "def foo(: return 42"
    findings = scan(bad_syntax)
    assert len(findings) == 1
    assert findings[0].rule == "syntax"
