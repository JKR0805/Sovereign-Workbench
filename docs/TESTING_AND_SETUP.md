# VAJRA: Setup, Testing & Verification Guide

**SIH 2026 Problem Statement 26117**: Sovereign On-Premise Agentic AI Workbench  
**Status**: Production Verified · **Last Updated**: 2026-09-08

This document provides instructions for setting up, running, and verifying the **VAJRA** workbench across the FastAPI backend (`apps/api`), Next.js frontend (`apps/web`), local Ollama runtime, and local vector storage.

---

## 1. System Requirements & Hardware Target

### Hardware Target (8 GB Physical VRAM)
- **Target Profile**: 8 GB physical VRAM (e.g. NVIDIA RTX 3070/4060 Laptop GPU), 16 GB System RAM, 4+ CPU cores.
- **Storage**: ~15 GB free disk space for local models and vector index.

### Software Prerequisites
1. **Operating System**: Windows 10/11, Ubuntu 22.04+, or macOS.
2. **Python**: Version **3.11** or higher.
3. **Node.js**: Version **18.18** or **20+** (with `npm`).
4. **Ollama**: Download and install from [https://ollama.com](https://ollama.com).
5. **Git**: Available in system PATH.

---

## 2. Quickstart: Running the Stack

### Step 1: Start Ollama Models
Open a terminal and ensure Ollama is running with the required open-weight models:
```bash
# Pull the target models (laptop-8gb profile)
ollama pull qwen3:8b
ollama pull qwen2.5-coder:7b
ollama pull llava:7b
```

### Step 2: Start the Backend (`apps/api`)
```powershell
cd c:\Projects\Sovereign-Workbench\apps\api

# Activate Python virtual environment
.\.venv\Scripts\Activate.ps1

# Launch the FastAPI server
python -m uvicorn vajra.main:app --port 8000 --host 127.0.0.1
```
The backend starts at `http://127.0.0.1:8000`. On first launch, it automatically initializes the SQLite WAL database and creates the bootstrap admin account:
- **Default Username**: `admin`
- **Default Password**: `sovereign2026`

### Step 3: Start the Frontend (`apps/web`)
Open a separate terminal:
```powershell
cd c:\Projects\Sovereign-Workbench\apps\web

# Install dependencies if needed
npm install

# Start Next.js development server
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 3. Automated Verification & Test Suite

Run the full automated test suite to verify all routing, parsing, persistence, and security components:

```powershell
cd c:\Projects\Sovereign-Workbench\apps\api
.\.venv\Scripts\Activate.ps1

# Run all 80 unit tests
pytest tests/unit -v
```

Expected result:
```text
============================= 80 passed in 4.92s ==============================
```

Verify frontend TypeScript compilation and production build:
```powershell
cd c:\Projects\Sovereign-Workbench\apps\web
npm run build
```
Expected result: `✓ Compiled successfully`, generating all 19 static and dynamic routes.

---

## 4. Manual Testing & Demonstration Workflows

### Test Workflow 1: Authentication & Admin Oversight
1. Open `http://localhost:3000/login`.
2. Sign in with `admin` / `sovereign2026`.
3. Verify redirection to the main workbench workspace.
4. Navigate to `/admin/users`:
   - Inspect existing user accounts and total conversation statistics.
   - Create a new standard user (e.g. `analyst1` / `password123`).
5. Open an incognito browser window and sign in as `analyst1`:
   - Start a conversation and send a prompt.
   - Click "New Chat" and verify that the active chat window clears cleanly without leaking previous conversation turns.
6. Switch back to the `admin` session:
   - Notice that the admin can view conversations from all users, labeled with clear user attribution badges (`admin` vs `analyst1`).

---

### Test Workflow 2: Intelligent 8-Stage Routing Pipeline

#### Case A: General Knowledge Request (No Attachment)
1. In the workbench chat prompt, submit:
   ```text
   Explain the three fundamental laws of thermodynamics in simple terms.
   ```
2. Observe the real-time **Inference Graph**:
   - `Attachment Intake`: Passed (No attachments).
   - `Vision & Multimodal`: Skipped (No images or scanned pages).
   - `Semantic Understanding Engine`: Derives `enhanced_prompt`, sets `is_coding_task: false`.
   - `Knowledge Retrieval`: Searches vector store using enhanced query.
   - `Task Classification & Model Selection`: Detects `general_intelligence` domain, assigns `Capability.TEXT`/`REASONING`, selects general model (e.g. `qwen3:8b`).
   - `Target Model Execution`: Streams tokens with real-time tokens/sec telemetry.
   - `Sovereignty Verification`: Confirms sovereign boundary clean (`pass`).

#### Case B: Dedicated Coding Task
1. Submit a coding prompt:
   ```text
   Write a python function to compute Fibonacci numbers using dynamic programming and type annotations.
   ```
2. Observe the **Inference Graph**:
   - `Semantic Understanding Engine`: Sets `is_coding_task: true`.
   - `Task Classification & Model Selection`: Maps to `Capability.CODING`.
   - Deterministically selects the coding specialist model (e.g. `qwen2.5-coder:7b`).
   - Generates production-ready python code with syntax highlighting in the chat view.

#### Case C: Tabular File Extraction & Data Analysis
1. Attach a sample CSV file (e.g. `department_budget.csv`) containing columns like `id`, `department`, `budget`, `headcount`.
2. Enter prompt:
   ```text
   Calculate the average budget per headcount across all departments.
   ```
3. Observe the **Inference Graph**:
   - `Attachment Intake`: Extracts file using `pandas`. Shows tabular schema badge (`Columns: id, department, budget, headcount`) and numerical describe statistics.
   - `Task Classification & Model Selection`: Flags task domain as `💻 Coding Specialist Task`.
   - `Target Model Execution`: Injects structured schema and stats into `STRUCTURED_CODING_SYSTEM_PROMPT`. The model uses the exact column names and computed statistics to generate an accurate answer.

#### Case D: Multimodal Fallback on Scanned / Low-Density Documents
1. Attach a PDF with sparse text or scanned pages.
2. The orchestrator's quality probe detects text coverage < 15% or `SCANNED` pages.
3. Automatically triggers high-DPI page rendering and multimodal vision fallback (`llava:7b`), emitting `MULTIMODAL_FALLBACK` on the live pipeline graph before answering the user query.

---

## 5. Troubleshooting & FAQ

### 1. `Authentication Required (401 Unauthorized)`
Ensure you have logged in via `/login` and the browser has stored the `vajra_session` cookie. For CLI/scripts, authenticate first with `POST /api/auth/login`.

### 2. `Ollama unreachable ([WinError 10061])`
Ensure Ollama is running in the background. Verify with:
```bash
curl http://127.0.0.1:11434/api/version
```

### 3. `Qdrant embedded storage`
If the standalone Qdrant Docker container is not running on port 6333, VAJRA automatically falls back to local on-disk embedded Qdrant under `data/qdrant` with zero configuration required.
