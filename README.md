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

---

## Quick Start (Local Setup)

### Prerequisites
* **Python 3.11+**
* **Node.js 18+** & **npm**
* **Ollama** installed locally

---

### 1. Backend Setup

```powershell
# Navigate to API directory
cd apps\api

# Create & activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # On Linux/macOS: source .venv/bin/activate

# Install dependencies in editable mode
pip install -e .

# Run the 84 unit tests
pytest apps/api/tests/unit
```

### 2. Pull Recommended Local Models (Ollama)

```powershell
# Start Ollama service
ollama serve

# Pull models defined in laptop-8gb.yaml profile
ollama pull qwen3:8b
ollama pull qwen2.5-coder:7b
ollama pull llava:7b
ollama pull nomic-embed-text:latest
```

### 3. Start Backend Server

```powershell
# From repository root (with .venv active)
python -m vajra.main
```
The backend starts on `http://127.0.0.1:8000`.
- **API Documentation**: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)
- **Health & Sovereignty Audit**: [http://127.0.0.1:8000/api/system/health](http://127.0.0.1:8000/api/system/health)

---

### 4. Start Frontend Application

In a separate terminal:

```powershell
cd apps\web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Default Credentials
* **Username**: `admin`
* **Password**: `sovereign2026`

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
