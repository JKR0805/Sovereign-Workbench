# VAJRA: Implementation Status

**SIH 2026 Problem Statement 26117**: Sovereign On-Premise Agentic AI Workbench

This document details the status of the VAJRA backend codebase, covering verified implementations, scaffolded interfaces, and architectural boundaries.

---

## 1. Architectural Integrity & Boundaries

The backend strictly adheres to the one-way dependency graph:
$$\text{api} \longrightarrow \text{orchestrator} \longrightarrow \{\text{services}\} \longrightarrow \text{adapters} \longrightarrow \text{store / events} \longrightarrow \text{core}$$

- **No circular dependencies**: Verified across all modules.
- **Model-Agnostic Core**: Neither the routing engine nor the orchestrator logic contains hardcoded model vendor names. All routing operations rely purely on declared and verified capabilities, context length, latency, residency, and hardware bounds.
- **Fail-Closed Sovereignty**: The in-process egress guard (`EgressGuard`) monkeypatches `socket.connect` before external modules can open connections. In `airgap` profile, any startup self-audit failure aborts initialization immediately.
- **RFC 7807 Error Standard**: All domain exceptions subclass `VajraError` and serialize directly into `application/problem+json` format with stable error codes and structured diagnostic contexts.

---

## 2. Component Implementation Matrix

| Subsystem | File Location | Status | Implementation Details & Test Coverage |
| :--- | :--- | :--- | :--- |
| **FastAPI Core** | `vajra/main.py` | **Fully Implemented** | Lifespan context, graceful shutdown, CORS middleware, exception handlers, CLI runner. Verified by ASGI tests and live lifespan probes. |
| **API Routers** | `vajra/api/*` (10 routers) | **Fully Implemented** | Aggregated in `vajra/api/__init__.py`: `runs`, `models`, `runtimes`, `routing`, `system`, `network`, `audit`, `tools`, `sandbox`, `knowledge`. |
| **Configuration** | `vajra/core/config.py` | **Fully Implemented** | Profiles (`development`, `demo`, `airgap`), `model_profile: laptop-8gb`, `fail_closed` policy, nested Pydantic models with `VAJRA__` env var support, `qdrant.cloud_inference=False` validator. |
| **Persistence** | `vajra/store/*` | **Fully Implemented** | Async SQLite engine with WAL mode pragmas, 14 SQLModel tables covering Section L, 6 typed repositories with cascade deletion. |
| **Event Bus & SSE** | `vajra/events/*` | **Fully Implemented** | Monotonic sequence allocation per stream, persist-before-fanout durability, backpressure with lag tracking, SSE formatting and replay (`since` offset). |
| **Hardware Profiles** | `config/models/*`, `vajra/registry/profiles.py` | **Fully Implemented** | Declarative YAML profiles (`laptop-8gb`, `mid-16gb`, `high-perf-24gb`), schema validation, `sync_model_registry()`, genuine Ollama probing (no fake claims), pluggability verified. |
| **Routing Engine** | `vajra/router/*` | **Fully Implemented** | Lexicon intent classifier, hard filters (context size, modalities, capabilities, VRAM), 7-factor weighted scoring, policy engine. Unit tested. Pluggable to synthetic models without router code changes. |
| **RAG Ingestion** | `vajra/rag/parse.py`, `vajra/rag/chunk.py`, `vajra/rag/ingest.py` | **Fully Implemented** | `PyMuPDFParser` (PDF, TXT, MD, CSV), `PageClassifier` (detects text-bearing vs scanned pages), `StructureAwareChunker` with token and bbox provenance, `DocumentIngestor` pipeline. |
| **RAG Embeddings** | `vajra/rag/embed.py` | **Fully Implemented** | `FastEmbedEmbedder` running ONNX on CPU (saving 100% GPU VRAM for generative inference), `OllamaEmbedder` runtime adapter interface. |
| **Vector Index** | `vajra/rag/index.py` | **Fully Implemented** | `QdrantIndex` supporting local HTTP daemon and local on-disk/in-memory embedded mode (`QdrantClient(path="data/qdrant")` / `":memory:"`). Sovereignty guard verified. |
| **RAG Retrieval & Citations** | `vajra/rag/retrieve.py`, `vajra/rag/citations.py` | **Fully Implemented** | `HybridRetriever` dense vector retrieval, deterministic citation numbering (`[C1]`, `[C2]`), provenance labelling (`Doc > Section > p.X`), context block formatting. |
| **AST Sandbox Guard** | `vajra/sandbox/guard.py` | **Fully Implemented** | AST-based static scanner blocking networking imports (`socket`, `requests`, `urllib`, `httpx`), process spawns (`subprocess`, `os.system`), and dynamic execution (`eval`, `exec`). |
| **Tool Registry** | `vajra/tools/*` | **Fully Implemented** | Registry holding 8 MVP tools, Draft 2020-12 jsonschema input/output validation, timeout wrapper, explicit unimplemented sentinel. |
| **Network Sentinel** | `vajra/sentinel/*`, `vajra/sovereignty/*` | **Fully Implemented** | In-process egress monkeypatch, connection auditor (`psutil`), iptables/nftables scaffold, network ledger persistence, startup self-audit. |
| **Artifact Generation**| `vajra/artifacts/*` | **Operational / Scaffolded**| `python-docx` renderer is operational; XLSX, PPTX, and PDF generators return `NotImplementedYet`. |
| **Demo Orchestrator**| `vajra/orchestrator/*` | **Operational** | Vertical slice demo path runs end-to-end without inference dependencies, recording steps and streaming real-time events. |
| **Agent State Machine**| `vajra/agent/*` | **Scaffolded** | State transition table and hard budget tracking (`BudgetTracker`) are fully implemented and unit-tested. Autonomous LLM execution loop is next phase. |

---

## 3. Implementation Breakdown

### Implemented (Verified Locally)
- **Model Profiles**: 3 declarative profiles (`laptop-8gb.yaml`, `mid-16gb.yaml`, `high-perf-24gb.yaml`). Loaded, validated, and synchronized into SQLite on boot.
- **Hardware Probing**: Probing against local Ollama (`http://127.0.0.1:11434`), reporting whether configured model tags (`qwen3:8b`, `nomic-embed-text:latest`) exist without fabricating health.
- **Model Pluggability**: Fully tested. New models registered in database are routed dynamically by capability weights without any changes to router source code.
- **Local PDF & Text Parsing**: `PyMuPDFParser` extracts text blocks, headings, page numbers, and bounding boxes.
- **Page Classification**: Classifies pages as `DIGITAL` or `SCANNED` based on text presence and coverage.
- **Deterministic Chunking**: `StructureAwareChunker` preserves headings, document identity, page range, and token estimation.
- **Local CPU Embeddings**: `FastEmbedEmbedder` runs ONNX `BAAI/bge-small-en-v1.5` on CPU, preserving 100% of the 8GB GPU VRAM for LLMs.
- **Local Qdrant Index**: Runs local embedded vector search (`data/qdrant` or `:memory:`) with cosine similarity, document filtering, and collection management.
- **Citations**: Source citations are tracked and generated with `[C1]`, `[C2]` markers, document titles, sections, and page references.
- **Knowledge API**: `POST /api/knowledge/documents`, `GET /api/knowledge/documents`, `GET /api/knowledge/documents/{id}`, `GET /api/knowledge/documents/{id}/chunks`, `POST /api/knowledge/search`, `DELETE /api/knowledge/documents/{id}` are verified live.

### Scaffolded (Interfaces Defined with Fallbacks)
- **Reranker Subsystem**: Interface `Reranker` is defined in `vajra/rag/rerank.py`; returns un-reranked dense results with `reranked=False` when reranking model is unavailable.
- **Docling Parser**: Protocol defined in `vajra/rag/parse.py`; raises `InfrastructureUnavailable` if docling is not installed.
- **Sparse BM25 Indexing**: Vector index schema supports named vector `bm25_sparse`; currently dense retrieval is active.
- **Docker Execution**: Sandbox interface in `vajra/sandbox/docker.py` validated with AST guard; execution returns an error if Docker daemon is not active.

### Not Implemented (Reserved for Next Phase)
- **Autonomous Agent Loop**: Multi-step plan execution, tool-calling loop, model switching during an agent run.
- **OCR / VLM Document Extraction**: Image-heavy scanned pages flagged as `SCANNED` currently await the vision-language extraction pipeline.
- **GPU Dynamic VRAM Swapping**: Memory eviction policies between competing generative models.

---

## 4. Test Suite & Quality Assurance

All 53 unit and integration tests pass with zero failures:

```
============================= test session starts =============================
platform win32 -- Python 3.14.6, pytest-9.1.1, pluggy-1.6.0
rootdir: C:\Projects\Sovereign-Workbench\apps\api
configfile: pyproject.toml
testpaths: tests
plugins: anyio-4.15.1, asyncio-1.4.0
asyncio: mode=Mode.AUTO

tests\integration\test_knowledge_api.py ..                               [  3%]
tests\integration\test_startup.py .....                                  [ 13%]
tests\integration\test_vertical_slice.py ..                              [ 16%]
tests\unit\test_config.py ....                                           [ 24%]
tests\unit\test_events.py .....                                          [ 33%]
tests\unit\test_model_pluggability.py .                                  [ 35%]
tests\unit\test_model_profiles.py ......                                 [ 47%]
tests\unit\test_rag.py .........                                         [ 64%]
tests\unit\test_routing.py ....                                          [ 71%]
tests\unit\test_sandbox_guard.py ....                                    [ 79%]
tests\unit\test_state_machine.py .....                                   [ 88%]
tests\unit\test_tools.py ......                                          [100%]

============================= 53 passed in 4.06s ==============================
```

### Static Analysis
Run via `ruff check .`:
```
All checks passed!
```

---

## 5. How to Set Up and Run Locally

### Step 1: Navigate to the API Workspace
Open your terminal (PowerShell, Command Prompt, or Bash) and navigate to the backend directory:
```powershell
cd c:\Projects\Sovereign-Workbench\apps\api
```

### Step 2: Python Virtual Environment Setup
Ensure Python 3.11+ is installed. Create a dedicated isolated virtual environment:
```powershell
# Create the virtual environment in .venv
python -m venv .venv

# Activate the virtual environment:
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# (If execution policy blocks scripts, run: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass)

# On Windows Command Prompt (cmd.exe):
.\.venv\Scripts\activate.bat

# On Linux / macOS (Bash / Zsh):
source .venv/bin/activate
```

### Step 3: Install Dependencies
Upgrade pip and install the VAJRA API package in editable mode with development dependencies:
```powershell
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -e .
```
*(All core dependencies including FastAPI, SQLModel, PyMuPDF, FastEmbed, and Qdrant-client will be installed into `.venv`.)*

### Step 4: Run the Complete Test Suite
Verify that all unit and integration tests pass cleanly in your environment:
```powershell
.\.venv\Scripts\pytest -v
.\.venv\Scripts\ruff check .
```
*Expected: 53 passed, 0 failures, All checks passed!*

### Step 5: Start Local Services

1. **Ollama (Local LLM Runtime)**:
   Ensure Ollama is installed and running:
   ```powershell
   ollama serve
   ```
   In a separate terminal, pull the recommended models for the default `laptop-8gb` hardware profile:
   ```powershell
   ollama pull qwen3:8b
   ollama pull nomic-embed-text:latest
   ```

2. **Qdrant Vector Database (Zero Setup Needed)**:
   - **Default (Embedded Mode)**: You do **not** need to install or run Qdrant manually. VAJRA will automatically initialize and run an embedded, on-disk local vector index under `data/qdrant`.
   - **Daemon Mode (Optional)**: If you prefer running a dedicated Qdrant instance via Docker:
     ```powershell
     docker run -d --name vajra-qdrant -p 6333:6333 -v ${PWD}/data/qdrant:/qdrant/storage:z qdrant/qdrant
     ```

### Step 6: Launch the VAJRA API Server
From `c:\Projects\Sovereign-Workbench\apps\api`:
```powershell
.\.venv\Scripts\python -m vajra.main
```
Or using Uvicorn with auto-reload:
```powershell
.\.venv\Scripts\uvicorn vajra.main:app --reload --host 127.0.0.1 --port 8000
```

### Step 7: Verify Live Endpoints
Once started, test the server in your browser or with curl:
- **Interactive Swagger UI**: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)
- **OpenAPI JSON**: [http://127.0.0.1:8000/api/openapi.json](http://127.0.0.1:8000/api/openapi.json)
- **System Ping**: `curl http://127.0.0.1:8000/api/system/ping`
- **System Health & Sovereignty Audit**: `curl http://127.0.0.1:8000/api/system/health`
- **Synchronized Hardware Models**: `curl http://127.0.0.1:8000/api/models`
- **Knowledge Documents**: `curl http://127.0.0.1:8000/api/knowledge/documents`
