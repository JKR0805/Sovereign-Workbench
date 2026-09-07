# VAJRA: Local and Docker Testing Guide

**SIH 2026 Problem Statement 26117**: Sovereign On-Premise Agentic AI Workbench

This document provides instructions for setting up, running, and testing the **VAJRA** backend. The system runs locally and air-gapped on standard workstation or laptop hardware without cloud access.

---

## 1. System Requirements & Prerequisites

### Hardware
* **Target Profile**: 8 GB physical VRAM (e.g. NVIDIA RTX 3070/4060 Laptop GPU), 16 GB+ System RAM, 4+ CPU cores.
* **Storage**: At least 15 GB free disk space for local open-weight model weights and local vector store.

### Software Prerequisites
1. **Operating System**: Windows 10/11, Ubuntu 22.04+, or macOS.
2. **Python**: Version **3.11** or higher.
3. **Git**: Installed and available in PATH.
4. **Ollama**: Download and install from [https://ollama.com](https://ollama.com).
5. **Docker & Docker Compose** *(Optional)*: Required only if running containerized execution or containerized Qdrant daemon.

---

## 2. Option A: Local Native Setup (Recommended)

Follow these exact steps to run the backend natively in an isolated virtual environment.

### Step 1: Clone & Navigate to Backend
Open PowerShell (Windows) or Terminal (Linux/macOS):
```powershell
# Navigate to the API workspace directory
cd c:\Projects\Sovereign-Workbench\apps\api
```

### Step 2: Create & Activate Virtual Environment
```powershell
# Create an isolated virtual environment
python -m venv .venv

# Activate on Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# (If script execution is disabled on Windows, run: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass)

# Activate on Windows Command Prompt (cmd.exe):
.\.venv\Scripts\activate.bat

# Activate on Linux / macOS:
source .venv/bin/activate
```

### Step 3: Install Package & Dependencies
Install VAJRA in editable mode with all local dependencies:
```powershell
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -e .
```
*(Dependencies installed include FastAPI, SQLModel, Uvicorn, PyMuPDF, FastEmbed, Qdrant-Client, PyYAML, and AnyIO.)*

---

## 3. Automated Test Suite Verification

Before starting services, verify the entire test suite to ensure the system is completely functional in your local environment.

### Run All 53 Tests
```powershell
.\.venv\Scripts\pytest -v
```
**Expected Output**:
```text
============================= 53 passed in 4.02s ==============================
```

### Run Static Analysis & Linter
```powershell
.\.venv\Scripts\ruff check .
```
**Expected Output**:
```text
All checks passed!
```

### Run Specific Test Modules
```powershell
# Test Model Profiles & Schema Validation (6 tests)
.\.venv\Scripts\pytest -v tests/unit/test_model_profiles.py

# Test Model Pluggability (proving router is decoupled from model names)
.\.venv\Scripts\pytest -v tests/unit/test_model_pluggability.py

# Test Local RAG Pipeline: PDF Parsing, Chunking, CPU Embeddings, Qdrant Index (9 tests)
.\.venv\Scripts\pytest -v tests/unit/test_rag.py

# Test Knowledge API Live Lifecycle & Search (2 tests)
.\.venv\Scripts\pytest -v tests/integration/test_knowledge_api.py
```

---

## 4. Local Services Setup

### 1. Ollama Setup (Local LLM Runtime)
Start the Ollama daemon:
```powershell
ollama serve
```

In a separate terminal, pull the recommended models configured in `config/models/laptop-8gb.yaml`:
```powershell
# Recommended primary reasoning model (Q4_K_M, ~5.0 GB VRAM)
ollama pull qwen3:8b

# Recommended embedding model for runtime fallback (~270 MB)
ollama pull nomic-embed-text:latest
```
*(Note: If `qwen3:8b` is not yet pulled, VAJRA still boots normally and marks the model status as `unhealthy` / `not pulled` without fabricating availability or crashing.)*

### 2. Local Qdrant Vector Store
VAJRA supports both embedded and daemon vector storage:
* **Embedded Mode (Default)**: If no Qdrant server is reachable on port 6333, VAJRA automatically initializes and runs an embedded, on-disk local vector index under `data/qdrant`. Docker is not required for vector search.
* **Daemon Mode (Optional)**: If you prefer running a dedicated Qdrant instance via Docker:
  ```powershell
  docker run -d --name vajra-qdrant -p 6333:6333 -v ${PWD}/data/qdrant:/qdrant/storage:z qdrant/qdrant
  ```

---

## 5. Starting the VAJRA API Server

From `c:\Projects\Sovereign-Workbench\apps\api`:
```powershell
.\.venv\Scripts\python -m vajra.main
```
Or using Uvicorn with hot reload:
```powershell
.\.venv\Scripts\uvicorn vajra.main:app --reload --host 127.0.0.1 --port 8000
```

### Expected Startup Log:
```text
INFO:     VAJRA 0.1.0 starting • profile=development log_level=INFO
INFO:     Synchronized hardware model profile: laptop-8gb
INFO:     self-audit no_cloud_api_keys: pass (No cloud API keys in the environment)
INFO:     self-audit endpoints_are_local: pass (All configured endpoints are loopback, RFC1918 or compose service names)
INFO:     self-audit qdrant_cloud_inference_off: pass (Qdrant cloud_inference is disabled)
INFO:     self-audit egress_guard_installed: pass (socket.connect is guarded by the application egress policy)
INFO:     startup complete
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

---

## 6. End-to-End API Walkthrough & Verification

You can interact with the server through the interactive Swagger UI at **[http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)** or via terminal commands below.

### Test 1: System Ping
```powershell
# PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/system/ping" -Method Get

# curl
curl -s http://127.0.0.1:8000/api/system/ping
```
**Response**:
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### Test 2: System Health & Sovereignty Audit
Verifies startup self-audit assertions, Ollama connectivity, and vector index health:
```powershell
# PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/system/health" -Method Get | ConvertTo-Json -Depth 4

# curl
curl -s http://127.0.0.1:8000/api/system/health
```
**Key checks in response**:
* `runtimes.ollama.available`: `true` (if Ollama is running).
* `index.available`: `true` (local vector store active).
* `self_audit.passed`: `true` (all 4 sovereignty assertions passed).

---

### Test 3: Synchronized Hardware Models
Inspect models synchronized from `config/models/laptop-8gb.yaml` into the registry:
```powershell
# PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/models" -Method Get | ConvertTo-Json -Depth 3

# curl
curl -s http://127.0.0.1:8000/api/models
```
**Response highlights**:
* Lists `general-reasoning` (`qwen3:8b`), `coding-specialist` (`qwen2.5-coder:7b`), `vision-document` (`qwen2.5-vl:3b`), and `text-embedding`.
* Displays real probed health without fabricating availability.
* Displays VRAM requirements and hardware capability scores.

---

### Test 4: Document Ingestion (Real Local RAG)
Upload the included sample industrial inspection report (`samples/heat_exchanger_e102.md`) to trigger parsing, chunking, CPU embedding generation, and Qdrant vector indexing:

**Windows Command Prompt (cmd.exe)**:
```cmd
curl -X POST "http://127.0.0.1:8000/api/knowledge/documents" -F "file=@samples/heat_exchanger_e102.md"
```

**PowerShell**:
```powershell
$form = @{
    file = Get-Item "samples/heat_exchanger_e102.md"
}
$uploaded = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/knowledge/documents" -Method Post -Form $form
$uploaded | ConvertTo-Json
```

**Linux / macOS (Bash)**:
```bash
curl -X POST "http://127.0.0.1:8000/api/knowledge/documents" -F "file=@samples/heat_exchanger_e102.md"
```

**Response**:
```json
{
  "id": "6e28be402c654da0be348eb7ae4a0a48",
  "filename": "heat_exchanger_e102.md",
  "status": "indexed",
  "page_count": 1,
  "scanned_page_count": 0,
  "parser": "text",
  "error": null
}
```

---

### Test 5: Inspect Extracted Document Chunks
Inspect the structure-aware chunks and token counts stored in SQLite:

**Windows Command Prompt (cmd.exe)** (replace `<DOC_ID>` with the `id` from Test 4):
```cmd
curl -s "http://127.0.0.1:8000/api/knowledge/documents/<DOC_ID>/chunks"
```

**PowerShell**:
```powershell
$docId = $uploaded.id
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/knowledge/documents/$docId/chunks" -Method Get | ConvertTo-Json -Depth 3
```

---

### Test 6: Hybrid Search with Verified Citations
Execute a semantic query against the local vector index:

**Windows Command Prompt (cmd.exe)**:
```cmd
curl -X POST "http://127.0.0.1:8000/api/knowledge/search" -H "Content-Type: application/json" -d "{\"query\": \"What is the measured wall thickness for E-102?\", \"top_k\": 3}"
```

**PowerShell**:
```powershell
$searchPayload = @{
    query = "What is the measured wall thickness for E-102 and what is the retirement threshold?"
    top_k = 3
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/knowledge/search" -Method Post -Body $searchPayload -ContentType "application/json" | ConvertTo-Json -Depth 4
```

**Linux / macOS (Bash)**:
```bash
curl -X POST "http://127.0.0.1:8000/api/knowledge/search" \
     -H "Content-Type: application/json" \
     -d '{"query": "What is the measured wall thickness for E-102?", "top_k": 3}'
```

**Response**:
```json
{
  "query": "What is the measured wall thickness for E-102?",
  "chunks": [
    {
      "marker": "[C1]",
      "label": "heat_exchanger_e102.md > Heat Exchanger E-102 Inspection Report > p.1",
      "chunk_id": "7cfddcc6319a4ebc8565eae765d564d9",
      "document_id": "6e28be402c654da0be348eb7ae4a0a48",
      "text": "Heat Exchanger E-102 Inspection Report\n\nDate: 2026-09-07\nAsset Tag: E-102\nMeasured wall thickness: 6.8 mm across all tube passes.\nOperating Pressure: 42.5 bar\nCorrosion allowance: 1.2 mm",
      "page_from": 1,
      "page_to": 1,
      "score": 0.8323
    }
  ],
  "reranked": false,
  "timings": {
    "embed_ms": 57.7,
    "retrieve_ms": 5.5,
    "rerank_ms": null,
    "total_ms": 63.2
  }
}
```

---

### Test 7: Cascade Deletion
Delete the document and ensure chunks and vectors are removed:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/knowledge/documents/$docId" -Method Delete
```

---

## 7. Option B: Running with Docker Compose

If you prefer running the entire system in isolated Docker containers:

### Step 1: Start Services
From the repository root (`c:\Projects\Sovereign-Workbench`):
```powershell
docker compose -f infra/docker-compose.yml up --build -d
```

### Step 2: Check Running Containers
```powershell
docker ps
```
You will see:
* `vajra-api`: Port `8000:8000`
* `vajra-qdrant`: Port `6333:6333`

### Step 3: Access Containerized Endpoints
* Swagger UI: `http://localhost:8000/api/docs`
* Qdrant Dashboard: `http://localhost:6333/dashboard`

### Step 4: Stop Containers
```powershell
docker compose -f infra/docker-compose.yml down
```

---

## 8. Troubleshooting & FAQ

### 1. `Port 8000 already in use`
If another process is using port 8000, specify a different port when launching:
```powershell
.\.venv\Scripts\uvicorn vajra.main:app --host 127.0.0.1 --port 8080
```

### 2. `Ollama unreachable ([WinError 10061])`
Ensure Ollama is running by opening a new terminal and typing `ollama serve`. You can verify Ollama directly by running `curl http://127.0.0.1:11434/api/version`.

### 3. `Qdrant connection actively refused`
This is completely normal and expected if you are not running the optional Docker Qdrant daemon. VAJRA automatically logs:
`Qdrant server at http://127.0.0.1:6333 unreachable; using local embedded Qdrant`
and operates against local on-disk storage under `data/qdrant`.

### 4. `PowerShell execution policy blocks Activate.ps1`
Run the following in your PowerShell session:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
Then run `.\.venv\Scripts\Activate.ps1`.
