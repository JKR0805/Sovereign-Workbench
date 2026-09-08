# VAJRA: Sovereign Agentic AI Workbench
## Complete Architecture, Pipeline & Workflow Guide

---

## 1. What is VAJRA? (The Big Picture in Plain English)

Imagine you work in a bank, hospital, government agency, or defense organization. You want to use powerful AI like ChatGPT to analyze confidential documents, run code, query databases, and generate reports. **However, you cannot send your secret data to OpenAI, Google, or Microsoft cloud servers.**

**VAJRA** (Sovereign Workbench) solves this problem. It is an **all-in-one, completely on-premise, air-gapped Agentic AI Workbench**.

* **"Sovereign"** means **you own 100% of your data and models**. No data leaves your machine or private network.
* **"Agentic"** means the AI isn't just a chatbot; it can think, plan multiple steps, use tools (execute Python code, search local documents, calculate metrics), inspect errors, and create final files (PDFs, Word documents, spreadsheets).
* **"Workbench"** means it provides both a sleek web interface and a robust backend API for developers and analysts.

---

## 2. The Tech Stack & Why These Specific Tools Were Chosen

Every technology in VAJRA was chosen to ensure **local performance, zero cloud reliance, lightweight resource usage, and clean developer experience**.

```
┌───────────────────────────────────────────────────────────────┐
│                          TECH STACK                           │
├───────────────────────┬───────────────────────────────────────┤
│ Frontend              │ Next.js (React), Tailwind CSS, Lucide │
│ Backend Framework     │ Python 3.12+, FastAPI, Uvicorn        │
│ Database & ORM        │ SQLite (aiosqlite) + SQLModel         │
│ Local AI Inference    │ Ollama (Llama 3, Mistral, Qwen, etc.) │
│ Vector Database (RAG) │ Qdrant (Local Docker or in-memory)    │
│ Embeddings & Parsing  │ FastEmbed, Docling, PyMuPDF, Pandas   │
│ Security & Guardrails │ Sentinel (PII Masking, Egress Guard)  │
│ Containerization      │ Docker & Docker Compose               │
└───────────────────────┴───────────────────────────────────────┘
```

### Why only these technologies?

| Technology | What it does | Why we chose it (and not alternatives) |
| :--- | :--- | :--- |
| **FastAPI + Uvicorn** | Python Backend API | Extremely fast, native async/await for streaming AI responses token-by-token, automatic Swagger UI docs, and built-in Pydantic data validation. |
| **Python 3.12+** | Backend Language | The native standard for AI/ML libraries, with major speed and typing enhancements in 3.12. |
| **SQLModel + aiosqlite** | Local Database | Uses standard SQLite (`vajra.db`) which requires **zero external database server to install**. SQLModel combines SQLAlchemy with Pydantic for high type-safety. |
| **Ollama** | Local LLM Engine | The easiest and fastest way to run open-weight AI models (Llama 3, DeepSeek, Qwen) directly on consumer laptops (CPU/GPU) with zero cloud setup. |
| **Qdrant** | Vector Search Engine | Blazing fast vector database written in Rust. Runs locally via Docker, supports instant similarity search for RAG with zero internet needed. |
| **FastEmbed & Docling** | Embeddings & Parsing | Generates text embeddings locally without calling cloud APIs; parses complex PDFs, tables, and scanned pages accurately. |
| **Next.js & React** | Frontend UI | Instant UI rendering, clean component model, built-in support for Server-Sent Events (SSE) to show the AI typing and thinking in real-time. |
| **Docker Compose** | One-Click Deployment | Bundles the backend, Qdrant vector store, and sandbox environments so anyone can run the whole system with a single command. |

---

## 3. The 6 Core Subsystems

Think of VAJRA as a high-tech robotic workstation with six specialized departments:

```
                  ┌─────────────────────────────────┐
                  │          USER PROMPT            │
                  └────────────────┬────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────┐
│ 1. SENTINEL & SOVEREIGNTY GUARD                                   │
│    • Checks for PII (names, credit cards, passwords)              │
│    • Egress Guard: blocks any outbound internet requests          │
└──────────────────────────────────┬────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────┐
│ 2. MODEL ROUTER & RUNTIME                                         │
│    • Checks hardware (RAM, VRAM, CPU vs GPU)                      │
│    • Routes task to best local model (e.g., Llama-3.2, Qwen-Coder)│
└──────────────────────────────────┬────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────┐
│ 3. AGENT ORCHESTRATOR (The Brain)                                 │
│    • Plans multi-step actions (ReAct Loop: Think -> Act -> Obs)   │
│    • Decides which tools or RAG documents to consult              │
└──────────────┬─────────────────────────────────────┬──────────────┘
               │                                     │
               ▼                                     ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ 4. RAG SUBSYSTEM (Memory)     │   │ 5. TOOLS & SANDBOX (Hands)    │
│    • Document Parser (PDF/CSV)│   │    • Run Python code safely   │
│    • Chunking & FastEmbed     │   │    • Read/Write local files   │
│    • Qdrant Vector Retrieval  │   │    • Calculate statistics     │
└──────────────┬────────────────┘   └───────────────┬───────────────┘
               │                                    │
               └─────────────────┬──────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│ 6. ARTIFACTS ENGINE                                               │
│    • Formats results into Markdown, DOCX, CSV, charts             │
│    • Streams final output to Frontend via SSE                     │
└───────────────────────────────────────────────────────────────────┘
```

---

## 4. End-to-End Workflow: Step-by-Step Example

Let's trace a realistic example:
> **User asks:** *"Read the uploaded `quarterly_sales.csv`, calculate total revenue per region, and give me a summary report."*

### Step 1: Ingestion & Sentinel Check
1. The user uploads the file and prompt through the Next.js web app.
2. The request hits FastAPI at `/api/agent/run` (or `/api/rag/upload`).
3. **Sentinel** inspects the input:
   - Sanitizes sensitive tokens (PII masking if enabled).
   - Verifies all operations are strictly on-premise (no cloud calls allowed).

### Step 2: RAG Parsing & Indexing
1. `apps/api/vajra/rag/parse.py` detects the `.csv` file.
2. It uses `pandas` / `csv` to extract columns, datatypes, sample rows, and numerical stats.
3. The content is chunked into logical blocks.
4. `FastEmbed` converts the text chunks into vectors (mathematical arrays) and stores them in **Qdrant**.

### Step 3: Model Routing & Planning
1. `apps/api/vajra/router/` inspects your hardware profile (e.g. `laptop-8gb` or `workstation-32gb`).
2. It selects the best local Ollama model available (e.g. `llama3.2:3b` or `qwen2.5-coder`).
3. The **Agent Orchestrator** creates a step-by-step plan:
   * *Step 1:* Retrieve data schema from RAG.
   * *Step 2:* Execute a Python script in the Sandbox to aggregate revenue by region.
   * *Step 3:* Format the output into a markdown table report.

### Step 4: Tool Execution in Sandbox
1. The AI writes a Python script to sum the revenue column.
2. The **Sandbox** executes the Python code in an isolated process.
3. The agent receives the calculated output and verifies the result.

### Step 5: Streaming & Artifact Generation
1. The orchestrator streams the final reasoning and report tokens via **Server-Sent Events (SSE)**.
2. The user sees the text stream in real time on the frontend.
3. If configured, the **Artifacts Engine** generates a downloadable `.docx` or `.csv` in `data/artifacts/`.

---

## 5. Repository File Map & What Lives Where

```
Sovereign-Workbench/
│
├── apps/
│   ├── api/                          # FastAPI Backend Application
│   │   ├── pyproject.toml            # Backend dependencies & configuration
│   │   └── vajra/                    # Core Python package
│   │       ├── main.py               # Entry point (FastAPI app launch & lifespan)
│   │       ├── agent/                # Agent loops, ReAct prompt templates, memory
│   │       ├── api/                  # API route handlers (endpoints for /chat, /rag, /tools)
│   │       ├── artifacts/            # Document generator (DOCX, Markdown, exports)
│   │       ├── auth/                 # Local authentication & RBAC user roles
│   │       ├── core/                 # App settings, config loading (settings.py)
│   │       ├── events/               # Event bus & real-time SSE streaming helpers
│   │       ├── orchestrator/         # Multi-agent execution coordinator & state manager
│   │       ├── rag/                  # Document parsing, chunking, and Qdrant search
│   │       ├── registry/             # Model & capability registries
│   │       ├── router/               # Smart Model Router (hardware/task-based routing)
│   │       ├── runtimes/             # Ollama, Llama.cpp, and mock runtime connectors
│   │       ├── sandbox/              # Safe isolated Python execution environment
│   │       ├── sentinel/             # Security layer (PII masking, audit logging)
│   │       ├── sovereignty/          # Egress Guard (network traffic interceptor)
│   │       ├── store/                # SQLModel database models & SQLite session logic
│   │       └── tools/                # Built-in agent tools (bash, python, files, web)
│   │
│   └── web/                          # Next.js Frontend Web Application
│       ├── package.json              # Frontend npm dependencies
│       └── src/                      # React pages, components, hooks, and UI state
│
├── config/                           # YAML config files (models.yaml, policies.yaml)
├── data/                             # Local data directory (ignored by git for privacy)
│   ├── vajra.db                      # Local SQLite database
│   ├── uploads/                      # User-uploaded files
│   ├── artifacts/                    # AI-generated output files
│   └── qdrant/                       # Qdrant vector database storage
│
├── docs/                             # Full technical documentation & guides
├── infra/                            # Deployment & Container files
│   ├── Dockerfile                    # Container image definition for backend
│   └── docker-compose.yml            # Multi-container setup (FastAPI + Qdrant)
│
└── README.md                         # Project overview and quickstart instructions
```

---

## 6. Common Developer Commands (Cheat Sheet)

### Running Locally (Native)

1. **Start Backend (FastAPI)**
   ```powershell
   cd apps/api
   python -m vajra.main
   # API runs at: http://localhost:8000
   # Swagger Docs at: http://localhost:8000/docs
   ```

2. **Start Frontend (Next.js)**
   ```powershell
   cd apps/web
   npm run dev
   # UI runs at: http://localhost:3000
   ```

3. **Run Backend Test Suite**
   ```powershell
   cd apps/api
   pytest -v
   ```

### Running with Docker

1. **Build and start everything in background:**
   ```powershell
   docker compose -f infra/docker-compose.yml up --build -d
   ```

2. **View live logs:**
   ```powershell
   docker compose -f infra/docker-compose.yml logs -f
   ```

3. **Stop containers:**
   ```powershell
   docker compose -f infra/docker-compose.yml down
   ```

---

## 7. Summary of Key Guarantees

1. **Zero External Data Leaks**: All requests go to your local Ollama instance and local Qdrant instance.
2. **Resource-Adaptive**: Runs smoothly whether you are on a modest 8GB laptop or a 64GB GPU server.
3. **Reproducible & Inspectable**: Full audit log of every prompt, tool execution, and SQL change stored locally in `data/vajra.db`.
