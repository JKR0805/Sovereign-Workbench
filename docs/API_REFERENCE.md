# VAJRA: Complete REST & SSE API Reference

**Sovereign On-Premise Agentic AI Workbench**  
**Version**: 0.2.0 · **Status**: Verified Production API · **Last Updated**: 2026-09-08

---

## 1. Protocol Conventions & Error Standard

### Base URL
```text
http://127.0.0.1:8000
```
All routes are prefixed with `/api`.

### Content Types
- Standard requests & responses: `application/json`
- Real-time streaming: `text/event-stream`
- Document uploads: `multipart/form-data`
- Network rulesets: `text/plain`

### Authentication
- Session cookie: `vajra_session=<token>` (HTTPOnly, SameSite=Lax)
- Alternative Authorization header: `Authorization: Bearer <token>`
- Initial bootstrap administrator credentials: `admin` / `sovereign2026`

### RFC 7807 Problem Details
All domain errors subclass `VajraError` and serialize as `application/problem+json`:
```json
{
  "type": "https://vajra.local/errors/unauthorized",
  "title": "Authentication required",
  "status": 401,
  "detail": "Authentication required to access this resource",
  "code": "unauthorized",
  "instance": "http://127.0.0.1:8000/api/runs"
}
```

---

## 2. Authentication & Administration

### 2.1 User Login
`POST /api/auth/login`

#### Request Body
```json
{
  "username": "admin",
  "password": "sovereign2026"
}
```

#### Response (200 OK)
Sets `vajra_session` cookie and returns user profile:
```json
{
  "user": {
    "id": "usr_94f83b1a2c",
    "username": "admin",
    "display_name": "Administrator",
    "role": "admin",
    "enabled": true,
    "created_at": "2026-09-08T12:00:00Z",
    "last_login_at": "2026-09-08T12:05:00Z"
  }
}
```

---

### 2.2 Current User Profile
`GET /api/auth/me`

#### Response (200 OK)
```json
{
  "user": {
    "id": "usr_94f83b1a2c",
    "username": "admin",
    "display_name": "Administrator",
    "role": "admin",
    "enabled": true,
    "created_at": "2026-09-08T12:00:00Z",
    "last_login_at": "2026-09-08T12:05:00Z"
  }
}
```

---

### 2.3 User Logout
`POST /api/auth/logout`

Revokes session token and clears `vajra_session` cookie.

---

### 2.4 User Management (Admin Only)
`GET /api/admin/users`

#### Response (200 OK)
```json
{
  "users": [
    {
      "id": "usr_94f83b1a2c",
      "username": "admin",
      "display_name": "Administrator",
      "role": "admin",
      "enabled": true,
      "created_at": "2026-09-08T12:00:00Z",
      "last_login_at": "2026-09-08T12:05:00Z",
      "conversation_count": 14
    }
  ]
}
```

#### Related Admin Actions
- `POST /api/admin/users`: Create a new user (`username`, `password`, `role`, `display_name`).
- `PATCH /api/admin/users/{user_id}/status`: Toggle account (`enabled: true | false`).
- `PATCH /api/admin/users/{user_id}/role`: Update role (`role: "admin" | "user" | "auditor"`).
- `POST /api/admin/users/{user_id}/reset-password`: Set temporary password.

---

## 3. Conversations & Chat History

### 3.1 List Conversations
`GET /api/conversations`

#### Query Parameters
- `limit` (optional, integer, default: `25`): Max items to return.
- `user_id` (optional, string, admin only): Filter conversations by specific user.

#### Response (200 OK)
```json
{
  "conversations": [
    {
      "id": "conv_8bb6e31d588c",
      "title": "Cryogenic Turbopump Diagnostics",
      "user_id": "usr_94f83b1a2c",
      "user_name": "admin",
      "turn_count": 4,
      "total_tokens": 12840,
      "created_at": "2026-09-08T14:20:00Z",
      "updated_at": "2026-09-08T14:25:30Z"
    }
  ]
}
```

---

### 3.2 Get Conversation Turns
`GET /api/conversations/{id}`

Returns the full multi-turn chat history for the conversation including prompt, assistant content, model used, tokens, and citations.

---

### 3.3 Delete Conversation
`DELETE /api/conversations/{id}`

Removes conversation and cascades deletion to all associated turns.

---

## 4. Run Execution & Real-Time Event Streaming

### 4.1 Create Run
`POST /api/runs`

Starts an 8-stage inference execution.

#### Request Body
```json
{
  "prompt": "Write a python script to parse logs and calculate latency statistics.",
  "execution_mode": "agent",
  "conversation_id": "conv_8bb6e31d588c",
  "attachments": [
    {
      "filename": "server_telemetry.csv",
      "mime": "text/csv",
      "data_base64": "<base64_encoded_bytes>",
      "size_bytes": 1024
    }
  ]
}
```

#### Response (202 Accepted)
```json
{
  "run_id": "run_06c19c15ddd2",
  "status": "queued",
  "execution_mode": "agent",
  "events_url": "/api/runs/run_06c19c15ddd2/events",
  "conversation_id": "conv_8bb6e31d588c",
  "user_message_id": "msg_user_123",
  "assistant_message_id": "msg_asst_456"
}
```

---

### 4.2 Run Server-Sent Events (SSE)
`GET /api/runs/{run_id}/events`

Streams real-time execution steps, model arbitration, and LLM output tokens. Supports `?since=<seq>` to backfill missed events.

#### Event Stream Protocol

1. **`NODE_ENTERED`**:
   ```json
   { "node_id": "intake", "kind": "document_intake", "ordinal": 0 }
   ```
2. **`EXTRACTION_COMPLETED`**:
   ```json
   {
     "filename": "server_telemetry.csv",
     "chunk_count": 2,
     "summary": "Tabular file (100 rows, 4 columns). Schema: id (int64), latency_ms (float64)",
     "requires_multimodal": false
   }
   ```
3. **`MULTIMODAL_FALLBACK`**:
   ```json
   {
     "image_count": 3,
     "reason": "Incomplete text or scanned pages detected; multimodal extraction active."
   }
   ```
4. **`PROMPT_ENHANCED`**:
   ```json
   {
     "original_prompt": "Write a python script to parse logs and calculate latency statistics.",
     "enhanced_prompt": "Write a python script using pandas and numpy to parse server_telemetry.csv and compute p50, p95, p99 latency statistics",
     "is_coding_task": true,
     "intent": "coding and statistics",
     "source": "general_model"
   }
   ```
5. **`TASK_CLASSIFIED`**:
   ```json
   {
     "intent": "code",
     "complexity": "medium",
     "required_capabilities": ["coding"],
     "is_coding_task": true
   }
   ```
6. **`MODEL_CANDIDATES`**:
   ```json
   {
     "candidates": [
       { "model_id": "qwen2.5-coder:7b", "score": 94.2, "resident": true },
       { "model_id": "qwen3:8b", "score": 78.5, "resident": false }
     ]
   }
   ```
7. **`MODEL_SELECTED`**:
   ```json
   {
     "model_id": "qwen2.5-coder:7b",
     "runtime_model_id": "qwen2.5-coder:7b",
     "score": 94.2,
     "display_name": "Qwen 2.5 Coder 7B"
   }
   ```
8. **`RAG_RESULTS`**:
   ```json
   {
     "scope": "run_attachments",
     "chunk_count": 2,
     "grounded": true
   }
   ```
9. **`LLM_TOKEN`**:
   ```json
   { "token": "def " }
   ```
10. **`NODE_COMPLETED`**:
    ```json
    { "node_id": "execute", "duration_ms": 1420.5, "ordinal": 4 }
    ```
11. **`RUN_COMPLETED`**:
    ```json
    {
      "duration_ms": 2840.2,
      "total_tokens": 480,
      "tokens_per_sec": 42.1,
      "models_used": ["qwen2.5-coder:7b"],
      "verification": "pass"
    }
    ```

---

## 5. Knowledge Base & Document Ingestion

### 5.1 Ingest Document
`POST /api/knowledge/documents`

Uploads, parses, chunks, and embeds documents into the sovereign knowledge base or session context.

#### Query Parameters
- `canonical` (optional, boolean, default: `true`):
  - When `true` (default for Knowledge Base uploads): The document is ingested as an authoritative canonical source, searchable across all corpus-wide queries.
  - When `false` (used for chat message attachments): The document is ingested as a **session-only** artifact. Chunks are tagged with `is_canonical: false`, isolating them from the general corpus search while remaining retrievable when explicitly scoped to the run.

#### Form Data
- `file`: Binary file.
  - **Structured / Text Formats**: `.pdf`, `.docx`, `.csv`, `.xlsx`, `.xls`, `.tsv`, `.txt`, `.md`, `.json`, `.log`.
  - **Image Formats**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` (preprocessed via multimodal vision specialist model `llava:7b`).
- `title` (optional): Human-readable document name.

#### Response (201 Created)
```json
{
  "id": "doc_8c1b29a4e",
  "title": "server_telemetry.csv",
  "filename": "server_telemetry.csv",
  "mime": "text/csv",
  "size_bytes": 1024,
  "chunk_count": 2,
  "page_count": 1,
  "scanned_page_count": 0,
  "summary": "Tabular file (100 rows, 4 columns). Schema: id (int64), latency_ms (float64)",
  "status": "ready",
  "is_canonical": true,
  "created_at": "2026-09-08T15:00:00Z"
}
```

---

### 5.2 List Documents
`GET /api/knowledge/documents`

Lists ingested documents with pagination and canonical filtering.

#### Query Parameters
- `canonical_only` (optional, boolean, default: `true`): If `true`, returns only authoritative knowledge base documents. If `false`, returns all documents including session-only chat attachments.
- `limit` (optional, integer, default: `100`): Maximum records to return.
- `offset` (optional, integer, default: `0`): Pagination offset.

#### Response (200 OK)
```json
[
  {
    "id": "doc_8c1b29a4e",
    "title": "server_telemetry.csv",
    "filename": "server_telemetry.csv",
    "mime": "text/csv",
    "size_bytes": 1024,
    "chunk_count": 2,
    "page_count": 1,
    "scanned_page_count": 0,
    "summary": "Tabular file (100 rows, 4 columns). Schema: id (int64), latency_ms (float64)",
    "status": "ready",
    "is_canonical": true,
    "created_at": "2026-09-08T15:00:00Z"
  }
]
```

---

### 5.3 Promote Document to Canonical Knowledge Base
`POST /api/knowledge/documents/{document_id}/promote`

Explicitly promotes a session-only document (such as a vetted chat attachment) into the permanent, authoritative knowledge base.

#### Behavior
1. Updates the SQLite record: `documents.is_canonical = 1`.
2. Updates all vector point payloads in Qdrant: `is_canonical = true`.
3. The document immediately becomes discoverable in all future corpus-wide searches.

#### Response (200 OK)
Returns the updated `DocumentRead` object:
```json
{
  "id": "doc_8c1b29a4e",
  "title": "emergency_protocol.md",
  "filename": "emergency_protocol.md",
  "mime": "text/markdown",
  "size_bytes": 512,
  "chunk_count": 1,
  "page_count": 1,
  "scanned_page_count": 0,
  "summary": "Emergency protocols",
  "status": "ready",
  "is_canonical": true,
  "created_at": "2026-09-08T15:00:00Z"
}
```

---

### 5.4 Document Management & Chunks

- `GET /api/knowledge/documents/{document_id}`: Retrieves document metadata.
- `DELETE /api/knowledge/documents/{document_id}`: Deletes document record, associated chunks from SQLite, and vector embeddings from Qdrant (`204 No Content`).
- `GET /api/knowledge/documents/{document_id}/chunks`: Returns an array of parsed text chunks with token counts, headings, and page boundaries.

---

### 5.5 Search Knowledge Base
`POST /api/knowledge/search`

Executes dual-mode semantic vector search with numbered citation assembly.

#### Request Body
```json
{
  "query": "turbopump vibration limits",
  "document_ids": ["doc_8c1b29a4e"],
  "top_k": 5,
  "threshold": 0.4
}
```

#### Dual-Scope Retrieval Modes
- **Corpus Search** (`document_ids` is `null` or `[]`):
  Enforces a strict Qdrant payload filter `is_canonical == true`. Only verified, authoritative knowledge base documents are searched. Session-only chat attachments are completely excluded.
- **Attachment-Scoped Search** (`document_ids` contains IDs):
  Queries chunks belonging strictly to the specified document IDs (used during chat execution when attachments are active), allowing session-only documents to ground the prompt without polluting the global index.

#### Response (200 OK)
```json
{
  "query": "turbopump vibration limits",
  "chunks": [
    {
      "chunk_id": "chk_1849a",
      "document_id": "doc_8c1b29a4e",
      "title": "Cryogenic Turbopump TP-800",
      "text": "Band 2 Synchronous (1X) critical abort limit is 8.0 g RMS.",
      "score": 0.892,
      "section_path": "Turbopump TP-800 > Spectral Bands",
      "page_from": 2,
      "page_to": 2,
      "marker": "[C1]"
    }
  ],
  "timings": {
    "embed_ms": 12.4,
    "search_ms": 4.1
  }
}
```

---

## 6. Models & Runtime Registry

### 6.1 List Models
`GET /api/models`

#### Query Parameters
- `capability` (optional): Filter by capability (e.g. `coding`, `reasoning`, `vision`).
- `enabled_only` (optional, default: `false`): Filter enabled models.

#### Response (200 OK)
```json
[
  {
    "id": "coding-specialist",
    "display_name": "Qwen 2.5 Coder 7B",
    "runtime_id": "ollama-local",
    "runtime_model_id": "qwen2.5-coder:7b",
    "capabilities": {
      "text": 0.85,
      "coding": 0.95
    },
    "context_window": 32768,
    "num_ctx": 8192,
    "vram_gb": 4.7,
    "enabled": true,
    "health": "healthy"
  }
]
```

---

### 6.2 VRAM Residency Status
`GET /api/models/residency`

Returns the currently loaded models resident in GPU VRAM and historical eviction metrics.

---

## 7. Sovereignty & Network Sentinel

### 7.1 Network Egress Snapshot
`GET /api/network/snapshot`

Returns live telemetry from the in-process socket sentinel:
```json
{
  "egress_guard_installed": true,
  "policy": "fail_closed",
  "blocked_attempts_total": 0,
  "allowed_loopback_connections": 1428,
  "active_sockets": 4
}
```
