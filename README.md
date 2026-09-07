# VAJRA: Sovereign On-Premise Agentic AI Workbench

[![SIH 2026](https://img.shields.io/badge/SIH_2026-PS_26117-blue.svg)](https://www.sih.gov.in/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests](https://img.shields.io/badge/tests-53%20passed-brightgreen.svg)]()
[![Code style: ruff](https://img.shields.io/badge/code%20style-ruff-000000.svg)](https://github.com/astral-sh/ruff)
[![Airgap Ready](https://img.shields.io/badge/egress-DENY%20(Airgap)-red.svg)]()

**VAJRA** is an on-premise agentic AI workbench developed for **Smart India Hackathon 2026 (Problem Statement 26117)**. It runs open-weight models locally in air-gapped environments, routes tasks across local model runtimes, executes retrieval-augmented generation (RAG) on local documents, and enforces strict network isolation without external dependencies.

---

## Core Architecture

1. **Network Isolation and Egress Denial**:
   - 4-layer defense in depth: In-process Python `socket.connect` guard, startup self-audit assertions, containerized network isolation (`internal: true`, `--network=none`), and host kernel packet filtering (`nftables`).
   - Zero cloud inference: Verified fail-closed if any cloud endpoint or API key is configured.

2. **Model-Agnostic Router**:
   - Evaluates models dynamically via a 5-stage deterministic pipeline (Task Classification -> Hard Filtering -> 7-Factor Weighted Scoring -> Policy Overlay -> Fallback).
   - Arbitrates between specialized open-weight models (reasoning, coding, vision, embedding).
   - Pluggable: register new models in database via declarative profiles without modifying router source code.

3. **Hardware-Aware Adaptive Profiles**:
   - Declarative profiles in `config/models/`: `laptop-8gb.yaml`, `mid-16gb.yaml`, `high-perf-24gb.yaml`.
   - Primary target: **8 GB laptop GPUs** (~6.7 GB usable). Enforces single-resident VRAM execution with dynamic Ollama eviction and bounded context windows.
   - Preserves GPU memory for generative LLMs by routing vector embeddings to CPU via ONNX FastEmbed.

4. **Local Document RAG Subsystem**:
   - Local document parsing via PyMuPDF (PDF, Markdown, TXT, CSV) preserving bounding boxes and heading levels.
   - Text-layer page classifier detecting digital vs scanned image pages.
   - FastEmbed ONNX embeddings on CPU (`BAAI/bge-small-en-v1.5`, 384 dimensions).
   - Local Qdrant vector index supporting daemon mode or local on-disk embedded fallback under `data/qdrant` (no Docker required).
   - Citation assembly generating numbered source markers (`[C1]`, `[C2]`) mapped directly to document pages.

5. **Event-Sourced Execution History**:
   - Append-only event bus drives real-time reactive UI streaming (Server-Sent Events) and audit log export from a durable event sequence.

---

## Quick Start (Local Setup)

### 1. Set Up Virtual Environment
```powershell
cd apps\api

# Create & activate virtual environment
python -m venv .venv

# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1

# On Linux / macOS:
source .venv/bin/activate

# Install dependencies in editable mode
pip install -e .
```

### 2. Run Tests & Validation
```powershell
# Run the 53-test suite
pytest -v

# Run linter
ruff check .
```

### 3. Start Local Services
Ensure **Ollama** is running locally for LLM inference:
```powershell
ollama serve

# In another terminal, pull recommended models
ollama pull qwen3:8b
ollama pull nomic-embed-text:latest
```
*(Vector database requires zero setup: VAJRA automatically initializes embedded local on-disk Qdrant at `data/qdrant` if no external server is running).*

### 4. Launch Backend API
```powershell
python -m vajra.main
```
* **Interactive Swagger UI**: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)
* **API Health & Sovereignty Audit**: [http://127.0.0.1:8000/api/system/health](http://127.0.0.1:8000/api/system/health)
* **Registered Hardware Models**: [http://127.0.0.1:8000/api/models](http://127.0.0.1:8000/api/models)

---

## Running with Docker

To run the backend and Qdrant in isolated Docker containers:

```powershell
docker compose -f infra/docker-compose.yml up --build -d
```
Access the containerized API at `http://localhost:8000/api/docs`.

---

## Repository Map

```text
Soverign_Workbench/
├── apps/
│   ├── api/                        # FastAPI Backend Application
│   │   ├── vajra/
│   │   │   ├── api/                # 10 API Routers (models, knowledge, routing, etc.)
│   │   │   ├── core/               # Configuration, lifespan, DI container, exceptions
│   │   │   ├── registry/           # Hardware profiles, Ollama probing, residency
│   │   │   ├── router/             # Intent classifier, filters, scoring engine
│   │   │   ├── rag/                # PyMuPDF parser, chunker, CPU embedder, Qdrant index, citations
│   │   │   ├── events/             # Append-only event bus, SQL store, SSE
│   │   │   ├── store/              # SQLite database, SQLModel schemas, repositories
│   │   │   ├── sovereignty/        # In-process egress guard & self-audit
│   │   │   ├── tools/              # Tool registry & JSON schema validation
│   │   │   └── sandbox/            # Docker sandbox interface & AST guard
│   │   └── tests/                  # 53 passing unit & integration tests
│   └── web/                        # Next.js Frontend (in progress)
├── config/
│   └── models/                     # Declarative YAML hardware profiles (8GB, 16GB, 24GB)
├── data/                           # On-premise persistent storage (sqlite, qdrant, uploads)
├── docs/
│   ├── ARCHITECTURE.md             # System architecture & technical blueprint
│   ├── API_REFERENCE.md            # Complete REST and SSE API contract for frontend
│   ├── FRONTEND_SPECIFICATION.md   # Screen-by-screen Next.js frontend design & architecture
│   ├── IMPLEMENTATION_STATUS.md    # Subsystem implementation matrix and test verification status
│   └── TESTING_AND_SETUP.md        # Evaluator and developer testing guide
└── infra/
    ├── Dockerfile                  # Production container definition
    └── docker-compose.yml          # Containerized deployment spec
```

---

## Documentation

* **[System Architecture & Blueprint](file:///c:/Projects/Soverign_Workbench/docs/ARCHITECTURE.md)**: Master architecture specification and component blueprint for SIH PS 26117.
* **[Frontend API Reference](file:///c:/Projects/Soverign_Workbench/docs/API_REFERENCE.md)**: Complete REST and real-time SSE event contract for frontend engineers.
* **[Frontend Application Specification](file:///c:/Projects/Soverign_Workbench/docs/FRONTEND_SPECIFICATION.md)**: Next.js frontend architecture, design tokens, and screen specifications.
* **[Testing & Setup Guide](file:///c:/Projects/Soverign_Workbench/docs/TESTING_AND_SETUP.md)**: Commands for testing endpoints, RAG ingestion, and model pluggability.
* **[Implementation Status](file:///c:/Projects/Soverign_Workbench/docs/IMPLEMENTATION_STATUS.md)**: Subsystem implementation matrix and verification metrics.
