# VAJRA: System Architecture & Technical Blueprint

**Smart India Hackathon 2026**: Problem Statement 26117 (Theme: Smart Automation - Software)  
**Project**: VAJRA (Sovereign On-Premise Agentic AI Workbench)

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
6. **Institutional Artifact Generation**: Autonomous generation of standard deliverable documents (DOCX, XLSX, PPTX, PDF) verified against local knowledge.
7. **Complete Auditability**: Append-only event store with monotonic sequence IDs and SSE streaming for audit compliance.

### 1.2 Traceability Matrix

| PS 26117 Requirement | Architectural Solution | Technical Subsystem |
| :--- | :--- | :--- |
| Zero data egress | 4-layer egress guard + startup self-audit + nftables drop logging | `vajra.sovereignty`, `vajra.sentinel` |
| No vendor/model lock-in | Pluggable runtime adapter abstraction + declarative model registry | `vajra.runtimes`, `vajra.registry` |
| Multi-model router | Deterministic capability scoring engine (pure function, model-agnostic) | `vajra.router` |
| Dynamic model pluggability | Declarative YAML profiles (`config/models/`) + SQLite synchronization | `vajra.registry.profiles` |
| Local document grounding | PyMuPDF parser + CPU FastEmbed ONNX + local Qdrant vector store | `vajra.rag` |
| Traceable citations | Numbered citation assembly (`[C1]`) with page and bbox provenance | `vajra.rag.citations` |
| Autonomous agent worker | Typed state machine + tool registry + AST-guarded Docker sandbox | `vajra.agent`, `vajra.sandbox`, `vajra.tools` |
| Institutional deliverables | Document generators producing DOCX, XLSX, PPTX, PDF | `vajra.artifacts` |
| Complete auditability | Append-only event store with monotonic sequence IDs and SSE streaming | `vajra.events` |

---

## 2. System Topology & Network Isolation

```text
┌──────────────────────────────────────────────────────────────────┐
│ WORKSTATION / GPU SERVER (Physical Airgap Boundary)             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ vajra_frontend (172.28.0.0/24) : egress DENY               │  │
│  │   web      :3000   Next.js static + standalone server      │  │
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
api -> orchestrator -> {services} -> adapters -> store/events -> core
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
   - Host kernel rule drops and logs all outbound packets to non-private destinations:
     ```text
     table inet vajra {
       chain output {
         type filter hook output priority 0; policy accept;
         ip daddr { 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 } accept
         meta skuid vajra log prefix "VAJRA-EGRESS-BLOCK " level warn counter drop
       }
     }
     ```
   - Kernel drop counters are read directly and displayed in the Network UI.

---

## 4. Hardware Profiles & VRAM Management

### 4.1 Target Profile: 8 GB Laptop GPU
Workstations in field operations often feature constrained GPUs (e.g. NVIDIA RTX 3070/4060 Laptop with 8 GB physical VRAM).

#### Usable Memory Budget
```text
  8.0 GB physical VRAM
- 1.0 GB desktop compositor & browser display
- 0.3 GB operating system safety headroom
─────────────────────────────────────────────────
  6.7 GB usable for a single model and its KV cache
```

#### Key Engineering Decisions for 8 GB Constraints
1. **CPU Offloading for Embeddings & Reranking**:
   - Vector embeddings run on CPU via FastEmbed ONNX (`BAAI/bge-small-en-v1.5`, 384 dimensions).
   - Frees ~1.5 GB of VRAM permanently for generative models with negligible CPU latency (~38ms).
2. **Single-Resident VRAM Policy**:
   - Configured with `max_loaded_models: 1` and `keep_alive: 30m`.
   - Exactly one generative model resides in GPU memory at a time.
   - The residency manager coordinates loading and evicting models dynamically.
3. **Bounded Context Windows**:
   - Long contexts consume substantial KV cache memory.
   - Context is capped at `num_ctx: 8192` tokens per model, allowing RAG retrieval to supply necessary context rather than stuffing context windows.

### 4.2 Supported Fleet Profiles

| Profile Name | Target VRAM | Primary Reasoning | Coding Model | Vision Specialist | Embeddings |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `laptop-8gb.yaml` | 8 GB physical (~6.7 GB net) | `qwen3:8b` (Q4_K_M, ~5.0 GB) | `qwen2.5-coder:7b` (~4.7 GB) | `qwen2.5-vl:3b` (~3.2 GB) | FastEmbed CPU (0 GB VRAM) |
| `mid-16gb.yaml` | 16 GB physical (~14.5 GB net)| `qwen3:8b` | `qwen2.5-coder:7b` | `qwen2.5-vl:7b` | FastEmbed CPU or local GPU |
| `high-perf-24gb.yaml`| 24-48 GB workstation | `qwen3.6:27b` | `qwen3-coder:30b` | `qwen3-vl:32b` | BGE-M3 / Qwen3-Embedding |

---

## 5. Model-Agnostic Routing Engine

The routing engine contains **zero** hardcoded model names. It evaluates models as declarative resources through a 5-stage deterministic pipeline.

```text
Incoming Task Spec
  │
  ▼
[Stage 1: Intent & Feature Classification] (Keywords + Heuristics)
  │
  ▼
[Stage 2: Hard Filtering] (Capabilities, Modalities, Context Fit, VRAM bounds)
  │
  ▼
[Stage 3: 7-Factor Weighted Scoring] (Pure mathematical formula)
  │
  ▼
[Stage 4: Policy Overlay] (Declarative user/project rules)
  │
  ▼
[Stage 5: Fallback Chain Assembly] ──► RoutingDecision
```

### 5.1 Stage 1: Task Classification
Extracts required capabilities, preferred capabilities, input modalities (`text`, `image`), and estimated token budgets based on prompt features and attachments.

### 5.2 Stage 2: Hard Filters
Eliminates candidates that cannot execute the task:
- Model is `disabled` or `unhealthy`.
- Missing any *required* capability (e.g. lacks `vision` for image tasks).
- Missing any required input modality.
- Context window insufficient (`context_window < estimated_input_tokens * 1.3`).
- VRAM exceeds available memory plus evictable memory.

### 5.3 Stage 3: 7-Factor Weighted Scoring Formula
Remaining candidates are scored on a scale from 0 to 100:

$$\text{Score} = 100 \times \frac{\sum_{i=1}^{7} (w_i \times f_i)}{\sum_{i=1}^{7} w_i}$$

Where the 7 scoring factors and default weights are:

| Factor | Description | Default Weight ($w$) |
| :--- | :--- | :--- |
| $f_{\text{capability}}$ | Mean strength across required capabilities | $0.40$ |
| $f_{\text{preferred}}$ | Mean strength across preferred capabilities | $0.15$ |
| $f_{\text{context}}$ | Fit ratio: $\text{clamp}\left(\frac{\log(\text{ctx}/\text{needed})}{\log(8)}, 0, 1\right)$ | $0.10$ |
| $f_{\text{latency}}$ | Latency score: $1 - \text{clamp}\left(\frac{\text{ema\_latency}}{\text{budget}}, 0, 1\right)$ | $0.10$ |
| $f_{\text{priority}}$ | Operator-configured priority offset ($0.0 - 1.0$) | $0.10$ |
| $f_{\text{residency}}$ | Residency affinity: $1.0$ if already resident in VRAM, else $0.35$ | $0.10$ |
| $f_{\text{reliability}}$ | Historical reliability: $1 - \text{error\_rate}$ | $0.05$ |

### 5.4 Stage 4: Policy Overlay
Applies declarative institutional rules defined in Routing Studio (e.g. "Confidential Class A tasks must run on loopback Ollama instances").

### 5.5 Stage 5: Fallback Chain
Constructs an ordered list of fallback models. If the primary model fails, times out, or produces malformed structured output, the orchestrator transitions to the next candidate and records the branch event.

---

## 6. Local Document RAG Subsystem

```text
Uploaded File (.pdf, .md, .txt, .csv)
  │
  ▼
[Document Parser (PyMuPDF)] ──► Extracts text blocks, headings, page bboxes
  │
  ▼
[Page Classifier] ──► Digital text page vs Scanned image page
  │
  ▼
[Structure-Aware Chunker] ──► Heading hierarchy, section paths, token estimation
  │
  ▼
[CPU Embedder (FastEmbed ONNX)] ──► BAAI/bge-small-en-v1.5 (384 dimensions)
  │
  ▼
[Vector Store (Qdrant)] ──► Embedded on-disk (data/qdrant) or local daemon (:6333)
  │
  ▼
[Hybrid Retrieval & Citation Assembly] ──► Grounded chunks with [C1], [C2] markers
```

### 6.1 Parsing & Provenance
- `PyMuPDFParser` extracts text blocks while capturing exact page numbers and bounding box coordinates.
- `PageClassifier` evaluates text coverage. Pages with less than 15% text coverage are classified as `SCANNED`, flagging them for future vision-language extraction.

### 6.2 Structure-Aware Chunking
- Splits along heading hierarchies rather than arbitrary character windows.
- Packs chunks to ~700 tokens with 15% overlap, preserving section paths (e.g. `Heat Exchanger E-102 > Maintenance Thresholds`).
- Prepends `"{doc_title} > {section_path}"` to the chunk text before embedding to improve retrieval accuracy on terse SOP documents.

### 6.3 Local Vector Storage & Retrieval
- Operates in embedded mode (`data/qdrant`) with zero Docker dependency, or connects to a local daemon (`http://127.0.0.1:6333`).
- Evaluates queries with cosine similarity.
- Citation assembler formats source markers (`[C1]`, `[C2]`) mapped directly to document pages and bounding boxes.

---

## 7. Code Execution Sandbox & AST Guard

```text
Generated Python Code
  │
  ▼
[AST Static Guard (vajra.sandbox.guard)]
  │ ── Disallowed imports? (socket, requests, urllib, httpx, subprocess, os.system, eval, exec)
  │
  ├─► [Violations Found] ──► Reject with GuardFinding list before execution
  │
  └─► [Accepted]
        │
        ▼
[Docker Sandbox Container (vajra.sandbox.docker)]
  │ ── network_disabled = True (--network=none)
  │ ── read_only root filesystem
  │ ── nano_cpus = 2 cores, mem_limit = 1GB
  │ ── tmpfs = /tmp (size=64m, noexec)
  │ ── user = 65534:65534 (nobody)
  │ ── wall-clock timeout = 30 seconds
  │
  ▼
Exit code, stdout, stderr, and generated artifact files captured
```

---

## 8. Event Sourcing & Audit Architecture

Every mutation, node transition, token generation, and network event is written sequentially to an append-only SQLite event ledger:

```text
Event Producers (Orchestrator, Router, RAG, Tools, Egress Guard)
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

### Guarantees
1. **Single Source of Truth**: The UI reconstructs its state entirely by replaying events from sequence 0 forward.
2. **Deterministic Replay**: A completed run replayed from the event log renders identically to a live run.
3. **Resilient Reconnection**: Clients reconnect using `?since=<seq>` to backfill missed events without data loss.

---

## 9. Deliverable Artifact Production

The artifact manager (`vajra.artifacts`) generates production documents locally:
- **DOCX**: Structured Word documents via `python-docx` with institutional headings, findings tables, SOP citations, and approval signatures.
- **XLSX**: Engineering calculation workbooks via `openpyxl`.
- **PPTX**: Presentation briefings via `python-pptx`.
- **PDF**: Fixed-layout inspection notes via `reportlab`.

All artifacts are persisted under `data/artifacts/{run_id}/` with SHA-256 checksums recorded in the database and emitted over the event stream.