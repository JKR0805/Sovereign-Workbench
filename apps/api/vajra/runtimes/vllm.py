"""vLLM adapter.

vLLM serves the OpenAI protocol, so the transport is inherited wholesale. Only
the ``kind`` differs, and that matters: routing policies can require
``runtime_kind: ollama`` for restricted work (Section F, stage 4), so the kind
must be accurate rather than collapsed into "openai_compatible".

Scope note from Section P: "vLLM adapter: implemented and health-checkable, not
benchmarked." ``load``/``unload``/``resident`` inherit the honest
``AdapterCapabilityError`` because vLLM genuinely pins its model at process start.
"""

from __future__ import annotations

from vajra.core.enums import RuntimeKind
from vajra.runtimes.openai_compatible import OpenAICompatibleProvider


class VLLMProvider(OpenAICompatibleProvider):
    kind: RuntimeKind = RuntimeKind.VLLM
