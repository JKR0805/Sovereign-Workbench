# VAJRA: Frontend Application Specification

This document defines the complete architecture, design system, component hierarchy, state management strategy, and screen specifications for the VAJRA frontend web application (`apps/web`).

---

## 1. Architecture & Technology Stack

### Core Technologies
- **Framework**: Next.js (App Router), React 19, TypeScript
- **Styling**: Vanilla Tailwind CSS with custom CSS variables for design system tokens
- **Component Primitives**: Restyled shadcn/ui (Radix UI primitives)
- **Graph Visualization**: `@xyflow/react` (React Flow v12) with Dagre layout
- **Animation**: Framer Motion (scoped strictly to state transitions and active graph edge flows)
- **Server Cache**: TanStack Query v5
- **Stream State**: Zustand store driving the event-stream reducer
- **Charts & Gauges**: Recharts (VRAM gauges, latency sparklines)
- **Typography**: Inter Tight (UI copy) and JetBrains Mono (all numbers, IDs, paths, model tags, and log strings)

### Airgap & Sovereignty Constraints
- **Zero External Network Calls**: Strictly enforced via Content Security Policy (CSP):
  ```text
  default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self';
  ```
- **Local Assets Only**: No Google Fonts CDN, no external icon packs, no cloud telemetry. Fonts and static assets are bundled locally in `public/`.
- **Standalone Production Build**: Configured via `output: 'standalone'` in `next.config.js` with telemetry explicitly disabled (`NEXT_TELEMETRY_DISABLED=1`).

---

## 2. Design System Tokens & Styling Rules

All styling is bound to CSS variables declared in `styles/tokens.css`.

### 2.1 Color Palette
```css
:root {
  /* Surfaces */
  --bg-base:        #0A0C10; /* Deep canvas background */
  --bg-panel:       #11141A; /* Primary panels and sidebars */
  --bg-elevated:    #171B22; /* Cards, popovers, dropdowns */

  /* Borders */
  --border:         #232833; /* Standard card/panel border */
  --border-strong:  #2E3542; /* Focused, hovered, or active border */

  /* Typography */
  --text-primary:   #E6EAF2; /* Headings and active values */
  --text-secondary: #8B94A6; /* Body text and field labels */
  --text-tertiary:  #5A6376; /* Placeholder text and muted metadata */

  /* Accent & Semantic States */
  --accent:         #4DA3FF; /* Single primary accent: selection and active nodes */
  --ok:             #35C08A; /* Success, healthy, verified */
  --warn:           #E0A32E; /* Degraded, warning, unverified */
  --error:          #E5484D; /* Egress blocked, failed, unhealthy */

  /* Modality Tints (used only on capability chips) */
  --vision:         #A78BFA;
  --coding:         #4DD4AC;
  --reasoning:      #4DA3FF;
}
```

### 2.2 Styling Constraints
1. **4px Spacing Grid**: All padding, margins, and gaps must follow multiples of 4px (`gap-1` [4px], `gap-2` [8px], `gap-4` [16px], `gap-6` [24px]).
2. **Corner Radii**: Strictly `rounded` (4px) on controls/inputs, and `rounded-md` (6px) on cards and panels. Never exceed 6px.
3. **Contrast-Based Elevation**: Panels are distinguished by border contrast (`border border-[var(--border)]`) rather than drop shadows.
4. **Monospace Rule**: Every numeric metric, timestamp, UUID, file path, model tag, exit code, and token count must render in JetBrains Mono (`font-mono`).
5. **No Decorative Gradients**: Gradients are disallowed, except for a 1px top highlight on elevated panels.
6. **Transitions**: Standard motion budget is 120ms to 200ms `cubic-bezier(0.2, 0.8, 0.2, 1)`.

---

## 3. Global Shell & Persistent Chrome

The application shell wraps every page and provides continuous context.

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Breadcrumb · Active Project · Command Palette Hint (⌘K)       │
├────────┬───────────────────────────────────────────────────────────────┤
│ SIDE   │                                                               │
│ NAV    │                    MAIN VIEWPORT                              │
│ (Icon  │                                                               │
│ Rail)  │                                                               │
├────────┴───────────────────────────────────────────────────────────────┤
│ STATUS BAR (28px): ● SOVEREIGN · Models · GPU · Active Run · Egress    │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Persistent Bottom Status Bar (28px)
Located at the bottom of every screen. Keeps hardware and sovereignty status visible at all times without taking significant screen space:
- **Sovereignty Pill**: `● SOVEREIGN` (Green dot when self-audit passes and external connections equal 0; flashes Red if an egress attempt occurs).
- **Loaded Models & VRAM**: Displays resident models and memory footprint (e.g. `qwen3:8b (5.2 GB)`).
- **GPU Usage**: Live percentage meter polled from runtime.
- **Active Run Tracker**: Displays active run ID and duration counter. Clicking navigates directly to `/runs/[id]`.
- **Egress Counter**: `0 EXTERNAL | 4 BLOCKED` (Driven by real-time ledger count).
- **Keyboard Shortcut Trigger**: `⌘K` affordance.

### 3.2 Collapsible Side Navigation Rail
Icon rail collapsed to 56px by default, expanding to 200px on hover:
- **Workbench** (`/`)
- **Runs** (`/runs`)
- **Model Hub** (`/models`)
- **Routing Studio** (`/routing`)
- **Knowledge Base** (`/knowledge`)
- **Tools & Sandbox** (`/tools`)
- **Network & Sovereignty** (`/network`)
- **Audit Explorer** (`/audit`)

### 3.3 Command Palette (`⌘K`)
Accessible globally via `⌘K` or `Ctrl+K`:
- Jump to any route.
- Search knowledge documents.
- Search models and inspect health.
- Quick trigger: Run sample demo tasks.
- Quick trigger: Toggle sovereignty monitor.

---

## 4. Screen-by-Screen Specifications

### 4.1 Workbench (`/`)
The primary launchpad for institutional operations.

```
┌────────────────────────────────────────────────────────────────┐
│                   SOVEREIGN WORKBENCH                          │
│        4 models resident · knowledge base: 14 documents        │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Enter instructions for analysis, extraction or code...   │  │
│  │                                                          │  │
│  │                                                          │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ [📎 Attach Files]       e102_report.md (1 p, digital)   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ⚡ PROVISIONAL ROUTING: doc_understanding → vision required     │
│     ~2.8K tokens · Selected: vision-document (Score: 92.4)     │
│                                                   [Run Task ↵] │
│                                                                │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │
│  │ Review Scanned   │ │ Analyse Equipment│ │ Interpret P&ID  │ │
│  │ Inspection Report│ │ Readings (CSV)   │ │ Diagram         │ │
│  │ [vision] [doc]   │ │ [coding] [tool]  │ │ [vision] [vlm]  │ │
│  └──────────────────┘ └──────────────────┘ └─────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

#### Key Interactions & State
1. **Centered Composer (720px width)**: High-focus multiline textarea with subtle accent border glow on focus.
2. **Provisional Routing Strip**: As the user types or attaches files, calls `POST /api/routing/simulate` (debounced at 300ms) and renders the provisional routing decision *before* submission:
   - Identifies required capabilities.
   - Estimates token count.
   - Shows predicted model and capability score.
3. **Capability Starter Cards**: Three quick-start buttons (*Review Scanned Report*, *Analyse Equipment Data*, *Interpret P&ID*) that populate sample prompts and attach demo corpus files with one click.
4. **Submission**: Submitting creates a run via `POST /api/runs` and transitions immediately to `/runs/{run_id}`.

---

### 4.2 Agent Run View (`/runs/[id]`)
The core screen of the workbench, visualizing execution, routing decisions, tool interactions, and deliverable creation.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Run 8a31e847 · Prompt: Evaluate wall thickness... · [COMPLETED] · 7.02s   │
│ Budget: Steps [4/8] · Tools [2/12] · Wall Time [7s/240s] · [Export Audit]│
├───────────────┬───────────────────────────────────────────┬───────────────┤
│ TIMELINE      │ REACT FLOW EXECUTION GRAPH                │ INSPECTOR     │
│ (280px)       │                                           │ (380px)       │
│               │         ┌───────────────┐                 │               │
│ 17:35:00      │         │ Parse Document│                 │ [Routing Info]│
│ Run Created   │         └───────┬───────┘                 │ Model:        │
│               │                 ▼                         │ vision-doc    │
│ 17:35:00      │         ┌───────────────┐                 │ Score: 92.4   │
│ Ingesting...  │         │ Model Routing │ ◄ (Selected)    │ Rationale:    │
│               │         └───────┬───────┘                 │ High vision   │
│ 17:35:01      │                 ▼                         │ score (0.88)  │
│ Route Selected│         ┌───────────────┐                 │               │
│               │         │ RAG Retrieval │                 │ Candidates:   │
│ 17:35:03      │         └───────┬───────┘                 │ 1. vision 92.4│
│ Chunks Cited  │                 ▼                         │ 2. reason 71.0│
│               │         ┌───────────────┐                 │               │
│ 17:35:06      │         │ Generate Note │                 │ Rejected:     │
│ Artifact Done │         └───────┬───────┘                 │ reason-8b:    │
│               │                 ▼                         │ missing vision│
│ 17:35:07      │         ┌───────────────┐                 │               │
│ Completed     │         │ Artifact DOCX │                 │               │
│               │         └───────────────┘                 │               │
└───────────────┴───────────────────────────────────────────┴───────────────┘
```

#### 3-Pane Layout
1. **Left Pane: Timeline (280px)**:
   - Chronological list of events received from SSE.
   - Filterable by type (`Nodes`, `Routing`, `RAG`, `Tools`, `Artifacts`).
   - Timestamps formatted in monospace `HH:mm:ss.SSS`.
2. **Center Pane: Execution Graph (React Flow)**:
   - Dynamic Directed Acyclic Graph (DAG) laid out top-to-bottom via Dagre.
   - Auto-pans to the currently executing node unless manually panned by the user.
   - **Node Visual States**:
     - `waiting`: 40% opacity, dashed border.
     - `running`: Accent border, subtle 2px pulse, animated dash-offset edge flowing into node, active substatus line.
     - `completed`: Solid border, green left indicator bar, duration in monospace top-right.
     - `failed`: Red error border, retry affordance.
     - `skipped`: Struck-through title, gray border.
   - **Node Body Designs**:
     - *Model Routing*: Inline badge showing winning model and capability score.
     - *RAG Retrieval*: Displays chunk count (`3 chunks cited`) and top score.
     - *VRAM Scheduler*: Displays eviction and loading progress (`evict coder → load vlm`).
     - *Sandbox Execution*: Displays container exit code and duration.
     - *Artifact Node*: Displays deliverable filename and size.
3. **Right Pane: Context-Sensitive Inspector (380px)**:
   - Opens when any graph node is clicked.
   - *Routing Node Selected*: Shows score breakdown across all 7 terms, candidate ranking table, and rejected models with explicit elimination reasons.
   - *RAG Node Selected*: Shows cited chunks with page numbers, section paths, similarity scores, and button to view chunk in document.
   - *Generation Node Selected*: Shows streamed token stream with token count, tok/s, and collapsible "View Raw Prompt" panel.
   - *Artifact Node Selected*: Shows deliverable filename, SHA-256 hash, file size, and direct download button.

---

### 4.3 Model Hub (`/models`)
Fleet inventory, capability matrix, and VRAM management.

#### Components
1. **Header VRAM Allocation Bar**: Stacked horizontal bar displaying total system GPU VRAM (e.g. 8.0 GB), desktop/OS reservation (1.3 GB), resident model allocations (e.g. 5.2 GB), and remaining headroom.
2. **Capability Filter Strip**: Modality chips (`reasoning`, `coding`, `vision`, `embedding`). Clicking narrows the displayed card grid.
3. **3-Column Card Grid**:
   - Model ID and display name in monospace.
   - Runtime badge (`ollama-local`).
   - Health status dot (`healthy`, `degraded`, `unhealthy`).
   - Capability chips with strength bars (e.g. `reasoning: 0.85`).
   - Verified badge (`✓ verified` vs `unverified`).
   - Context window limit (`num_ctx: 8192 / max: 32768`).
   - VRAM usage indicator (`5.2 GB GPU` or `CPU`).
   - Performance metrics: Latency p50 (`420ms`) and throughput (`38.2 tok/s`).
   - Residency tag (`RESIDENT`) and action buttons (`Load`, `Unload`, `Refresh Health`).

---

### 4.4 Add Model Wizard (`/models/new`)
A focused modal or dedicated panel for registering models without touching code.

#### 3-Step Inline Flow
1. **Step 1: Runtime**: Select local runtime adapter (e.g. `ollama-local`). Shows live connectivity indicator.
2. **Step 2: Identity**: Enter `runtime_model_id` (e.g. `qwen2.5-vl:3b`) with typeahead populated from `GET /api/runtimes/{id}/available`. Enter display name and license type.
3. **Step 3: Capabilities & Bounds**: Checkbox grid for capabilities (`reasoning`, `coding`, `vision`, `tool_calling`). Checking a capability reveals a 0.0 to 1.0 strength slider. Enter VRAM requirement and effective context window (`num_ctx`).
4. **The "Test Connection" Probe Checklist**:
   - Clicking `Test Connection` executes `POST /api/models/probe` and renders real-time verification checkboxes:
     - Runtime reachable (`✓ 12ms`)
     - Model available locally (`✓ present`)
     - Text generation probe (`✓ 410ms`)
     - Vision multimodal probe (`✓ 1.8s` or `✗ unsupported`)
     - Tool-calling schema test (`✓ verified`)
     - VRAM delta measured (`5.1 GB`)
   - Any declared capability that fails the probe is marked with a yellow warning before saving is enabled.

---

### 4.5 Routing Studio (`/routing`)
Interactive visual policy editor and scoring weight tuner.

#### Components
1. **React Flow Policy Canvas**: Visual representation of the routing pipeline. Nodes represent Tasks, Classifiers, Capabilities, Models, and Tool targets. Edges represent routing eligibility with priority weight badges.
2. **Candidate Inspector Drawer**: Slide-over panel to configure hard filters, required modalities, priority offsets, and fallback model chains.
3. **Score Simulator Panel (Bottom Right)**:
   - Textbox to input a test prompt and attach test files.
   - Seven scoring weight sliders:
     - Capability strength weight (`w=0.40`)
     - Preferred capability weight (`w=0.15`)
     - Context window fit weight (`w=0.10`)
     - Latency budget weight (`w=0.10`)
     - Model priority weight (`w=0.10`)
     - VRAM residency affinity weight (`w=0.10`)
     - Reliability history weight (`w=0.05`)
   - **Live Path Illumination**: Clicking "Simulate" calls `POST /api/routing/simulate` and illuminates the winning model path across the graph with candidate score tags.

---

### 4.6 Knowledge Base (`/knowledge`)
Local document ingestion, chunk inspection, and RAG search test bench.

#### Components
1. **Drag-and-Drop Ingestion Zone**: Accepts PDF, Markdown, TXT, and CSV files. Displays real-time upload and ingestion progress:
   - `Parsing document pages...`
   - `Page 1-3 Digital | Page 4 Scanned`
   - `Extracted 42 structure-aware chunks`
   - `Generated CPU FastEmbed embeddings (384d)`
   - `Indexed in Qdrant collection`
2. **Document Data Table**: Columns for filename, file size, page count, scanned page badge, chunk count, parser used (`pymupdf` or `text`), ingestion timestamp, and cascade delete action.
3. **Interactive Search Test Bench**:
   - Query input box with `top_k` slider and document filter multi-select.
   - Renders returned chunks with exact `[C1]`, `[C2]` citation markers, page numbers, section hierarchy paths, and cosine similarity scores.
   - Timings breakdown card: Embed latency (`38.4ms`) + Retrieval latency (`5.2ms`) = Total (`43.6ms`).

---

### 4.7 Document & Chunk Viewer (`/knowledge/[docId]`)
Ground-truth verification interface to validate that citations are accurate.

#### Layout
- **Left Side**: Rendered document pages (PDF canvas or formatted Markdown).
- **Right Side**: Ordered list of extracted `ChunkRead` cards with token counts and section paths.
- **Hover Highlighting**: Hovering any chunk on the right highlights the corresponding bounding box on the rendered page on the left.

---

### 4.8 Network & Sovereignty Monitor (`/network`)
The central proof of on-premise execution and egress denial.

```
┌────────────────────────────────────────────────────────────────┐
│                   SOVEREIGNTY MONITOR                          │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ TRUST BOUNDARY: HOST WORKSTATION (ISOLATED)             │  │
│  │   [API :8000] ── [OLLAMA :11434] ── [QDRANT :6333]       │  │
│  │   ════════════════════════════════════════════════════   │  │
│  │   EGRESS POLICY: DENY ALL NON-RFC1918 / NON-LOOPBACK     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌───────────────┐ ┌───────────────┐ ┌──────────────────────┐  │
│  │ EXTERNAL CONN │ │ BLOCKED CALLS │ │ KERNEL DROP COUNTER  │  │
│  │       0       │ │       4       │ │          4           │  │
│  └───────────────┘ └───────────────┘ └──────────────────────┘  │
│                                                                │
│  [⚠️ ATTEMPT EXTERNAL CALL]   [View nftables Ruleset]          │
│                                                                │
│  LIVE CONNECTIONS (psutil)     REAL-TIME EGRESS LEDGER         │
│  PID 12480 | 127.0.0.1:8000   │ 17:28:12 BLOCKED api.openai.com│
│  PID 12480 | 127.0.0.1:11434  │ Layer: In-process socket guard │
│  PID 12480 | 127.0.0.1:6333   │ Target: api.openai.com:443     │
│  [All connections LOCAL]      │ Log: VAJRA-EGRESS-BLOCK drop   │
└────────────────────────────────────────────────────────────────┘
```

#### Components
1. **Trust Boundary Diagram**: Vector SVG representing the local workstation perimeter, internal containers, and network guard. Blocked calls trigger an animated red pulse hitting the boundary line.
2. **Large Metric Counters**:
   - `EXTERNAL CONNECTIONS`: Must show `0`.
   - `EGRESS CALLS BLOCKED`: Cumulative count of blocked socket calls.
   - `NFT DROP COUNTER`: Verbatim kernel packet filter drops.
3. **Verification Action ("Attempt External Call")**:
   - A prominent button requiring confirmation.
   - Calls `POST /api/network/probe`.
   - Backend genuinely attempts an outbound request to `https://api.openai.com/v1/models`.
   - UI catches the blocked response and demonstrates the 4-layer block live:
     - Process guard triggers.
     - Ledger records the event with caller stack trace.
     - Kernel counter increments.
     - Boundary diagram pulses red.
4. **Live Connection Ledger**: Table displaying all connections from `psutil` categorized as `LOCAL` (green), `INTERNAL` (blue), or `EXTERNAL` (red).
5. **Startup Self-Audit Drawer**: Displays results for all 4 startup sovereignty assertions.

---

### 4.9 Tools & Sandbox (`/tools`)
Inventory of agent tools and Docker code execution sandbox controls.

#### Components
1. **Tool Specification Cards**: Cards for each tool (`knowledge.search`, `sandbox.execute`, `artifacts.create_docx`, etc.) showing Draft 2020-12 parameter JSON schemas and implementation status.
2. **Sandbox Isolation Card**: Confirms Docker sandbox parameters (`network_disabled=True`, memory limit `1GB`, CPU limit `2 cores`, immutable rootfs).
3. **Interactive AST Guard Tester**:
   - Code editor allowing engineers to test Python scripts against the static AST scanner (`POST /api/sandbox/guard`).
   - Entering `import requests` or `import socket` immediately highlights the line in red with the violation rule: `Disallowed networking import blocked before execution`.
4. **Sandbox Egress Test Button**: Executes a socket connection attempt inside the sandbox container and displays the resulting `Network is unreachable` error.

---

### 4.10 Audit Explorer (`/audit`)
Tamper-evident verification of historical operations.

#### Components
1. **Sequential Event Table**: Paginated table reading from `GET /api/audit/events`. Displays monotonic sequence number (`seq`), timestamp, stream/run ID, event type pill, and execution duration.
2. **Event Payload Modal**: Clicking any event expands the complete raw JSON wire payload.
3. **Filter Bar**: Filter by event type (e.g. `ROUTING_DECIDED`, `EGRESS_BLOCKED`, `FILE_CREATED`) and run ID.

---

## 5. State Management Implementation Details

### 5.1 TanStack Query Strategy (REST Cache)
Used for data that changes on user action or periodic polling:
- `['models']`: Cached for 30 seconds. Invalidated on register, delete, or load/unload.
- `['runtimes']`: Cached for 60 seconds.
- `['knowledge', 'documents']`: Cached for 60 seconds. Invalidated on upload or delete.
- `['system', 'health']`: Polled every 10 seconds for the status bar.
- `['network', 'snapshot']`: Polled every 2 seconds when viewing `/network`.

### 5.2 Zustand Run Stream Reducer (Real-Time SSE)
Used for `/runs/[id]` to consume `/api/runs/{id}/events` without polling.

#### State Structure
```typescript
export interface RunStreamState {
  runId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  lastSeq: number;
  prompt: string;
  totalTokens: number;
  tokenStream: string;
  nodes: Record<string, RunNodeState>;
  steps: RunStep[];
  artifacts: RunArtifact[];
  routingDecision: RoutingDecision | null;
  activeNodeId: string | null;
  error: string | null;

  // Actions
  connect: (runId: string) => void;
  disconnect: () => void;
  applyEvent: (event: WireEvent) => void;
}
```

#### Event Reducer Logic
- `RUN_CREATED`: Initialize run metadata, budget, and prompt.
- `NODE_ENTERED`: Set node state to `running`, record start timestamp, and set `activeNodeId`.
- `NODE_COMPLETED`: Set node state to `completed`, record duration, and clear `activeNodeId`.
- `NODE_FAILED`: Set node state to `failed` and record error message.
- `MODEL_SELECTED`: Store winning model, capability score, and rationale.
- `LLM_TOKEN`: Append token string to `tokenStream` and increment `totalTokens`.
- `FILE_CREATED`: Append deliverable metadata to `artifacts` list.
- `RUN_COMPLETED`: Set run status to `completed` and close EventSource.
- `RUN_FAILED`: Set run status to `failed` with error details and close EventSource.

#### Reconnection Protocol
When reconnecting due to network interruption:
```typescript
const eventSource = new EventSource(`/api/runs/${runId}/events?since=${lastSeq}`);
```
The backend automatically replays all events with `seq > lastSeq` in order before resuming live events, ensuring zero state loss.

---

## 6. Recommended Frontend Directory Tree (`apps/web`)

```text
apps/web/
├── app/
│   ├── layout.tsx                 # Root layout with AppShell, StatusBar, and Providers
│   ├── page.tsx                   # Workbench (/)
│   ├── runs/
│   │   ├── page.tsx               # Run History (/runs)
│   │   └── [id]/page.tsx          # Agent Run Graph (/runs/[id])
│   ├── models/
│   │   ├── page.tsx               # Model Hub (/models)
│   │   ├── new/page.tsx           # Add Model Wizard (/models/new)
│   │   └── [id]/page.tsx          # Model Details (/models/[id])
│   ├── routing/
│   │   └── page.tsx               # Routing Studio (/routing)
│   ├── knowledge/
│   │   ├── page.tsx               # Knowledge Base (/knowledge)
│   │   └── [docId]/page.tsx       # Document & Chunk Viewer (/knowledge/[docId])
│   ├── tools/
│   │   └── page.tsx               # Tools & Sandbox (/tools)
│   ├── network/
│   │   └── page.tsx               # Network & Sovereignty Monitor (/network)
│   └── audit/
│       └── page.tsx               # Audit Explorer (/audit)
├── components/
│   ├── shell/
│   │   ├── AppShell.tsx           # 3-zone layout frame
│   │   ├── SideNav.tsx            # Collapsible icon navigation rail
│   │   ├── StatusBar.tsx          # 28px persistent bottom telemetry strip
│   │   └── CommandPalette.tsx     # ⌘K command modal
│   ├── primitives/
│   │   ├── CapabilityChip.tsx     # Modality-tinted capability badge
│   │   ├── StatusDot.tsx          # Green/Amber/Red health dot
│   │   ├── MonoValue.tsx          # Formatted JetBrains Mono value
│   │   ├── ScoreBar.tsx           # 7-factor horizontal scoring bar
│   │   └── MetricStat.tsx         # Large metric card
│   ├── run/
│   │   ├── RunGraph.tsx           # React Flow DAG container
│   │   ├── RunNode.tsx            # Custom React Flow node with 5 visual states
│   │   ├── RunTimeline.tsx        # Left-pane chronological event feed
│   │   ├── NodeInspector.tsx      # Right-pane context-sensitive inspector
│   │   └── TokenStream.tsx        # Real-time token output display
│   ├── routing/
│   │   ├── RoutingCanvas.tsx      # React Flow visual policy editor
│   │   ├── ScoreSimulator.tsx     # Live scoring simulator panel with sliders
│   │   └── PolicyDrawer.tsx       # Policy rule configuration drawer
│   ├── models/
│   │   ├── ModelCard.tsx          # Model Hub grid card
│   │   ├── VramAllocationBar.tsx  # Stacked memory allocation meter
│   │   └── ProbeChecklist.tsx     # Step-by-step probe verification display
│   ├── knowledge/
│   │   ├── DocumentTable.tsx      # Ingested documents table
│   │   ├── IngestDropzone.tsx     # Drag-and-drop file upload with progress
│   │   ├── ChunkViewer.tsx        # Extracted chunk cards
│   │   └── SearchTestBench.tsx    # Hybrid search playground
│   └── network/
│       ├── TrustBoundarySvg.tsx   # Visual perimeter and packet animation
│       ├── ConnectionTable.tsx    # psutil live connections table
│       ├── EgressLedger.tsx       # Real-time blocked egress stream
│       └── ProbeActionButton.tsx  # Attempt External Call test button
├── lib/
│   ├── api.ts                     # Fetch client wrapper with RFC 7807 error handling
│   ├── sse.ts                     # EventSource wrapper with reconnection and heartbeat handling
│   ├── queryClient.ts             # TanStack Query client configuration
│   └── types.ts                   # Generated TypeScript types from OpenAPI schema
├── stores/
│   ├── runStreamStore.ts          # Zustand store for run graph and event reducer
│   ├── routingStudioStore.ts      # Zustand store for routing canvas state
│   └── shellStore.ts              # Zustand store for status bar and navigation
└── styles/
    ├── globals.css                # Tailwind base directives
    └── tokens.css                 # Design system CSS variables
```