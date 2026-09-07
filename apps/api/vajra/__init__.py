"""VAJRA: Sovereign On-Premise Agentic AI Workbench.

Import direction is enforced by ``tests/unit/test_architecture.py``::

    api -> orchestrator -> {services} -> adapters -> store/events -> core

Nothing lower may import anything higher.
"""

__version__ = "0.1.0"
