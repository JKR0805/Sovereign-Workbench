# VAJRA: System Architecture & Technical Blueprint

**Smart India Hackathon 2026**: Problem Statement 26117 (Theme: Smart Automation - Software)  
**Project**: VAJRA (Sovereign On-Premise Agentic AI Workbench)  
**Status**: Production Architecture · **Last Updated**: 2026-09-08

---

## 1. Problem Statement Analysis & Requirements Traceability

### 1.1 Problem Statement Requirements
Problem Statement 26117 requires an institutional on-premise agentic AI workbench operating entirely within an organization's physical boundaries with zero external network egress, no proprietary API dependencies, and verifiable isolation.

Key mandatory requirements:
1. **On-Premise Egress Denial**: All computation, inference, embeddings, storage, and agent execution must run locally. UI claims alone are insufficient; the system must demonstrate real-time packet inspection, verifiable network telemetry, and audit logs proving zero external calls.
2. **Model Plurality (Zero Single-Model Lock-in)**: The workbench must not depend on a single vendor or proprietary cloud API. It must support multiple open-weight models installed simultaneously across specialized roles (reasoning, coding, vision, embedding).
3. **Capability-Based Dynamic Routing**: An automated routing engine that analyzes task intent, complexity, context size, and hardware limits to route execution to the optimal local model without hardcoded model names.
4. **Declarative Model Pluggability**: Operators must be able to register new open-weight models via declarative configuration profiles or API endpoints without editing router or orchestrator source code.
5. **Grounded Agent Execution**: An autonomous agent state machine with deterministic budgets, tool calling, AST-guarded sandboxed execution, and structured RAG retrieval with traceable source citations.
6. **Multi-User Security & Conversation Isolation**: Cryptographically secure local authentication, role-based access control, and complete conversation history isolation between non-admin users alongside full administrative audit oversight.
7. **Complete Auditability**: Append-only event store with monotonic sequence IDs and SSE streaming for audit compliance.

### 1.2 Traceability Matrix

| PS 26117 Requirement | Architectural Solution | Technical Subsystem |
| :--- | :--- | :--- |
| Zero data egress | 4-layer egress guard + startup self-audit + nftables drop logging | `vajra.sovereignty`, `vajra.sentinel` |
| No vendor/model lock-in | Pluggable runtime adapter abstraction + declarative model registry | `vajra.runtimes`, `vajra.registry` |
| Multi-model router | Deterministic capability scoring engine (pure function, model-agnostic) | `vajra.router` |
| 8-Stage Routing Pipeline | Intake -> Vision Fallback -> Understand -> Retrieve -> Classify -> Execute -> Verify | `vajra.orchestrator`, `vajra.router.understand` |
| Dynamic model pluggability | Declarative YAML profiles (`config/models/`) + SQLite synchronization | `vajra.registry.profiles` |
| Multi-format local RAG | Tabular pandas parser, DOCX semantic parser, PyMuPDF tables, FastEmbed CPU, Qdrant | `vajra.rag` |
| KB Cleanliness & Isolation | Session-only attachment tagging (`is_canonical: false`) + Explicit Promotion workflow | `vajra.rag.intake`, `vajra.rag.index`, `vajra.store` |
| Multimodal Quality Fallback | Text coverage probe (< 15%), high-DPI rendering, vision model analysis | `vajra.rag.parse`, `vajra.orchestrator` |
| Traceable citations | Numbered citation assembly (`[C1]`) with page and bbox provenance | `vajra.rag.citations` |
| Multi-user & RBAC | Argon2id passwords, 32-byte crypto sessions, UserRole guards, chat isolation | `vajra.auth`, `vajra.orchestrator.conversations` |
| Autonomous agent worker | Typed state machine + tool registry + AST-guarded Docker sandbox | `vajra.agent`, `vajra.sandbox`, `vajra.tools` |
| Complete auditability | Append-only event store with monotonic sequence IDs and SSE streaming | `vajra.events` |

---

## 2. System Topology & Network Isolation

```text
┌──────────────────────────────────────────────────────────────────┐
│ WORKSTATION / GPU SERVER (Physical Airgap Boundary)             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ vajra_frontend (172.28.0.0/24) : egress DENY               │  │
│  │   web      :3000   Next.js 15 App Router                   │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │ HTTP + SSE                         │
│  ┌──────────────────────────┴─────────────────────────────────┐  │
│  │ vajra_core (172.29.0.0/24) : egress DENY                   │  │
│  │   api      :8000   FastAPI orchestrator                    │  │
│  │   qdrant   :6333   vectors + local disk storage            │  │
│  │   ollama   :11434  model runtime (local GPU passthrough)   │  │
│  │   sentinel :9900   egress monitor (host netns, packet log) │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │ docker.sock (guarded)              │
│  ┌──────────────────────────┴─────────────────────────────────┐  │
│  │ vajra_sandbox (internal: true, --network=none)             │  │
│  │   ephemeral python:3.11 container, no network interfaces   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Storage: ./data/{uploads,artifacts,qdrant,sqlite} (Local disk) │
└──────────────────────────────────────────────────────────────────┘
```

### Dependency Flow & Layer Boundaries
The backend enforces a strict one-way dependency graph verified by unit tests:
```text
api -> orchestrator -> {router, rag, auth, services} -> adapters -> store/events -> core
```
No layer may import from a layer above it. Circular dependencies are forbidden.

---

## 3. Four-Layer Sovereignty & Egress Defense

VAJRA enforces network sovereignty through four independent layers:

```text
Outbound Request Attempt
  │
  ▼
[Layer 1: Process Hook] ──► Blocked? ──► Raises SovereigntyViolation & emits EGRESS_BLOCKED
  │ (No)
  ▼
[Layer 2: Startup Audit] ──► Cloud keys / WAN endpoints configured? ──► Abort boot (fail-closed)
  │ (No)
  ▼
[Layer 3: Docker Sandbox] ──► Container network disabled (--network=none) ──► Kernel network unreachable
  │ (No)
  ▼
[Layer 4: Kernel Netfilter] ──► nftables drops non-RFC1918 packets & logs to /var/log/kern.log
```

1. **Layer 1: In-Process Application Guard (`vajra.sovereignty.guard`)**:
   - Monkeypatches Python's `socket.socket.connect` before any third-party libraries load.
   - Evaluates target IP/hostname against loopback (`127.0.0.0/8`, `::1`), RFC1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and Docker bridge CIDRs.
   - Any external connection raises `SovereigntyViolation` and writes an `EGRESS_BLOCKED` record with a full stack trace identifying the calling module.
2. **Layer 2: Startup Self-Audit (`vajra.sovereignty.selfaudit`)**:
   - Asserts zero cloud API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `AWS_SECRET_ACCESS_KEY`).
   - Asserts all configured service URLs point to loopback, RFC1918, or Compose service hostnames.
   - Asserts Qdrant `cloud_inference` is explicitly disabled.
   - In `airgap` mode, failure of any assertion immediately halts application startup (`fail_closed`).
3. **Layer 3: Container Network Isolation**:
   - Code execution containers run with `network_disabled=True` (`--network=none`).
   - Docker Compose services run on private internal bridges (`internal: true`) with no default gateway off-host.
4. **Layer 4: Host Kernel Netfilter (`nftables`)**:
   - Drops and logs all outbound packets to non-private destinations.

---

## 4. Intelligent Model Routing & Processing Pipeline (8 Stages)

The workbench implements an 8-stage intelligent routing pipeline designed to handle heterogeneous file formats, multimodal fallback, immutable intent authority, and deterministic capability matching.

```text
                         USER REQUEST
                              │
                              ▼
                     ┌─────────────────┐
                     │   Intake Layer  │ (Node 0)
                     │ Prompt + Files  │
                     └────────┬────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
         [ Has Attachments ]        [ No Attachment ]
                 │                         │
                 ▼                         │
         ┌───────────────┐                 │
         │ File Parsing  │                 │
         │ (PDF/CSV/DOCX)│                 │
         └───────┬───────┘                 │
                 │                         │
           Quality Probe                   │
        (text coverage < 15%?              │
         scanned pages?)                   │
                 │                         │
        ┌────────┴────────┐                │
   [Failed]            [Passed]            │
        │                 │                │
        ▼                 │                │
┌───────────────┐         │                │
│ Multimodal    │ (Node 1)│                │
│ Vision Model  │         │                │
└───────┬───────┘         │                │
        │                 │                │
        └────────┬────────┘                │
                 ▼                         │
       extracted_file_context              │
                 │                         │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │    Semantic Query       │
                 │  Understanding Engine   │
                 │     (General Model)     │
                 └────────────┬────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
    original_prompt                     enhanced_prompt
 (IMMUTABLE INTENT AUTHORITY)        (Keyword-rich for RAG)
            │                                   │
            │                  ┌────────────────┘
            │                  ▼
            │        ┌───────────────────┐
            │        │   RAG Retrieval   │ (Node 2)
            │        │  (Scoped/Corpus)  │
            │        └─────────┬─────────┘
            │                  │
            │                  ▼
            │          retrieved_context
            │                  │
            └──────────┬───────┘
                       │
                       ▼
            ┌─────────────────────┐
            │   Task Classifier   │ (Node 3)
            │     & Router        │
            └──────────┬──────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
[ Coding Task ]                [ General Task ]
Capability.CODING               Capability.TEXT/REASONING
       │                               │
       ▼                               ▼
Coding Specialist Model         General Intelligence Model
(e.g., qwen2.5-coder:7b)        (e.g., qwen3:8b / llama3)
       │                               │
       └───────────────┬───────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  Target Generation  │ (Node 4)
            │   Execution Node    │
            └──────────┬──────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  Sovereignty Guard  │ (Node 5)
            │  Verification Node  │
            └─────────────────────┘
```

### Stage Details

1. **Node 0: Attachment Intake & Multi-Format Parsing (`vajra.rag.intake`, `vajra.rag.parse`)**:
   - Files enter through a unified intake pipeline with format detection and provenance tracking.
   - **Session-Only vs. Canonical Flagging (`is_canonical`)**: Chat attachments default to `is_canonical: false` to ensure ephemeral or unverified documents do not pollute the global knowledge base. Files explicitly added to the Knowledge Base carry `is_canonical: true`.
   - **Tabular Data (`.csv`, `.tsv`, `.xlsx`, `.xls`)**: Parsed via `pandas`. Extracts column names and data types, row/column counts, and numerical descriptive statistics (`df.describe()`). Data is formatted into bounded markdown tables.
   - **Word Documents (`.docx`)**: Parsed via `python-docx` into semantic headings, lists, tables, and paragraphs.
   - **PDFs (`.pdf`)**: Parsed via PyMuPDF with `find_tables()` extracting structured grid rows into markdown tables.
   - **Direct Image Attachments (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`)**: Tagged as `DocumentStatus.SKIPPED` for text indexing and dispatched immediately to the multimodal vision specialist.

2. **Node 1: Multimodal Vision Preprocessing / Image Analysis (`vajra.orchestrator.service`)**:
   - **Direct Images**: When image attachments are supplied, `_intake_image` retrieves the raw file bytes, base64 encodes them, and delivers them directly to the local vision specialist model (`llava:7b`).
   - **Scanned PDF Fallback**: For document uploads, `PageClassifier` calculates text-layer area coverage. If coverage < 15% or pages are `SCANNED`, PyMuPDF renders high-DPI base64 PNG pages (`pixmap(dpi=150)`).
   - **Vision Normalization**: The vision specialist inspects the images, transcribing text, describing visual diagrams, schematics, charts, or handwriting, and compiles the analysis into `extracted_file_context`.
   - **Decoupled Architecture**: Because vision analysis is completed during preprocessing, the downstream answering model does not need native vision capabilities—any high-performing general or coding model can reason over the extracted visual context.
   - **Simultaneous Vision + RAG Grounding**: When a user request includes both an image attachment and requires information from the corporate knowledge base, the pipeline processes the image via Node 1 and simultaneously executes vector retrieval via Node 2. Both the vision analysis and the retrieved citations are synthesized into the model's final context window.

3. **Stage 2: Semantic Query Understanding (`vajra.router.understand`)**:
   - Queries the general model to derive `enhanced_prompt` (optimized with domain entities and terminology for vector search).
   - Identifies if the task requires programming, script writing, or technical automation (`is_coding_task: bool`).
   - Invariant: `original_prompt` remains strictly immutable as the authoritative user intent.

4. **Node 2: Dual-Scope Vector Retrieval & Knowledge Base Isolation (`vajra.rag.retrieve`, `vajra.rag.index`)**:
   - Queries local Qdrant index using `enhanced_prompt` with CPU-offloaded FastEmbed embeddings.
   - **Corpus-Wide Search**: When querying the general knowledge base (`document_ids` empty or omitted), Qdrant applies a strict payload filter: `FieldCondition(key="is_canonical", match=MatchValue(value=True))`. Ephemeral chat attachments are completely invisible.
   - **Attachment-Scoped Search**: When documents are attached to the current chat turn or inherited from prior turns, the search is scoped explicitly to those `document_ids`, allowing immediate grounding without polluting the global index.
   - **Explicit Promotion**: Users can inspect chat attachments in the UI and click "Add to Knowledge Base" (`POST /api/knowledge/documents/{id}/promote`). This updates SQLite and sets `is_canonical = True` across all chunk points in Qdrant, seamlessly graduating the document into the authoritative corpus.
   - **Numbered Citations**: Results are assembled into numbered markers (`[C1]`, `[C2]`) carrying document filename, section path, and page provenance.

5. **Node 3: Task Classification & Model Routing (`vajra.router`)**:
   - Analyzes `original_prompt`, `enhanced_prompt`, attachments, and `is_coding_task`.
   - Tasks with `is_coding_task=True` are mapped directly to `Capability.CODING`.
   - The capability router executes hard filters (VRAM, context, modalities) and computes 7-factor weighted scores.
   - Models are selected dynamically from `ModelRegistry` with zero hardcoded model names.

6. **Node 4: Target Model Execution (`vajra.orchestrator.service`)**:
   - For coding tasks, formats execution with `STRUCTURED_CODING_SYSTEM_PROMPT` containing tabular schemas, descriptive stats, and execution constraints.
   - Streams tokens via SSE to the user interface.

7. **Node 5: Sovereignty Verification**:
   - Reads the network ledger for the run duration.
   - Produces a verifiable verdict (`pass`, `fail`, `unverified`).

---

## 5. Multi-User Authentication & Conversation Isolation

```text
HTTP Request
  │
  ▼
[Session Middleware] ── Cookie: `vajra_session` or Header: `Authorization: Bearer <token>`
  │
  ├─► [Invalid / Expired] ──► 401 Unauthorized
  │
  └─► [Valid Token]
        │
        ▼
   [Resolve UserRecord] (id, username, role)
        │
        ├─► [User Role Guard] ── Role matches endpoint policy? (ADMIN, USER, AUDITOR)
        │
        └─► [Resource Ownership Guard]
              │
              ├─► User is ADMIN? ──► Full visibility across all users' data
              │
              └─► User is standard USER? ──► Scoped strictly to resource.user_id == current_user.id
```

### Architectural Properties
- **Passwords**: Hashed with Argon2id (memory cost 64MB, iterations 3) with HMAC-SHA256 fallback.
- **Sessions**: Cryptographically random 32-byte tokens (`secrets.token_urlsafe(32)`). The raw token is stored on the client; only its SHA-256 hash is persisted in SQLite.
- **Timeouts**: Enforces 1-hour idle timeout and 24-hour absolute maximum lifespan.
- **Conversation State Isolation**: Conversations and turns carry `user_id`. When standard users query `/api/conversations`, they only receive their own records. Admins can view all conversations with user attribution tags.
- **New Chat Independence**: Frontend and backend cleanly decouple conversation lifecycle so starting a new chat creates a fresh thread without state leakage from previous chats.

---

## 6. Hardware Fleet Profiles & VRAM Management

### Target Profile: 8 GB Laptop GPU
```text
  8.0 GB physical VRAM
- 1.0 GB desktop compositor & browser display
- 0.3 GB operating system safety headroom
─────────────────────────────────────────────────
  6.7 GB usable for a single model and its KV cache
```

- **CPU Offloaded Embeddings**: FastEmbed runs ONNX `bge-small-en-v1.5` on CPU, preserving 100% of GPU VRAM for LLMs.
- **Single-Resident Policy**: Exactly one generative model resides in GPU memory at a time with a 30-minute keep-alive.
- **Bounded Context**: Context windows default to `num_ctx: 8192` tokens to balance KV cache memory against reasoning capacity.

| Profile | Physical VRAM | Primary General Model | Coding Specialist | Vision Model | Embedding Engine |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `laptop-8gb.yaml` | 8 GB (~6.7 GB net) | `qwen3:8b` (Q4_K_M) | `qwen2.5-coder:7b` | `llava:7b` | FastEmbed CPU |
| `mid-16gb.yaml` | 16 GB (~14.5 GB net)| `qwen3:8b` | `qwen2.5-coder:7b` | `llava:7b` | FastEmbed CPU / Local GPU |
| `high-perf-24gb.yaml`| 24-48 GB | `qwen3.6:27b` | `qwen3-coder:30b` | `llava:13b` | FastEmbed CPU / BGE-M3 |

---

## 7. Event Sourcing & Audit Ledger

All system operations, node steps, and tokens are written to an append-only event log in SQLite:

```text
Event Producers (Orchestrator, Router, RAG, Egress Guard)
  │
  ▼
[EventBus (vajra.events.bus)] ──► Assigns monotonic sequence ID (seq)
  │
  ▼
[Persist to SQLite (events table)] ── (Persist before fanout)
  │
  ▼
[Async In-Memory Fanout]
  ├─► Server-Sent Events (SSE) Stream (/api/runs/{id}/events)
  ├─► Global Network Stream (/api/network/events/stream)
  └─► Tamper-Evident Audit Export Log
```

Guarantees:
1. **Single Source of Truth**: UI state is reconstructed completely by replaying events from sequence 0 forward.
2. **Deterministic Replay**: Replaying an audit log reconstructs the exact timeline of inference.
3. **Resilient Reconnection**: Clients reconnect using `?since=<seq>` to backfill missed events during network hiccups.
