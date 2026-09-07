# VAJRA: Frontend API Reference

This document provides the complete API contract for the VAJRA backend (`vajra-api`). It is designed specifically for frontend engineers building the Next.js web application (`apps/web`).

---

## 1. Protocol Conventions & Core Standards

### Base URL
```text
http://127.0.0.1:8000
```
All API routes are prefixed with `/api`.

### Content Types
- Standard requests and responses: `application/json`
- Event streams: `text/event-stream`
- Document uploads: `multipart/form-data`
- Kernel rulesets: `text/plain`

### Error Format (RFC 7807)
All domain errors subclass `VajraError` and serialize as `application/problem+json`:

```json
{
  "type": "https://vajra.local/errors/model-not-found",
  "title": "Model not found",
  "status": 404,
  "detail": "Model 'qwen3-vl:8b' is not registered in the database.",
  "instance": "/api/models/qwen3-vl:8b",
  "code": "MODEL_NOT_FOUND",
  "context": {
    "model_id": "qwen3-vl:8b"
  }
}
```

#### TypeScript Error Definition
```typescript
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  context?: Record<string, unknown>;
}
```

---

## 2. System & Health

### 2.1 Liveness Ping
`GET /api/system/ping`

Fast, zero-dependency liveness check.

#### Response (200 OK)
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### 2.2 System Health & Dependency Audit
`GET /api/system/health`

Reports live reachability for all registered runtimes, vector index, sandbox, database journal mode, and sovereignty assertions.

#### Response (200 OK)
```json
{
  "status": "healthy",
  "ts": "2026-09-07T17:30:00.000000Z",
  "version": "0.1.0",
  "profile": "development",
  "python": "3.11.9",
  "platform": "Windows 11",
  "database_journal_mode": "wal",
  "services": [
    {
      "name": "ollama",
      "state": "healthy",
      "detail": "Ollama 0.3.12 responding on http://127.0.0.1:11434",
      "endpoint": "http://127.0.0.1:11434",
      "latency_ms": 12.4
    },
    {
      "name": "qdrant",
      "state": "healthy",
      "detail": "embedded storage at data/qdrant",
      "endpoint": "data/qdrant",
      "latency_ms": null
    },
    {
      "name": "sandbox",
      "state": "healthy",
      "detail": "Docker daemon connected, image vajra-sandbox:py311 present"
    }
  ],
  "self_audit_passed": true
}
```

#### TypeScript Types
```typescript
export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ServiceHealth {
  name: string;
  state: HealthState;
  detail?: string | null;
  endpoint?: string | null;
  latency_ms?: number | null;
}

export interface SystemHealth {
  status: HealthState;
  ts: string;
  version: string;
  profile: string;
  python: string;
  platform: string;
  database_journal_mode: string;
  services: ServiceHealth[];
  self_audit_passed: boolean | null;
}
```

---

## 3. Models & Hardware Registry

### 3.1 List Registered Models
`GET /api/models`

#### Query Parameters
- `capability` (optional, string): Filter by capability (e.g. `reasoning`, `coding`, `vision`, `embedding`).
- `enabled_only` (optional, boolean, default: `false`): Return only enabled models.

#### Response (200 OK)
```json
[
  {
    "id": "general-reasoning",
    "display_name": "General Reasoning (Qwen 3 8B)",
    "runtime_id": "ollama-local",
    "runtime_model_id": "qwen3:8b",
    "capabilities": {
      "text": 0.9,
      "reasoning": 0.85,
      "tool_calling": 0.85,
      "structured_output": 0.8
    },
    "capabilities_verified": {
      "reasoning": "verified",
      "tool_calling": "verified"
    },
    "context_window": 32768,
    "num_ctx": 8192,
    "max_output_tokens": 4096,
    "vram_gb": 5.2,
    "device": "gpu",
    "quantization": "Q4_K_M",
    "modalities_in": ["text"],
    "priority": 50,
    "enabled": true,
    "license": "Apache-2.0",
    "health": "healthy",
    "avg_latency_ms": 420.5,
    "tokens_per_sec": 38.2,
    "request_count": 142,
    "error_count": 0,
    "last_probe_at": "2026-09-07T17:15:00.000000Z"
  }
]
```

---

### 3.2 Register Model
`POST /api/models`

#### Query Parameters
- `probe` (optional, boolean, default: `true`): If true, runs live capability probes before saving.

#### Request Body
```json
{
  "id": "custom-vlm",
  "display_name": "Custom Vision Specialist",
  "runtime_id": "ollama-local",
  "runtime_model_id": "qwen2.5-vl:3b",
  "capabilities": {
    "vision": 0.85,
    "doc_understanding": 0.8
  },
  "context_window": 8192,
  "num_ctx": 8192,
  "max_output_tokens": 2048,
  "vram_gb": 3.2,
  "device": "gpu",
  "quantization": "Q4_K_M",
  "modalities_in": ["text", "image"],
  "priority": 60,
  "enabled": true,
  "license": "Apache-2.0"
}
```

#### Response (201 Created)
Returns the created `ModelRead` object.

---

### 3.3 Probe Model Without Saving
`POST /api/models/probe`

Used by the "Add Model" wizard to verify connectivity and capabilities before saving.

#### Request Body
```json
{
  "runtime_id": "ollama-local",
  "runtime_model_id": "qwen3:8b"
}
```

#### Response (200 OK)
```json
{
  "runtime_reachable": true,
  "model_available": true,
  "text_generation_ok": true,
  "text_latency_ms": 380.2,
  "vision_ok": false,
  "tool_calling_ok": true,
  "vram_delta_mb": 5120.0,
  "probed_at": "2026-09-07T17:25:00.000000Z"
}
```

---

### 3.4 Live VRAM Residency
`GET /api/models/residency`

Reports which models are currently resident in GPU memory.

#### Response (200 OK)
```json
{
  "ts": "2026-09-07T17:30:00.000000Z",
  "total_vram_mb": 8192.0,
  "used_vram_mb": 5240.0,
  "resident_models": [
    {
      "model_id": "general-reasoning",
      "runtime_id": "ollama-local",
      "runtime_model_id": "qwen3:8b",
      "vram_bytes": 5494538240,
      "expires_at": "2026-09-07T18:00:00.000000Z"
    }
  ]
}
```

---

### 3.5 Model Actions
- `GET /api/models/{model_id}`: Retrieve single model record.
- `PATCH /api/models/{model_id}`: Update mutable fields (`display_name`, `capabilities`, `priority`, `enabled`, `vram_gb`, `num_ctx`).
- `DELETE /api/models/{model_id}`: Remove model from registry (204 No Content).
- `POST /api/models/{model_id}/refresh`: Trigger manual re-probe and update measured health.
- `POST /api/models/{model_id}/load`: Bring model into VRAM (204 No Content).
- `POST /api/models/{model_id}/unload`: Evict model from VRAM (204 No Content).

---

## 4. Runtimes

- `GET /api/runtimes`: List configured local runtime adapters (e.g. `ollama-local`).
- `POST /api/runtimes`: Register a new runtime adapter.
- `GET /api/runtimes/{runtime_id}`: Retrieve single runtime metadata.
- `GET /api/runtimes/{runtime_id}/available`: Query models physically present on the runtime daemon.
- `POST /api/runtimes/{runtime_id}/probe`: Ping runtime endpoint and update health.

---

## 5. Routing Engine & Studio

### 5.1 Simulate Routing
`POST /api/routing/simulate`

Called by the Workbench composer (debounced) and the Routing Studio simulator. Evaluates the 5-stage pipeline without executing any generation.

#### Request Body
```json
{
  "prompt": "Review this heat exchanger inspection report and verify if wall thickness complies with safety limits.",
  "attachments": [
    {
      "filename": "e102_report.pdf",
      "mime": "application/pdf",
      "size_bytes": 1048576,
      "page_count": 4,
      "scanned_page_count": 1
    }
  ],
  "weights": {
    "capability": 0.40,
    "preferred": 0.15,
    "context": 0.10,
    "latency": 0.10,
    "priority": 0.10,
    "residency": 0.10,
    "reliability": 0.05
  },
  "task_labels": {}
}
```

#### Response (200 OK)
```json
{
  "task": {
    "task_id": "simulate",
    "intent": "doc_understanding",
    "required_capabilities": ["doc_understanding", "vision"],
    "preferred_capabilities": ["reasoning"],
    "required_modalities": ["text", "image"],
    "estimated_input_tokens": 2800,
    "latency_budget_ms": 30000.0
  },
  "decision": {
    "task_id": "simulate",
    "selected": "vision-document",
    "score": 92.4,
    "rationale": "High vision capability score (0.88), model resident in memory, matches required input modality.",
    "candidates": [
      {
        "model_id": "vision-document",
        "total_score": 92.4,
        "capability_score": 0.88,
        "context_score": 0.95,
        "latency_score": 0.90,
        "residency_score": 1.0,
        "is_resident": true
      }
    ],
    "rejected": [
      {
        "model_id": "general-reasoning",
        "reason": "MISSING_CAPABILITY",
        "detail": "Model lacks required capability: vision"
      }
    ],
    "fallbacks": ["general-reasoning"],
    "policy_applied": "Vision tasks route to verified multimodal models",
    "decided_in_ms": 4.2
  }
}
```

---

### 5.2 Routing Policies
- `GET /api/routing/policies`: List all stored routing policy records.
- `GET /api/routing/policies/{id}`: Retrieve a specific policy.
- `PUT /api/routing/policies/{id}`: Upsert a routing policy with graph configuration, rules, and scoring weights.
- `GET /api/routing/capabilities`: Returns the valid capability vocabulary list.

---

## 6. Runs & Agent Orchestration

### 6.1 Create & Start Run
`POST /api/runs`

Creates an agent run and dispatches background execution immediately. Returns status 202 Accepted.

#### Request Body
```json
{
  "prompt": "Evaluate equipment wall thickness from e102_report.md against ASME safety guidelines and draft an approval note.",
  "project_id": null,
  "agent_id": null,
  "attachments": [
    {
      "filename": "e102_report.md",
      "mime": "text/markdown",
      "size_bytes": 1024,
      "document_id": "76495df02ad44a0eb52b9ba25c13e1c6",
      "page_count": 1,
      "scanned_page_count": 0
    }
  ],
  "execution_mode": "demo"
}
```

#### Response (202 Accepted)
```json
{
  "run_id": "8a31e847c21f42a1b9de1891db854201",
  "status": "pending",
  "execution_mode": "demo",
  "events_url": "/api/runs/8a31e847c21f42a1b9de1891db854201/events"
}
```

---

### 6.2 Get Run Details
`GET /api/runs/{run_id}`

#### Response (200 OK)
```json
{
  "id": "8a31e847c21f42a1b9de1891db854201",
  "prompt": "Evaluate equipment wall thickness from e102_report.md against ASME safety guidelines and draft an approval note.",
  "status": "completed",
  "execution_mode": "demo",
  "project_id": null,
  "agent_id": null,
  "task_spec": {},
  "budget": {
    "max_steps": 8,
    "max_tool_calls": 12,
    "max_wall_time_s": 240,
    "used_steps": 4,
    "used_tool_calls": 2,
    "used_wall_time_s": 6.8
  },
  "models_used": ["general-reasoning"],
  "attachments": [],
  "total_tokens": 1240,
  "started_at": "2026-09-07T17:35:00.000000Z",
  "finished_at": "2026-09-07T17:35:07.000000Z",
  "duration_ms": 7024.5,
  "error": null,
  "created_at": "2026-09-07T17:35:00.000000Z"
}
```

---

### 6.3 List Run Steps
`GET /api/runs/{run_id}/steps`

Returns the ordered sequence of execution steps for the run graph.

#### Response (200 OK)
```json
[
  {
    "id": "step-1",
    "ordinal": 1,
    "node_id": "parse",
    "kind": "document_parse",
    "status": "completed",
    "routing_decision": {},
    "started_at": "2026-09-07T17:35:00.000000Z",
    "duration_ms": 420.0
  },
  {
    "id": "step-2",
    "ordinal": 2,
    "node_id": "route",
    "kind": "model_routing",
    "status": "completed",
    "routing_decision": {
      "selected": "general-reasoning",
      "score": 94.0
    },
    "started_at": "2026-09-07T17:35:01.000000Z",
    "duration_ms": 15.0
  }
]
```

---

### 6.4 List Run Artifacts
`GET /api/runs/{run_id}/artifacts`

#### Response (200 OK)
```json
[
  {
    "id": "art-01",
    "run_id": "8a31e847c21f42a1b9de1891db854201",
    "filename": "Approval_Note.docx",
    "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "size_bytes": 28420,
    "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    "created_at": "2026-09-07T17:35:06.000000Z"
  }
]
```

---

### 6.5 Cancel Run
`POST /api/runs/{run_id}/cancel`

Cancels an in-flight run. Returns the updated `RunRead` object with status `cancelled`.

---

## 7. Real-Time Server-Sent Events (SSE)

### 7.1 Stream Run Events
`GET /api/runs/{run_id}/events`

The primary communication channel for the frontend run view. Emits real-time progress, node transitions, token chunks, tool calls, and produced deliverables.

#### Query Parameters
- `since` (optional, integer, default: `0`): Replay from this sequence number forward.

#### HTTP Headers
- `Last-Event-ID` (optional, string): Standard browser EventSource header, accepted as fallback if `since` is not explicitly set.

#### Protocol Guarantees
1. **Durable Replay**: Past events are replayed from the database before new live events are forwarded.
2. **Backpressure Protected**: Internal ring buffers with lag metrics prevent memory unbounded growth.
3. **Heartbeats**: Keeps connections alive across proxies with `: ping\n\n` comments every 15 seconds.
4. **Clean Close**: Automatically sends terminal event (`RUN_COMPLETED`, `RUN_FAILED`, or `RUN_CANCELLED`) and closes stream.

#### Raw Wire Format Example
```text
id: 1
event: RUN_CREATED
data: {"id":"evt-1","seq":1,"stream":"8a31...","run_id":"8a31...","ts":"2026-09-07T17:35:00.000000Z","type":"RUN_CREATED","node_id":null,"payload":{"prompt":"Evaluate equipment..."},"duration_ms":null}

id: 2
event: NODE_ENTERED
data: {"id":"evt-2","seq":2,"stream":"8a31...","run_id":"8a31...","ts":"2026-09-07T17:35:00.100000Z","type":"NODE_ENTERED","node_id":"route","payload":{"label":"Model Routing"},"duration_ms":null}

id: 3
event: LLM_TOKEN
data: {"id":"evt-3","seq":3,"stream":"8a31...","run_id":"8a31...","ts":"2026-09-07T17:35:02.400000Z","type":"LLM_TOKEN","node_id":"generate","payload":{"token":"Based","index":0},"duration_ms":null}

id: 4
event: RUN_COMPLETED
data: {"id":"evt-4","seq":4,"stream":"8a31...","run_id":"8a31...","ts":"2026-09-07T17:35:07.000000Z","type":"RUN_COMPLETED","node_id":null,"payload":{"total_tokens":1240,"status":"completed"},"duration_ms":7024.5}
```

---

### 7.2 Complete Event Vocabulary & Payloads

| Event Type | Emitted When | Primary Payload Fields |
| :--- | :--- | :--- |
| `RUN_CREATED` | Run initialized | `prompt`, `execution_mode`, `budget` |
| `NODE_ENTERED` | Graph node begins execution | `node_id`, `kind`, `label` |
| `NODE_COMPLETED`| Graph node finishes execution | `node_id`, `status`, `duration_ms` |
| `NODE_FAILED` | Graph node errors | `node_id`, `error`, `duration_ms` |
| `DOCUMENT_INGESTED`| Document parsed & indexed | `document_id`, `filename`, `chunks_count` |
| `PAGE_CLASSIFIED`| Document page type identified | `page_number`, `classification` (`DIGITAL` \| `SCANNED`) |
| `TASK_CLASSIFIED`| Router categorizes intent | `intent`, `required_caps`, `estimated_tokens` |
| `MODEL_CANDIDATES`| Candidate models scored | `candidates`: array of scores and residency flags |
| `MODEL_SELECTED`| Winner chosen | `model_id`, `score`, `rationale` |
| `MODEL_LOADING` | Model VRAM swap starts | `model_id`, `evicted_model_id`, `vram_gb`, `est_ms` |
| `MODEL_READY` | Model resident in VRAM | `model_id`, `vram_gb`, `load_duration_ms` |
| `LLM_TOKEN` | Streamed thought/output token | `token`, `index` |
| `RAG_QUERY` | Knowledge retrieval starts | `query`, `top_k`, `document_ids` |
| `RAG_RESULTS` | Retrieved chunks returned | `chunk_count`, `reranked`, `timings` |
| `TOOL_CALLED` | Agent invokes tool | `tool_name`, `arguments` |
| `TOOL_RESULT` | Tool finishes execution | `tool_name`, `success`, `result`, `error` |
| `SANDBOX_STARTED`| Docker container execution starts| `container_id`, `image`, `network_disabled` |
| `SANDBOX_COMPLETED`| Code execution finishes | `exit_code`, `stdout`, `stderr`, `duration_ms` |
| `VERIFICATION_PASSED`| Citations grounded in chunks | `verified_claims`, `checked_chunk_ids` |
| `FILE_CREATED` | Artifact file produced | `filename`, `mime`, `size_bytes`, `sha256` |
| `RUN_COMPLETED` | Run completes successfully | `total_tokens`, `duration_ms`, `artifacts` |
| `RUN_FAILED` | Run terminated with error | `error_code`, `message`, `step_id` |
| `RUN_CANCELLED` | Operator cancelled run | `cancelled_at_step` |
| `EGRESS_ATTEMPT`| Outbound connection detected | `target`, `caller`, `layer`, `destination_ip` |
| `EGRESS_BLOCKED`| Egress denied by policy | `target`, `layer`, `timestamp` |

---

## 8. Knowledge & Document RAG

### 8.1 Upload Document
`POST /api/knowledge/documents`

Content-Type: `multipart/form-data`

#### Form Fields
- `file`: Binary file contents. Supported extensions: `.pdf`, `.txt`, `.md`, `.csv`, `.json`, `.log`.
- `project_id` (optional query parameter, string): Optional project scope.

#### Response (201 Created)
```json
{
  "id": "76495df02ad44a0eb52b9ba25c13e1c6",
  "project_id": null,
  "filename": "e102_report.md",
  "sha256": "3a74b34b6b668d27b99c1e7a6279f64a7c2fefb76b1582239f1c7d23d8c484f9",
  "mime": "text/markdown",
  "size_bytes": 1024,
  "page_count": 1,
  "scanned_page_count": 0,
  "status": "indexed",
  "parser": "text",
  "ingested_at": "2026-09-07T17:10:00.000000Z",
  "error": null,
  "created_at": "2026-09-07T17:09:59.000000Z"
}
```

---

### 8.2 List Ingested Documents
`GET /api/knowledge/documents`

Returns all documents currently cataloged in the on-premise knowledge repository.

---

### 8.3 Get Document Chunks
`GET /api/knowledge/documents/{document_id}/chunks`

Inspect extracted chunks and token budgets for a specific document.

#### Response (200 OK)
```json
[
  {
    "id": "76495df02ad44a0eb52b9ba25c13e1c6:0",
    "document_id": "76495df02ad44a0eb52b9ba25c13e1c6",
    "ordinal": 0,
    "text": "Heat Exchanger E-102 Inspection Report\nMeasured wall thickness: 6.8 mm across all tube passes.",
    "section_path": "Inspection Findings",
    "page_from": 1,
    "page_to": 1,
    "token_count": 68
  }
]
```

---

### 8.4 Delete Document
`DELETE /api/knowledge/documents/{document_id}`

Cascades deletion: removes SQLite metadata, chunk records, local disk storage, and vector points in Qdrant (204 No Content).

---

### 8.5 Hybrid Search with Citations
`POST /api/knowledge/search`

Executes semantic dense search and citation numbering.

#### Request Body
```json
{
  "query": "What is the measured wall thickness for E-102 and what is the retirement threshold?",
  "top_k": 3,
  "document_ids": [],
  "rerank": true
}
```

#### Response (200 OK)
```json
{
  "query": "What is the measured wall thickness for E-102 and what is the retirement threshold?",
  "chunks": [
    {
      "marker": "[C1]",
      "label": "e102_report.md > p.1",
      "chunk_id": "76495df02ad44a0eb52b9ba25c13e1c6:0",
      "document_id": "76495df02ad44a0eb52b9ba25c13e1c6",
      "text": "Heat Exchanger E-102 Inspection Report\nMeasured wall thickness: 6.8 mm across all tube passes.",
      "page_from": 1,
      "page_to": 1,
      "section_path": "Inspection Findings",
      "doc_title": "e102_report.md",
      "score": 0.8124
    }
  ],
  "reranked": false,
  "timings": {
    "embed_ms": 38.4,
    "retrieve_ms": 5.2,
    "rerank_ms": null,
    "total_ms": 43.6
  }
}
```

---

## 9. Network & Sovereignty Sentinel

### 9.1 Network Snapshot
`GET /api/network/snapshot`

Polled or fetched on load by the `/network` page.

#### Response (200 OK)
```json
{
  "ts": "2026-09-07T17:30:00.000000Z",
  "established_connections": [
    {
      "pid": 12480,
      "process": "python.exe",
      "laddr": "127.0.0.1:8000",
      "raddr": "127.0.0.1:52134",
      "status": "ESTABLISHED",
      "classification": "LOCAL"
    }
  ],
  "external_connection_count": 0,
  "nft_drop_count": 4,
  "persisted_block_count": 4
}
```

---

### 9.2 Trigger External Call (The Verification Probe)
`POST /api/network/probe`

Genuinely attempts an outbound HTTP request to verify that the trust boundary actively enforces egress denial.

#### Response (200 OK)
```json
{
  "target": "https://api.openai.com/v1/models",
  "blocked": true,
  "layer": "app",
  "detail": "Blocked egress connection to api.openai.com:443 [RFC1918/loopback policy violation]",
  "caller": "httpx/_transports/default.py:line 84"
}
```

---

### 9.3 Sovereignty Event Stream
`GET /api/network/events/stream`

SSE endpoint streaming global sovereignty events (`EGRESS_ATTEMPT`, `EGRESS_BLOCKED`) in real time.

---

### 9.4 Ruleset & Self-Audit
- `GET /api/network/ruleset`: Returns raw `nftables` ruleset text (status 200) or unavailable reason (status 503).
- `GET /api/network/selfaudit`: Returns results of startup sovereignty assertions (zero API keys, loopback endpoints, Qdrant cloud inference disabled).

---

## 10. Tools & Sandbox

- `GET /api/tools`: List all registered tools, JSON schemas, parameters, and implementation flags.
- `GET /api/tools/{name}`: Retrieve single tool specification.
- `POST /api/tools/{name}/test`: Execute tool validation test outside of a run.
- `GET /api/sandbox/status`: Check Docker daemon connection and sandbox image presence.
- `GET /api/sandbox/policy`: Read isolation constraints (CPU, memory, no network).
- `POST /api/sandbox/guard`: Static AST scan code for disallowed imports (`socket`, `requests`, `urllib`, `subprocess`, `os.system`).

---

## 11. Audit & Event Store

- `GET /api/audit/events`: Query append-only event log with filtering by `run_id`, `type`, `limit`, and `offset`.
- `GET /api/audit/event-types`: Returns the complete event vocabulary list.
- `GET /api/audit/export`: Reserved for signed Ed25519 audit manifest bundles.
