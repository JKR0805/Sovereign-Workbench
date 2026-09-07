import {
  ModelRead,
  DocumentRead,
  ChunkRead,
  SystemHealth,
  NetworkSnapshot,
  ToolSpecification,
  RunRead,
  RunStep,
  RunArtifact,
  WireEvent,
  GraphEntity,
  GraphRelationship,
  WorkflowNode,
  WorkflowEdge,
  AuditRecord
} from './types';

export const MOCK_MODELS: ModelRead[] = [
  {
    id: "llama-3-1-70b",
    display_name: "Llama 3.1 70B",
    runtime_id: "ollama-local",
    runtime_model_id: "llama3.1:70b",
    capabilities: {
      text: 0.95,
      reasoning: 0.94,
      vision: 0.88,
      tool_calling: 0.92,
      structured_output: 0.9,
    },
    capabilities_verified: {
      reasoning: "verified",
      vision: "verified",
      tool_calling: "verified",
    },
    context_window: 131072,
    num_ctx: 8192,
    max_output_tokens: 4096,
    vram_gb: 5.2,
    device: "gpu",
    quantization: "Q4_K_M",
    modalities_in: ["text", "image"],
    priority: 95,
    enabled: true,
    license: "Llama 3.1 Community",
    health: "healthy",
    avg_latency_ms: 320.5,
    tokens_per_sec: 42.4,
    request_count: 512,
    error_count: 0,
    last_probe_at: new Date(Date.now() - 3600000).toISOString(),
    is_resident: true,
  },
  {
    id: "qwen2-vl-72b",
    display_name: "Qwen2-VL 72B",
    runtime_id: "ollama-local",
    runtime_model_id: "qwen2-vl:72b",
    capabilities: {
      vision: 0.96,
      multimodal: 0.95,
      doc_understanding: 0.92,
      text: 0.88,
    },
    capabilities_verified: {
      vision: "verified",
      doc_understanding: "verified",
    },
    context_window: 32768,
    num_ctx: 8192,
    max_output_tokens: 4096,
    vram_gb: 6.1,
    device: "gpu",
    quantization: "Q4_K_M",
    modalities_in: ["text", "image"],
    priority: 90,
    enabled: true,
    license: "Apache-2.0",
    health: "healthy",
    avg_latency_ms: 410.0,
    tokens_per_sec: 34.8,
    request_count: 248,
    error_count: 0,
    last_probe_at: new Date(Date.now() - 7200000).toISOString(),
    is_resident: false,
  },
  {
    id: "mistral-large-2",
    display_name: "Mistral Large 2",
    runtime_id: "ollama-local",
    runtime_model_id: "mistral-large:123b",
    capabilities: {
      text: 0.94,
      reasoning: 0.91,
      coding: 0.92,
      vision: 0.85,
    },
    capabilities_verified: {
      text: "verified",
      reasoning: "verified",
    },
    context_window: 128000,
    num_ctx: 8192,
    max_output_tokens: 4096,
    vram_gb: 8.4,
    device: "gpu",
    quantization: "Q4_0",
    modalities_in: ["text"],
    priority: 80,
    enabled: true,
    license: "Mistral Research",
    health: "degraded",
    avg_latency_ms: 680.0,
    tokens_per_sec: 22.1,
    request_count: 89,
    error_count: 1,
    last_probe_at: new Date(Date.now() - 14400000).toISOString(),
    is_resident: false,
  },
  {
    id: "phi-3-medium",
    display_name: "Phi 3 Medium",
    runtime_id: "ollama-local",
    runtime_model_id: "phi3:14b",
    capabilities: {
      text: 0.86,
      reasoning: 0.82,
      coding: 0.79,
    },
    capabilities_verified: {
      text: "verified",
    },
    context_window: 128000,
    num_ctx: 8192,
    max_output_tokens: 4096,
    vram_gb: 2.8,
    device: "gpu",
    quantization: "Q4_K_M",
    modalities_in: ["text"],
    priority: 75,
    enabled: true,
    license: "MIT",
    health: "healthy",
    avg_latency_ms: 180.2,
    tokens_per_sec: 58.6,
    request_count: 630,
    error_count: 0,
    last_probe_at: new Date(Date.now() - 1800000).toISOString(),
    is_resident: false,
  },
  {
    id: "general-reasoning",
    display_name: "General Reasoning (Qwen 3 8B)",
    runtime_id: "ollama-local",
    runtime_model_id: "qwen3:8b",
    capabilities: {
      text: 0.9,
      reasoning: 0.88,
      tool_calling: 0.85,
      structured_output: 0.82,
    },
    capabilities_verified: {
      reasoning: "verified",
      tool_calling: "verified",
    },
    context_window: 32768,
    num_ctx: 8192,
    max_output_tokens: 4096,
    vram_gb: 5.0,
    device: "gpu",
    quantization: "Q4_K_M",
    modalities_in: ["text"],
    priority: 70,
    enabled: true,
    license: "Apache-2.0",
    health: "healthy",
    avg_latency_ms: 380.5,
    tokens_per_sec: 44.2,
    request_count: 1420,
    error_count: 0,
    last_probe_at: new Date(Date.now() - 900000).toISOString(),
    is_resident: true,
  },
  {
    id: "fastembed-bge",
    display_name: "FastEmbed CPU (BGE-Small-EN)",
    runtime_id: "fastembed-cpu",
    runtime_model_id: "bge-small-en-v1.5",
    capabilities: {
      embedding: 0.95,
    },
    capabilities_verified: {
      embedding: "verified",
    },
    context_window: 512,
    num_ctx: 512,
    vram_gb: 0.0,
    device: "cpu",
    modalities_in: ["text"],
    priority: 100,
    enabled: true,
    license: "MIT",
    health: "healthy",
    avg_latency_ms: 38.4,
    request_count: 4210,
    error_count: 0,
    is_resident: true,
  }
];

export const MOCK_DOCUMENTS: DocumentRead[] = [
  {
    id: "doc-refinery-safety",
    filename: "Refinery_Safety_Manual.pdf",
    sha256: "9e2c4f738b1d92a0172e90e791b8a5d3f2a890124b89dcfa7102e345890123ef",
    mime: "application/pdf",
    size_bytes: 2516582, // 2.4 MB
    page_count: 48,
    scanned_page_count: 4,
    status: "analyzed",
    parser: "pymupdf",
    ingested_at: new Date(Date.now() - 7200000).toISOString(),
    created_at: new Date(Date.now() - 7200000).toISOString(),
    chunks_count: 184,
  },
  {
    id: "doc-equipment-spec",
    filename: "Equipment_Specifications.docx",
    sha256: "47b2c918a0e819d45e01f2bc8a76d1e49021cbf487192a09182374b891234abc",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 1153433, // 1.1 MB
    page_count: 22,
    scanned_page_count: 0,
    status: "analyzed",
    parser: "text",
    ingested_at: new Date(Date.now() - 18000000).toISOString(),
    created_at: new Date(Date.now() - 18000000).toISOString(),
    chunks_count: 92,
  },
  {
    id: "doc-incident-report",
    filename: "Incident_Report_2024.pdf",
    sha256: "51c098234ea71b092834d8a1728394ef19283471092834a71928340192834abc",
    mime: "application/pdf",
    size_bytes: 3984588, // 3.8 MB
    page_count: 14,
    scanned_page_count: 2,
    status: "ready",
    parser: "pymupdf",
    ingested_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    chunks_count: 56,
  },
  {
    id: "doc-e102-report",
    filename: "e102_report.md",
    sha256: "3a74b34b6b668d27b99c1e7a6279f64a7c2fefb76b1582239f1c7d23d8c484f9",
    mime: "text/markdown",
    size_bytes: 1024,
    page_count: 1,
    scanned_page_count: 0,
    status: "analyzed",
    parser: "text",
    ingested_at: new Date(Date.now() - 259200000).toISOString(),
    created_at: new Date(Date.now() - 259200000).toISOString(),
    chunks_count: 4,
  }
];

export const MOCK_CHUNKS: Record<string, ChunkRead[]> = {
  "doc-refinery-safety": [
    {
      id: "chunk-rs-1",
      document_id: "doc-refinery-safety",
      ordinal: 12,
      text: "4.2.3 Emergency Shutdown Procedure: In case of abnormal temperature or pressure conditions, the emergency shutdown system (ESD) shall be activated immediately. The ESD will isolate the distillation column and cut feed supply within 30 seconds.",
      section_path: "Safety Protocols > Emergency Shutdown",
      page_from: 12,
      page_to: 12,
      token_count: 78,
    },
    {
      id: "chunk-rs-2",
      document_id: "doc-refinery-safety",
      ordinal: 13,
      text: "Operating temperature threshold: Distillation column DC-101 design limit is 350°C. If operational temperature exceeds 350°C, personnel must initiate controlled evacuation of Level 3 catwalks.",
      section_path: "Safety Protocols > Thermal Thresholds",
      page_from: 12,
      page_to: 13,
      token_count: 64,
    }
  ],
  "doc-e102-report": [
    {
      id: "chunk-e102-1",
      document_id: "doc-e102-report",
      ordinal: 0,
      text: "Heat Exchanger E-102 Inspection Report. Measured wall thickness: 6.8 mm across all tube passes. ASME Section VIII retirement limit is 5.0 mm. Status: Satisfactory with recommended 12-month re-inspection.",
      section_path: "Inspection Findings > Wall Thickness",
      page_from: 1,
      page_to: 1,
      token_count: 68,
    }
  ]
};

export const MOCK_SYSTEM_HEALTH: SystemHealth = {
  status: "healthy",
  ts: new Date().toISOString(),
  version: "0.1.0",
  profile: "on-premise-airgap",
  python: "3.11.9",
  platform: "Windows 11 / Linux (Airgap Host)",
  database_journal_mode: "wal",
  services: [
    {
      name: "ollama",
      state: "healthy",
      detail: "Ollama 0.3.12 responding on http://127.0.0.1:11434 (NVIDIA GPU Passthrough)",
      endpoint: "http://127.0.0.1:11434",
      latency_ms: 12.4,
    },
    {
      name: "qdrant",
      state: "healthy",
      detail: "Embedded vector storage at data/qdrant (CPU FastEmbed 384d)",
      endpoint: "data/qdrant",
      latency_ms: 2.1,
    },
    {
      name: "sandbox",
      state: "healthy",
      detail: "Docker daemon connected, image vajra-sandbox:py311 present (--network=none)",
      endpoint: "docker.sock",
      latency_ms: 8.0,
    },
    {
      name: "sentinel",
      state: "healthy",
      detail: "nftables kernel packet filter active, drop counter: 4",
      endpoint: "nftables:inet:vajra",
      latency_ms: 0.4,
    }
  ],
  self_audit_passed: true,
};

export const MOCK_NETWORK_SNAPSHOT: NetworkSnapshot = {
  ts: new Date().toISOString(),
  established_connections: [
    {
      pid: 12480,
      process: "vajra-api.exe",
      laddr: "127.0.0.1:8000",
      raddr: "127.0.0.1:52134",
      status: "ESTABLISHED",
      classification: "LOCAL",
    },
    {
      pid: 12480,
      process: "vajra-api.exe",
      laddr: "127.0.0.1:52135",
      raddr: "127.0.0.1:11434",
      status: "ESTABLISHED",
      classification: "LOCAL",
    },
    {
      pid: 12480,
      process: "vajra-api.exe",
      laddr: "127.0.0.1:52136",
      raddr: "127.0.0.1:6333",
      status: "ESTABLISHED",
      classification: "LOCAL",
    },
    {
      pid: 8840,
      process: "qdrant.exe",
      laddr: "127.0.0.1:6333",
      raddr: "127.0.0.1:52136",
      status: "ESTABLISHED",
      classification: "LOCAL",
    }
  ],
  external_connection_count: 0,
  nft_drop_count: 4,
  persisted_block_count: 4,
};

export const MOCK_TOOLS: ToolSpecification[] = [
  {
    name: "knowledge.search",
    description: "Performs dense semantic similarity search over ingested documents with citation assembly.",
    category: "knowledge",
    parameters_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        top_k: { type: "integer", default: 5 },
        document_ids: { type: "array", items: { type: "string" } }
      },
      required: ["query"]
    },
    implemented: true,
    execution_target: "host"
  },
  {
    name: "sandbox.execute",
    description: "Executes Python code in an isolated Docker container with network disabled and AST static validation.",
    category: "sandbox",
    parameters_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Python code to execute" },
        timeout_s: { type: "integer", default: 30 }
      },
      required: ["code"]
    },
    implemented: true,
    execution_target: "sandbox"
  },
  {
    name: "artifacts.create_docx",
    description: "Compiles formatted analysis into institutional DOCX report deliverable.",
    category: "artifacts",
    parameters_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        sections: { type: "array", items: { type: "object" } }
      },
      required: ["title", "sections"]
    },
    implemented: true,
    execution_target: "host"
  },
  {
    name: "vision.inspect_image",
    description: "Runs open-weight vision model for industrial inspection, component detection, and OCR reading.",
    category: "knowledge",
    parameters_schema: {
      type: "object",
      properties: {
        image_path: { type: "string" },
        task: { type: "string", enum: ["object_detection", "ocr", "diagram", "safety"] }
      },
      required: ["image_path"]
    },
    implemented: true,
    execution_target: "host"
  }
];

export const MOCK_GRAPH_ENTITIES: GraphEntity[] = [
  { id: "cdu", label: "Crude Distillation Unit", type: "Equipment", color: "#4DA3FF", x: 400, y: 280, details: { Tag: "CDU-100", Area: "Refinery Zone 2", Status: "Operational" } },
  { id: "m-man", label: "Maintenance Manual.pdf", type: "Document", color: "#35C08A", x: 200, y: 150, details: { Pages: "128", Classification: "Digital PDF" } },
  { id: "ref-proc", label: "Refinery Process", type: "Process", color: "#A78BFA", x: 380, y: 120, details: { Type: "Continuous Distillation", Standard: "ISO-9001" } },
  { id: "safe-prot", label: "Safety Protocol 2024", type: "Document", color: "#E5484D", x: 580, y: 150, details: { Level: "Critical", Updated: "Jan 2024" } },
  { id: "dist-col", label: "Distillation Column", type: "Equipment", color: "#35C08A", x: 620, y: 280, details: { Model: "DC-101", Height: "42m", Trays: "36" } },
  { id: "inc-117", label: "Incident Report #117", type: "Event", color: "#E0A32E", x: 600, y: 410, details: { Date: "2024-03-12", Severity: "Minor Thermal Drift" } },
  { id: "team-a", label: "Maintenance Team A", type: "Person/Team", color: "#A78BFA", x: 400, y: 440, details: { Lead: "R. Sharma", Shift: "Morning", PSU: "ONGC/IOCL" } },
  { id: "sensor-3", label: "Vibration Sensor #3", type: "Sensor", color: "#4DD4AC", x: 220, y: 410, details: { Telemetry: "60 Hz", LastValue: "4.2 mm/s (Elevated)" } },
  { id: "high-temp", label: "High Temperature", type: "Parameter", color: "#E0A32E", x: 180, y: 280, details: { Current: "342°C", Threshold: "350°C" } }
];

export const MOCK_GRAPH_RELATIONSHIPS: GraphRelationship[] = [
  { id: "r1", source: "m-man", target: "cdu", label: "describes" },
  { id: "r2", source: "ref-proc", target: "cdu", label: "part of" },
  { id: "r3", source: "safe-prot", target: "cdu", label: "governs" },
  { id: "r4", source: "cdu", target: "dist-col", label: "connected to" },
  { id: "r5", source: "dist-col", target: "inc-117", label: "related to" },
  { id: "r6", source: "team-a", target: "cdu", label: "maintains" },
  { id: "r7", source: "sensor-3", target: "cdu", label: "feeds data" },
  { id: "r8", source: "high-temp", target: "cdu", label: "monitors" }
];

export const MOCK_WORKFLOW_NODES: WorkflowNode[] = [
  { id: "wf-1", label: "Trigger", type: "trigger", subtext: "New Document Uploaded", x: 320, y: 30 },
  { id: "wf-2", label: "Planning Agent", type: "llm_agent", model: "Llama 3.1 70B", subtext: "Decompose task & plan pipeline", x: 320, y: 130 },
  { id: "wf-3", label: "Document Reader", type: "document_reader", subtext: "Extract key clauses & tables", x: 140, y: 260 },
  { id: "wf-4", label: "Data Analyzer", type: "data_analyzer", subtext: "Analyze sensor process logs", x: 320, y: 260 },
  { id: "wf-5", label: "Web/Tool Search", type: "tool_executor", subtext: "Fetch local safety standards", x: 500, y: 260 },
  { id: "wf-6", label: "Synthesis Agent", type: "llm_agent", model: "Llama 3.1 70B", subtext: "Generate compliance report", x: 320, y: 380 },
  { id: "wf-7", label: "Output", type: "output", subtext: "Save to Knowledge Base", x: 320, y: 490 }
];

export const MOCK_WORKFLOW_EDGES: WorkflowEdge[] = [
  { id: "we-1", source: "wf-1", target: "wf-2" },
  { id: "we-2", source: "wf-2", target: "wf-3" },
  { id: "we-3", source: "wf-2", target: "wf-4" },
  { id: "we-4", source: "wf-2", target: "wf-5" },
  { id: "we-5", source: "wf-3", target: "wf-6" },
  { id: "we-6", source: "wf-4", target: "wf-6" },
  { id: "we-7", source: "wf-5", target: "wf-6" },
  { id: "we-8", source: "wf-6", target: "wf-7" }
];

export const MOCK_RUN: RunRead = {
  id: "8a31e847c21f42a1b9de1891db854201",
  prompt: "Evaluate equipment wall thickness from e102_report.md against ASME safety guidelines and draft an approval note.",
  status: "completed",
  execution_mode: "demo",
  project_id: "default-psu",
  agent_id: "industrial-inspector",
  budget: {
    max_steps: 8,
    max_tool_calls: 12,
    max_wall_time_s: 240,
    used_steps: 5,
    used_tool_calls: 2,
    used_wall_time_s: 7.02,
  },
  models_used: ["vision-document", "general-reasoning"],
  attachments: [
    {
      filename: "e102_report.md",
      mime: "text/markdown",
      size_bytes: 1024,
      document_id: "doc-e102-report",
      page_count: 1,
      scanned_page_count: 0
    }
  ],
  total_tokens: 1240,
  started_at: "2026-09-07T17:35:00.000000Z",
  finished_at: "2026-09-07T17:35:07.024000Z",
  duration_ms: 7024.5,
  created_at: "2026-09-07T17:35:00.000000Z"
};

export const MOCK_RUN_STEPS: RunStep[] = [
  {
    id: "step-1",
    ordinal: 1,
    node_id: "parse",
    kind: "document_parse",
    status: "completed",
    label: "Parse Document",
    started_at: "2026-09-07T17:35:00.000000Z",
    duration_ms: 420.0
  },
  {
    id: "step-2",
    ordinal: 2,
    node_id: "route",
    kind: "model_routing",
    status: "completed",
    label: "Model Routing",
    routing_decision: {
      selected: "vision-document",
      score: 92.4,
      rationale: "High vision capability score (0.88), model resident in memory, matches required input modality.",
      candidates: [
        {
          model_id: "vision-document",
          total_score: 92.4,
          capability_score: 0.88,
          context_score: 0.95,
          latency_score: 0.90,
          residency_score: 1.0,
          is_resident: true
        },
        {
          model_id: "general-reasoning",
          total_score: 71.0,
          capability_score: 0.72,
          context_score: 0.90,
          latency_score: 0.85,
          residency_score: 1.0,
          is_resident: true
        }
      ],
      rejected: [
        {
          model_id: "reason-8b",
          reason: "MISSING_CAPABILITY",
          detail: "Model lacks required capability: vision"
        }
      ]
    },
    started_at: "2026-09-07T17:35:00.500000Z",
    duration_ms: 15.0
  },
  {
    id: "step-3",
    ordinal: 3,
    node_id: "rag",
    kind: "rag_retrieval",
    status: "completed",
    label: "RAG Retrieval",
    started_at: "2026-09-07T17:35:01.000000Z",
    duration_ms: 68.0
  },
  {
    id: "step-4",
    ordinal: 4,
    node_id: "generate",
    kind: "generation",
    status: "completed",
    label: "Generate Note",
    started_at: "2026-09-07T17:35:02.000000Z",
    duration_ms: 4500.0
  },
  {
    id: "step-5",
    ordinal: 5,
    node_id: "artifact",
    kind: "artifact_create",
    status: "completed",
    label: "Artifact DOCX",
    started_at: "2026-09-07T17:35:06.600000Z",
    duration_ms: 420.0
  }
];

export const MOCK_RUN_ARTIFACTS: RunArtifact[] = [
  {
    id: "art-01",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    filename: "Approval_Note_E102.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 28420,
    sha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    created_at: "2026-09-07T17:35:06.900000Z"
  }
];

export const MOCK_TIMELINE_EVENTS: WireEvent[] = [
  {
    id: "evt-1",
    seq: 1,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:00.012",
    type: "RUN_CREATED",
    payload: { prompt: "Evaluate equipment wall thickness from e102_report.md..." },
    duration_ms: null
  },
  {
    id: "evt-2",
    seq: 2,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:00.145",
    type: "NODE_ENTERED",
    node_id: "parse",
    payload: { label: "Parse Document", file: "e102_report.md" },
    duration_ms: null
  },
  {
    id: "evt-3",
    seq: 3,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:00.565",
    type: "NODE_COMPLETED",
    node_id: "parse",
    payload: { pages_parsed: 1, chunks: 4 },
    duration_ms: 420.0
  },
  {
    id: "evt-4",
    seq: 4,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:00.570",
    type: "NODE_ENTERED",
    node_id: "route",
    payload: { label: "Model Routing" },
    duration_ms: null
  },
  {
    id: "evt-5",
    seq: 5,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:00.585",
    type: "MODEL_SELECTED",
    node_id: "route",
    payload: { model_id: "vision-document", score: 92.4, rationale: "High vision score (0.88)" },
    duration_ms: 15.0
  },
  {
    id: "evt-6",
    seq: 6,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:01.020",
    type: "NODE_ENTERED",
    node_id: "rag",
    payload: { label: "RAG Retrieval", query: "wall thickness ASME limits" },
    duration_ms: null
  },
  {
    id: "evt-7",
    seq: 7,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:01.088",
    type: "RAG_RESULTS",
    node_id: "rag",
    payload: { chunks_cited: 3, top_score: 0.94 },
    duration_ms: 68.0
  },
  {
    id: "evt-8",
    seq: 8,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:02.100",
    type: "NODE_ENTERED",
    node_id: "generate",
    payload: { label: "Generate Note" },
    duration_ms: null
  },
  {
    id: "evt-9",
    seq: 9,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:06.600",
    type: "FILE_CREATED",
    node_id: "artifact",
    payload: { filename: "Approval_Note_E102.docx", size_bytes: 28420 },
    duration_ms: 420.0
  },
  {
    id: "evt-10",
    seq: 10,
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "17:35:07.024",
    type: "RUN_COMPLETED",
    payload: { total_tokens: 1240, duration_ms: 7024.5 },
    duration_ms: 7024.5
  }
];

export const MOCK_AUDIT_LOGS: AuditRecord[] = [
  {
    seq: 104,
    id: "evt-104",
    stream: "sovereignty",
    ts: "2026-09-07T17:28:12.180Z",
    type: "EGRESS_BLOCKED",
    duration_ms: 0.8,
    payload: {
      target: "api.openai.com:443",
      layer: "socket_guard",
      rule: "RFC1918_LOOPBACK_ENFORCEMENT",
      stack: "httpx/_transports/default.py:line 84 in connect"
    }
  },
  {
    seq: 103,
    id: "evt-103",
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "2026-09-07T17:26:05.100Z",
    type: "FILE_CREATED",
    duration_ms: 420.0,
    payload: {
      filename: "Approval_Note_E102.docx",
      sha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
    }
  },
  {
    seq: 102,
    id: "evt-102",
    stream: "8a31e847c21f42a1b9de1891db854201",
    run_id: "8a31e847c21f42a1b9de1891db854201",
    ts: "2026-09-07T17:25:30.400Z",
    type: "MODEL_SELECTED",
    duration_ms: 14.5,
    payload: {
      winning_model: "qwen3:8b",
      capability_score: 92.4,
      residency_status: "in-vram"
    }
  },
  {
    seq: 101,
    id: "evt-101",
    stream: "system",
    ts: "2026-09-07T17:20:00.000Z",
    type: "VERIFICATION_PASSED",
    duration_ms: 12.0,
    payload: {
      assertion: "STARTUP_SELF_AUDIT_EGRESS_ZERO",
      external_keys_detected: 0,
      loopback_only: true
    }
  }
];

export const MOCK_SAMPLE_PROMPTS = [
  {
    title: "Review Scanned Inspection Report",
    badge1: "vision",
    badge2: "doc",
    prompt: "Review this heat exchanger inspection report (e102_report.md) and verify whether measured wall thickness complies with ASME Section VIII safety limits.",
    docName: "e102_report.md",
    docInfo: "1 p, digital"
  },
  {
    title: "Analyse Equipment Readings (CSV)",
    badge1: "coding",
    badge2: "tool",
    prompt: "Analyse continuous vibration and temperature telemetry for Distillation Column DC-101 to identify anomalies leading up to threshold alarm.",
    docName: "equipment_telemetry.csv",
    docInfo: "12.4K rows"
  },
  {
    title: "Interpret P&ID Diagram",
    badge1: "vision",
    badge2: "vlm",
    prompt: "Analyze the piping and instrumentation diagram (P&ID) for Crude Distillation Unit CDU-100 to map isolation valves around the emergency bypass.",
    docName: "cdu_pid_schematic.png",
    docInfo: "High-res schematic"
  }
];
