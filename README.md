# VAJRA: Sovereign On-Premise Agentic AI Workbench

**VAJRA** is a sovereign, on-premise agentic AI workbench developed for **Smart India Hackathon 2026 (Problem Statement 26117)**. Engineered for high-consequence enterprise, defense, and industrial operations, VAJRA runs entirely within strict airgapped environments without external internet dependencies or silent cloud telemetry.

It combines multi-model orchestration, multi-turn document persistence, local hybrid vector retrieval (RAG), local sandboxed code execution, and hardware-constrained VRAM arbitration into a cohesive workstation platform.

---

## Key Capabilities & Core Architecture

```text
                     USER PROMPT + OPTIONAL ATTACHMENTS
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │       STAGE 1: Intake & Document Parsing         │
             │   PyMuPDF (PDF, CSV, MD) + Tabular Analytics     │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │    STAGE 2: Vision & Multimodal Fallback         │
             │  Llava 7B Image Transcription & Scanned Handling │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │   STAGE 3: Semantic Understanding & Expansion    │
             │  Query Enrichment preserving Authoritative Intent│
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │      STAGE 4: Local Vector Retrieval (RAG)       │
             │ Qdrant Vector Search + Numbered Page Citations   │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ STAGE 5: Task Classification & Capability Route  │
             │  Intent Lexicon + Capability Hierarchy Matching  │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ STAGE 6: Model Selection & VRAM Arbitration     │
             │   7-Factor Scoring + Domain Specialization Fit   │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │  STAGE 7: Target Execution & Real-Time Stream    │
             │  Ollama Runtime Generation + Token Metrics (TPS) │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ STAGE 8: Zero-Egress Sovereignty Verification    │
             │ Network Ledger Audit + Clean Border Attestation  │
             └──────────────────────────────────────────────────┘
```

1. **Intelligent Model Selection Hierarchy & Role Affinity**:
   - Routes queries based on a strict deterministic hierarchy:
     $$\text{User Intent} \rightarrow \text{Required Capabilities} \rightarrow \text{Role Affinity} \rightarrow \text{Priority} \rightarrow \text{VRAM Residency}$$
   - When a task is non-coding, coding specialists receive a domain penalty, while general reasoning models receive positive role affinity. VRAM residency acts as a performance tie-breaker and cannot override a capability mismatch.
   - Completely model-agnostic: zero hardcoded model vendor names in routing logic.

2. **Multi-Turn Context & Document Persistence**:
   - Automatically maintains `effective_documents` across conversation turns. Files attached in Turn 1 remain accessible in subsequent turns without re-uploading.
   - Emits `CONVERSATION_CONTEXT_INHERITED` wire events, preserving attachment-scoped RAG searches and displaying active context in the UI.

3. **4-Layer Airgap Egress Defense**:
   - In-process Python `socket.connect` hook, startup environment self-audit (`OPENAI_API_KEY`, `HF_TOKEN`, etc.), containerized network isolation (`internal: true`, `--network=none`), and host kernel packet filtering (`nftables`).
   - Every inference run verifies zero network egress and records an immutable attestation.

4. **Hardware-Aware Adaptive Profiles**:
   - Declarative hardware configs in `config/models/`: `laptop-8gb.yaml` (primary target: 8 GB laptop GPUs, single-resident VRAM execution), `mid-16gb.yaml`, and `high-perf-24gb.yaml`.
   - Vector embeddings run on CPU via Nomic Embed / ONNX FastEmbed, preserving VRAM for generative models.

5. **Multi-User Role-Based Access Control (RBAC)**:
   - Secure HTTPOnly cookie sessions (`vajra_session`) with sliding idle (12h) and absolute (30d) timeouts.
   - Roles: `admin`, `operator`, `auditor`.
   - Admin oversight mode allows inspection of user conversations while maintaining strict per-user ownership and isolation.

6. **Dynamic Real-Time UI (Next.js 15 & SSE)**:
   - Reactive pipeline graph (`InferenceGraph.tsx`) streaming candidates, scores, durations, token speeds, citations, and verdicts live.
   - Rich document preview with an interactive vector chunk inspector.
   - Real-time Network Security Console, Model Playground, and System Health auditor.

7. **Clean Vector Indexing & Explicit Promotion**:
   - Chat attachments default to session-only isolation (`is_canonical: false`), keeping the global knowledge base authoritative, clean, and unpolluted by ephemeral or unvetted files.
   - Users can promote any vetted chat attachment directly into the permanent knowledge base with a single click in the UI or via `POST /api/knowledge/documents/{id}/promote`.
   - Global RAG searches strictly filter for canonical documents (`is_canonical: true`), while attachment-scoped searches allow prompt grounding on active run attachments.

8. **Unified Multimodal Vision & Fallback**:
   - Direct image attachments (`.png`, `.jpg`, `.webp`, etc.) and scanned PDF pages (coverage < 15%) are automatically preprocessed by the local vision specialist model (`llava:7b`).
   - Normalizes visual layouts, charts, and handwritten text into rich markdown context, allowing any downstream model (including specialized coding models) to reason over images without requiring native vision weights.
   - Seamlessly combines multimodal vision analysis and knowledge base RAG retrieval in a single query turn.

---

## Quick Start (Local Setup)

### 1. Start Local LLM Inference (Ollama)
Ensure **Ollama** is running locally for LLM inference:
```powershell
ollama serve

# In another terminal, pull recommended models
ollama pull qwen2.5:7b
ollama pull nomic-embed-text:latest
```
*(Vector database requires zero setup: VAJRA automatically initializes embedded local on-disk Qdrant at `data/qdrant` if no external server is running).*

---

### 2. Run Backend (FastAPI)
Open a terminal and navigate to `apps/api`:

```powershell
# 1. Navigate to api directory
cd apps\api

# 2. Create & activate virtual environment (if not already done)
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # On Linux/macOS: source .venv/bin/activate

# 3. Install backend dependencies in editable mode
pip install -e .

# 4. Launch Backend API
python -m vajra.main
# (or: uvicorn vajra.main:app --reload)
```

* **Interactive Swagger UI**: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)
* **API Health & Sovereignty Audit**: [http://127.0.0.1:8000/api/system/health](http://127.0.0.1:8000/api/system/health)
* **Registered Hardware Models**: [http://127.0.0.1:8000/api/models](http://127.0.0.1:8000/api/models)

#### Backend Validation & Tests
```powershell
cd apps\api
.\.venv\Scripts\Activate.ps1
pytest -v          # Run 53-test suite
ruff check .       # Run linter
```

---

### 3. Run Frontend (Next.js)
Open a **new separate terminal**:

#### Option A: From root directory
```powershell
# Run Next.js dev server directly from workspace root
npm run dev
```

#### Option B: From `apps/web` directory
```powershell
cd apps\web

# Install frontend dependencies (if not already installed)
npm install

# Start Next.js development server
npm run dev
```

* **Frontend UI**: [http://localhost:3000](http://localhost:3000)

---

## Running with Docker

To deploy the backend and Qdrant in isolated, egress-blocked containers:

```powershell
docker compose -f infra/docker-compose.yml up --build -d
```
Access the containerized API at `http://localhost:8000/api/docs`.

---

## Repository Map

```text
Sovereign-Workbench/
├── apps/
│   ├── api/                                # FastAPI Backend Application
│   │   ├── vajra/
│   │   │   ├── api/                        # 11 Routers (auth, admin, runs, models, knowledge, etc.)
│   │   │   ├── auth/                       # Argon2id hashing, sessions, cookie authorization
│   │   │   ├── core/                       # Configuration, lifespan, DI container, exceptions
│   │   │   ├── registry/                   # Model registry, Ollama probing, residency tracking
│   │   │   ├── router/                     # Intent classifier, filters, 7-factor scoring engine
│   │   │   ├── orchestrator/               # 8-stage pipeline, candidate builder, conversations
│   │   │   ├── rag/                        # PyMuPDF parser, chunker, Qdrant index, citations
│   │   │   ├── events/                     # Append-only event bus, SQL store, SSE publisher
│   │   │   ├── store/                      # SQLite WAL database, SQLModel schemas, repositories
│   │   │   ├── sovereignty/                # In-process socket guard & self-audit
│   │   │   └── sentinel/                   # Network ledger & live packet sniffing
│   │   └── tests/                          # 119 passing unit & integration tests
│   └── web/                                # Next.js 15 Frontend Application
│       ├── app/                            # App Router (workbench, settings, models, network, etc.)
│       ├── components/                     # InferenceGraph, MarkdownRenderer, Navigation
│       ├── lib/                            # API client, SSE stream subscriber, TypeScript contracts
│       └── stores/                         # Zustand authentication and session store
├── config/
│   └── models/                             # Declarative YAML hardware profiles (8GB, 16GB, 24GB)
├── data/                                   # On-premise persistent storage (sqlite, qdrant, uploads)
├── docs/
│   ├── ARCHITECTURE.md                     # System architecture & 8-stage technical blueprint
│   ├── API_REFERENCE.md                    # Complete REST and SSE wire event contract
│   ├── FRONTEND_SPECIFICATION.md           # Screen-by-screen Next.js frontend design & tokens
│   ├── IMPLEMENTATION_STATUS.md            # Subsystem implementation matrix and verification status
│   └── TESTING_AND_SETUP.md                # Evaluator credentials, test workflows, and commands
├── samples/                                # Synthetic test artifacts (SOPs, telemetry CSVs, logs)
└── infra/
    ├── Dockerfile                          # Production container definition
    └── docker-compose.yml                  # Containerized deployment spec
```

---

## Documentation Links

* **[System Architecture & Blueprint](file:///c:/Projects/Sovereign-Workbench/docs/ARCHITECTURE.md)**: Master architecture specification, 8-stage pipeline design, and component blueprint.
* **[Frontend API Reference](file:///c:/Projects/Sovereign-Workbench/docs/API_REFERENCE.md)**: Complete REST and real-time SSE event contract for frontend engineers.
* **[Frontend Application Specification](file:///c:/Projects/Sovereign-Workbench/docs/FRONTEND_SPECIFICATION.md)**: Next.js frontend architecture, design tokens, and screen specifications.
* **[Testing & Setup Guide](file:///c:/Projects/Sovereign-Workbench/docs/TESTING_AND_SETUP.md)**: Evaluator credentials, step-by-step verification flows, and commands.
* **[Implementation Status](file:///c:/Projects/Sovereign-Workbench/docs/IMPLEMENTATION_STATUS.md)**: Verified subsystem status matrix and test pass rates.
