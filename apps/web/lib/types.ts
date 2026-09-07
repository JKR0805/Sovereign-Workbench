// TypeScript definitions matching API_REFERENCE.md and FRONTEND_SPECIFICATION.md

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  context?: Record<string, unknown>;
}

export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ServiceHealth {
  name: string;
  state: HealthState;
  detail?: string | null;
  endpoint?: string | null;
  latency_ms?: number | null;
}

export interface SystemHealth {
  status: HealthState;
  ts: string;
  version: string;
  profile: string;
  python: string;
  platform: string;
  database_journal_mode: string;
  services: ServiceHealth[];
  self_audit_passed: boolean | null;
}

export type CapabilityName = 
  | "text" 
  | "reasoning" 
  | "coding" 
  | "vision" 
  | "embedding" 
  | "tool_calling" 
  | "structured_output"
  | "doc_understanding"
  | "multimodal";

export interface ModelRead {
  id: string;
  display_name: string;
  runtime_id: string;
  runtime_model_id: string;
  capabilities: Record<string, number>;
  capabilities_verified?: Record<string, string>;
  context_window: number;
  num_ctx: number;
  max_output_tokens?: number;
  vram_gb: number;
  device: "gpu" | "cpu";
  quantization?: string;
  modalities_in: string[];
  priority: number;
  enabled: boolean;
  license?: string;
  health: HealthState;
  avg_latency_ms?: number;
  tokens_per_sec?: number;
  request_count?: number;
  error_count?: number;
  last_probe_at?: string;
  is_resident?: boolean;
}

export interface ModelProbeResult {
  runtime_reachable: boolean;
  model_available: boolean;
  text_generation_ok: boolean;
  text_latency_ms?: number;
  vision_ok: boolean;
  tool_calling_ok: boolean;
  vram_delta_mb: number;
  probed_at: string;
}

export interface ResidentModelInfo {
  model_id: string;
  runtime_id: string;
  runtime_model_id: string;
  vram_bytes: number;
  expires_at: string;
}

export interface ResidencyState {
  ts: string;
  total_vram_mb: number;
  used_vram_mb: number;
  resident_models: ResidentModelInfo[];
}

export interface RuntimeRead {
  id: string;
  name: string;
  type: "ollama" | "vllm" | "tgi" | "fastembed";
  endpoint: string;
  is_local: boolean;
  status: HealthState;
  version?: string;
  available_models_count?: number;
}

export interface SimulateRequest {
  prompt: string;
  attachments?: {
    filename: string;
    mime: string;
    size_bytes: number;
    page_count?: number;
    scanned_page_count?: number;
  }[];
  weights?: {
    capability?: number;
    preferred?: number;
    context?: number;
    latency?: number;
    priority?: number;
    residency?: number;
    reliability?: number;
  };
  task_labels?: Record<string, string>;
}

export interface RoutingCandidate {
  model_id: string;
  total_score: number;
  capability_score: number;
  context_score: number;
  latency_score: number;
  residency_score: number;
  is_resident: boolean;
}

export interface RoutingRejected {
  model_id: string;
  reason: string;
  detail: string;
}

export interface RoutingDecision {
  task_id: string;
  selected: string;
  score: number;
  rationale: string;
  candidates: RoutingCandidate[];
  rejected: RoutingRejected[];
  fallbacks: string[];
  policy_applied?: string;
  decided_in_ms: number;
}

export interface SimulateResponse {
  task: {
    task_id: string;
    intent: string;
    required_capabilities: string[];
    preferred_capabilities: string[];
    required_modalities: string[];
    estimated_input_tokens: number;
    latency_budget_ms: number;
  };
  decision: RoutingDecision;
}

export interface RoutingPolicy {
  id: string;
  name: string;
  description: string;
  active: boolean;
  rules: {
    condition: string;
    target_model_or_capability: string;
    priority_offset: number;
  }[];
  weights: {
    capability: number;
    preferred: number;
    context: number;
    latency: number;
    priority: number;
    residency: number;
    reliability: number;
  };
  updated_at: string;
}

export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface RunBudget {
  max_steps: number;
  max_tool_calls: number;
  max_wall_time_s: number;
  used_steps: number;
  used_tool_calls: number;
  used_wall_time_s: number;
}

export interface RunAttachment {
  filename: string;
  mime: string;
  size_bytes: number;
  document_id?: string;
  page_count?: number;
  scanned_page_count?: number;
}

export interface RunRead {
  id: string;
  prompt: string;
  status: RunStatus;
  execution_mode: "demo" | "full" | "test";
  project_id?: string | null;
  agent_id?: string | null;
  task_spec?: Record<string, unknown>;
  budget: RunBudget;
  models_used: string[];
  attachments: RunAttachment[];
  total_tokens: number;
  started_at: string;
  finished_at?: string | null;
  duration_ms?: number;
  error?: string | null;
  created_at: string;
}

export interface RunStep {
  id: string;
  ordinal: number;
  node_id: string;
  kind: string;
  status: "waiting" | "running" | "completed" | "failed" | "skipped";
  label?: string;
  routing_decision?: Partial<RoutingDecision>;
  started_at?: string;
  duration_ms?: number;
  error?: string;
}

export interface RunArtifact {
  id: string;
  run_id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

export type WireEventType =
  | "RUN_CREATED"
  | "NODE_ENTERED"
  | "NODE_COMPLETED"
  | "NODE_FAILED"
  | "DOCUMENT_INGESTED"
  | "PAGE_CLASSIFIED"
  | "TASK_CLASSIFIED"
  | "MODEL_CANDIDATES"
  | "MODEL_SELECTED"
  | "MODEL_LOADING"
  | "MODEL_READY"
  | "LLM_TOKEN"
  | "RAG_QUERY"
  | "RAG_RESULTS"
  | "TOOL_CALLED"
  | "TOOL_RESULT"
  | "SANDBOX_STARTED"
  | "SANDBOX_COMPLETED"
  | "VERIFICATION_PASSED"
  | "FILE_CREATED"
  | "RUN_COMPLETED"
  | "RUN_FAILED"
  | "RUN_CANCELLED"
  | "EGRESS_ATTEMPT"
  | "EGRESS_BLOCKED";

export interface WireEvent {
  id: string;
  seq: number;
  stream: string;
  run_id: string;
  ts: string;
  type: WireEventType;
  node_id?: string | null;
  payload: Record<string, any>;
  duration_ms?: number | null;
}

export interface DocumentRead {
  id: string;
  project_id?: string | null;
  filename: string;
  sha256: string;
  mime: string;
  size_bytes: number;
  page_count: number;
  scanned_page_count: number;
  status: "indexed" | "analyzed" | "processing" | "ready" | "failed";
  parser: "pymupdf" | "text" | "table";
  ingested_at: string;
  error?: string | null;
  created_at: string;
  chunks_count?: number;
}

export interface ChunkRead {
  id: string;
  document_id: string;
  ordinal: number;
  text: string;
  section_path: string;
  page_from: number;
  page_to: number;
  token_count: number;
}

export interface SearchChunk {
  marker: string; // e.g. "[C1]"
  label: string;  // e.g. "e102_report.md > p.1"
  chunk_id: string;
  document_id: string;
  text: string;
  page_from: number;
  page_to: number;
  section_path: string;
  doc_title: string;
  score: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  chunks: SearchChunk[];
  reranked: boolean;
  timings: {
    embed_ms: number;
    retrieve_ms: number;
    rerank_ms?: number | null;
    total_ms: number;
  };
}

export interface EstablishedConnection {
  pid: number;
  process: string;
  laddr: string;
  raddr: string;
  status: string;
  classification: "LOCAL" | "INTERNAL" | "EXTERNAL";
}

export interface NetworkSnapshot {
  ts: string;
  established_connections: EstablishedConnection[];
  external_connection_count: number;
  nft_drop_count: number;
  persisted_block_count: number;
}

export interface ProbeEgressResult {
  target: string;
  blocked: boolean;
  layer: "app" | "audit" | "sandbox" | "kernel";
  detail: string;
  caller: string;
}

export interface ToolSpecification {
  name: string;
  description: string;
  category: "knowledge" | "sandbox" | "artifacts" | "system";
  parameters_schema: Record<string, any>;
  implemented: boolean;
  execution_target: "host" | "sandbox";
}

export interface SandboxPolicy {
  docker_connected: boolean;
  image: string;
  network_disabled: boolean;
  memory_limit_mb: number;
  cpu_quota_cores: number;
  read_only_rootfs: boolean;
  drop_capabilities: string[];
}

export interface AstGuardViolation {
  line: number;
  col: number;
  code_snippet: string;
  rule: string;
  severity: "error" | "warning";
}

export interface AstGuardResult {
  valid: boolean;
  violations: AstGuardViolation[];
  scanned_in_ms: number;
}

export interface AuditRecord {
  seq: number;
  id: string;
  stream: string;
  run_id?: string;
  ts: string;
  type: WireEventType;
  node_id?: string | null;
  duration_ms?: number | null;
  payload: Record<string, any>;
}

// Knowledge Graph Types
export interface GraphEntity {
  id: string;
  label: string;
  type: "Equipment" | "Document" | "Process" | "Person/Team" | "Sensor" | "Event" | "Parameter";
  color: string;
  x: number;
  y: number;
  details?: Record<string, string>;
}

export interface GraphRelationship {
  id: string;
  source: string;
  target: string;
  label: string;
}

// Workflow Builder Types
export interface WorkflowNode {
  id: string;
  label: string;
  type: "trigger" | "llm_agent" | "document_reader" | "data_analyzer" | "tool_executor" | "conditional" | "human_review" | "output";
  model?: string;
  subtext?: string;
  x: number;
  y: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
