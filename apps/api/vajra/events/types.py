"""Event vocabulary.

Section D: one table, one Python type, one SSE endpoint. Two consumers, zero
extra work: the live UI, and the signed audit export.

Adding an event type is a two-line change here plus a payload model in
:mod:`vajra.events.models`. Adding a *side channel* is forbidden: implementation
rule 2 says everything the UI shows about a run comes from an event.
"""

from __future__ import annotations

from enum import Enum


class EventType(str, Enum):
    # --- run lifecycle ---
    RUN_CREATED = "RUN_CREATED"
    RUN_COMPLETED = "RUN_COMPLETED"
    RUN_FAILED = "RUN_FAILED"
    RUN_CANCELLED = "RUN_CANCELLED"

    # --- graph nodes ---
    NODE_ENTERED = "NODE_ENTERED"
    NODE_COMPLETED = "NODE_COMPLETED"
    NODE_FAILED = "NODE_FAILED"

    # --- ingestion ---
    DOCUMENT_INGESTED = "DOCUMENT_INGESTED"
    PAGE_CLASSIFIED = "PAGE_CLASSIFIED"

    # --- routing ---
    TASK_CLASSIFIED = "TASK_CLASSIFIED"
    MODEL_CANDIDATES = "MODEL_CANDIDATES"
    MODEL_SELECTED = "MODEL_SELECTED"
    MODEL_LOADING = "MODEL_LOADING"
    MODEL_READY = "MODEL_READY"

    # --- generation ---
    LLM_TOKEN = "LLM_TOKEN"

    # --- retrieval ---
    RAG_QUERY = "RAG_QUERY"
    RAG_RESULTS = "RAG_RESULTS"

    # --- tools and sandbox ---
    TOOL_CALLED = "TOOL_CALLED"
    TOOL_RESULT = "TOOL_RESULT"
    SANDBOX_STARTED = "SANDBOX_STARTED"
    SANDBOX_COMPLETED = "SANDBOX_COMPLETED"

    # --- verification and output ---
    VERIFICATION_PASSED = "VERIFICATION_PASSED"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"
    FILE_CREATED = "FILE_CREATED"

    # --- sovereignty; emitted with or without a run in flight ---
    EGRESS_ATTEMPT = "EGRESS_ATTEMPT"
    EGRESS_BLOCKED = "EGRESS_BLOCKED"


#: Events that belong to no run are sequenced on this stream.
GLOBAL_STREAM = "__global__"

#: Event types that are always global, even if emitted during a run. An egress
#: attempt is a property of the machine, not of a run, and the Network page
#: subscribes to it whether or not anything is executing.
GLOBAL_EVENT_TYPES: frozenset[EventType] = frozenset(
    {EventType.EGRESS_ATTEMPT, EventType.EGRESS_BLOCKED}
)
