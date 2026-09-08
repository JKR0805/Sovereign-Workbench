// TypeScript definitions matching the actual backend Pydantic models
// (apps/api/vajra/*), not the aspirational docs. Where a shape below diverges
// from docs/API_REFERENCE.md, this file is the one that matches what the
// server actually sends -- verified directly against the Python source.

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
  | "doc_understanding"
  | "tool_calling"
  | "structured_output"
  | "long_context"
  | "embedding"
  | "reranking";

// vajra/registry/models.py: ModelRead
export interface ModelRead {
  id: string;
  display_name: string;
  runtime_id: string;
  runtime_model_id: string;
  capabilities: Record<string, number>;
  capabilities_verified: Record<string, string>;
  context_window: number;
  max_output_tokens: number;
  num_ctx: number | null;
  device: "gpu" | "cpu";
  vram_gb: number;
  quantization: string;
  modalities_in: string[];
  priority: number;
  enabled: boolean;
  license: string;
  health: HealthState;
  health_detail: string | null;
  avg_latency_ms: number | null;
  tokens_per_sec: number | null;
  measured_vram_gb: number | null;
  request_count: number;
  error_count: number;
  last_probe_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

// vajra/registry/models.py: ModelRegistration (POST /api/models body)
export interface ModelRegistration {
  id: string;
  display_name: string;
  runtime_id: string;
  runtime_model_id: string;
  capabilities: Record<string, number>;
  context_window: number;
  max_output_tokens?: number;
  num_ctx?: number | null;
  device?: "gpu" | "cpu";
  vram_gb?: number;
  quantization?: string;
  modalities_in?: string[];
  priority?: number;
  enabled?: boolean;
  license?: string;
}

// vajra/registry/models.py: ModelUpdate (PATCH /api/models/{id} body)
export interface ModelUpdate {
  display_name?: string;
  capabilities?: Record<string, number>;
  context_window?: number;
  max_output_tokens?: number;
  num_ctx?: number;
  device?: "gpu" | "cpu";
  vram_gb?: number;
  quantization?: string;
  modalities_in?: string[];
  priority?: number;
  enabled?: boolean;
  license?: string;
}

export interface RuntimeRegistration {
  id: string;
  kind: "ollama" | "vllm" | "openai_compatible";
  base_url: string;
  enabled?: boolean;
}

export interface RuntimeHealth {
  state: HealthState;
  kind: "ollama" | "vllm" | "openai_compatible";
  base_url: string;
  version: string | null;
  detail: string | null;
  latency_ms: number | null;
  checked_at: string;
}

export interface BenchmarkResult {
  model_id: string;
  samples: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  tokens_per_sec: number;
  vram_delta_gb: number | null;
}

export interface ProbeStep {
  name: string;
  passed: boolean;
  detail: string | null;
  latency_ms: number | null;
}

export interface CapabilityProbeResult {
  capability: string;
  declared_strength: number;
  state: "declared" | "verified" | "unverified" | "failed";
  latency_ms: number | null;
  detail: string | null;
}

export interface ProbeReport {
  runtime_id: string;
  runtime_model_id: string;
  runtime_reachable: boolean;
  model_present: boolean;
  steps: ProbeStep[];
  capabilities: CapabilityProbeResult[];
  /** Derived client-side: every step passed. */
  ok?: boolean;
}

// vajra/registry/models.py: ResidencyEntry / ResidencyReport
export interface ResidencyEntry {
  model_id: string | null;
  runtime_model_id: string;
  runtime_id: string;
  vram_gb: number | null;
  expires_at: string | null;
}

export interface ResidencyReport {
  entries: ResidencyEntry[];
  unsupported_runtimes: string[];
  unreachable_runtimes: string[];
}

// vajra/registry/models.py: RuntimeRead
export interface RuntimeRead {
  id: string;
  kind: "ollama" | "vllm" | "openai_compatible";
  base_url: string;
  enabled: boolean;
  health: HealthState;
  health_detail: string | null;
  version: string | null;
  last_probe_at: string | null;
}

// vajra/runtimes/base.py: RuntimeModelInfo
export interface RuntimeModelInfo {
  id: string;
  size_bytes: number | null;
  digest: string | null;
  family: string | null;
  parameter_size: string | null;
  quantization: string | null;
  modified_at: string | null;
}

// --- Routing ---------------------------------------------------------

export interface SimulateAttachment {
  filename: string;
  mime: string;
  size_bytes: number;
  page_count?: number;
  scanned_page_count?: number;
  extracted_chars?: number;
}

export interface SimulateRequest {
  prompt: string;
  attachments?: SimulateAttachment[];
  weights?: ScoringWeights;
  task_labels?: Record<string, string>;
}

export interface ScoringWeights {
  capability: number;
  preferred: number;
  context: number;
  latency: number;
  priority: number;
  residency: number;
  reliability: number;
}

export interface ScoreTerm {
  name: string;
  value: number;
  weight: number;
  contribution?: number;
}

export interface CandidateScore {
  model_id: string;
  total: number;
  terms: ScoreTerm[];
  resident: boolean;
  policy_bonus: number;
}

export interface RejectedModel {
  model_id: string;
  reason: string;
  detail: string;
}

export interface RoutingDecision {
  task_id: string;
  selected: string;
  score: number;
  rationale: string;
  candidates: CandidateScore[];
  rejected: RejectedModel[];
  fallbacks: string[];
  policy_applied: string | null;
  weights: ScoringWeights;
  decided_in_ms: number;
}

export interface TaskFeatures {
  has_image_input: boolean;
  has_scanned_pages: boolean;
  has_tabular_input: boolean;
  has_code_input: boolean;
  estimated_input_tokens: number;
  attachment_types: string[];
  requires_file_output: boolean;
}

export interface TaskSpec {
  task_id: string;
  prompt: string;
  intent: string;
  domain: string | null;
  complexity: "low" | "medium" | "high";
  required_caps: string[];
  preferred_caps: string[];
  features: TaskFeatures;
  latency_budget_ms: number;
  classifier: string;
}

export interface SimulateResponse {
  task: TaskSpec;
  decision: RoutingDecision;
}

export interface PolicyRead {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  graph: Record<string, unknown>;
  rules: Record<string, unknown>[];
  weights: Record<string, number>;
}

// --- Runs --------------------------------------------------------------

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ExecutionMode = "demo" | "agent";
export type StepStatus = "waiting" | "running" | "completed" | "failed" | "skipped";
export type AttachmentKind = "auto" | "image" | "document";

export interface RunAttachment {
  filename: string;
  mime?: string;
  size_bytes?: number;
  data_base64?: string | null;
  document_id?: string | null;
  sha256?: string | null;
  kind?: AttachmentKind;
  page_count?: number | null;
  scanned_page_count?: number | null;
  extracted_chars?: number | null;
}

export interface RunCreateRequest {
  prompt: string;
  project_id?: string | null;
  agent_id?: string | null;
  conversation_id?: string | null;
  attachments?: RunAttachment[];
  /** @deprecated ignored whenever conversation_id is set */
  history?: Record<string, unknown>[];
  execution_mode?: ExecutionMode;
}

export interface RunCreated {
  run_id: string;
  status: RunStatus;
  execution_mode: ExecutionMode;
  events_url: string;
  conversation_id?: string | null;
  user_message_id?: string | null;
  assistant_message_id?: string | null;
}

export interface RunRead {
  id: string;
  prompt: string;
  status: RunStatus;
  execution_mode: ExecutionMode;
  project_id: string | null;
  agent_id: string | null;
  task_spec: Record<string, unknown>;
  budget: Record<string, unknown>;
  models_used: string[];
  attachments: Record<string, unknown>[];
  total_tokens: number;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface RunListPage {
  items: RunRead[];
  total: number;
  limit: number;
  offset: number;
}

export interface RunStep {
  id: string;
  ordinal: number;
  node_id: string;
  kind: string;
  status: StepStatus;
  routing_decision: Record<string, unknown>;
  started_at: string | null;
  duration_ms: number | null;
}

// --- Conversations -------------------------------------------------------

export type MessageStatus = "pending" | "streaming" | "complete" | "failed" | "cancelled";

export interface MessageCitation {
  marker: string;
  chunk_id: string;
  document_id: string;
  doc_title?: string | null;
  section_path?: string | null;
  page_from?: number | null;
  page_to?: number | null;
  score?: number | null;
}

export interface MessageRead {
  id: string;
  conversation_id: string;
  ordinal: number;
  role: string;
  content: string;
  status: MessageStatus;
  run_id: string | null;
  model_id: string | null;
  runtime_model_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  tokens_per_sec: number | null;
  duration_ms: number | null;
  citations: MessageCitation[];
  attachments: Record<string, unknown>[];
  error: string | null;
  created_at: string;
}

export interface ConversationRead {
  id: string;
  user_id?: string | null;
  username?: string | null;
  project_id: string | null;
  title: string;
  pinned: boolean;
  archived: boolean;
  message_count: number;
  total_tokens: number;
  last_model_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends ConversationRead {
  messages: MessageRead[];
  has_more: boolean;
}

export interface ConversationListPage {
  items: ConversationRead[];
  total: number;
  limit: number;
  offset: number;
}

// --- Events (SSE) --------------------------------------------------------

export type WireEventType =
  | "RUN_CREATED"
  | "NODE_ENTERED"
  | "NODE_COMPLETED"
  | "NODE_FAILED"
  | "DOCUMENT_INGESTED"
  | "PAGE_CLASSIFIED"
  | "ATTACHMENT_SKIPPED"
  | "VISION_ANALYSIS_STARTED"
  | "VISION_ANALYSIS_COMPLETED"
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
  | "VERIFICATION_FAILED"
  | "FILE_CREATED"
  | "RUN_COMPLETED"
  | "RUN_FAILED"
  | "RUN_CANCELLED"
  | "EGRESS_ATTEMPT"
  | "EGRESS_BLOCKED"
  | "PROMPT_ENHANCED"
  | "EXTRACTION_COMPLETED"
  | "MULTIMODAL_FALLBACK";

export interface WireEvent {
  id: string;
  seq: number;
  stream: string;
  run_id: string | null;
  ts: string;
  type: WireEventType;
  node_id?: string | null;
  payload: Record<string, any>;
  duration_ms?: number | null;
}

// --- Knowledge -------------------------------------------------------

export type DocumentStatus =
  | "pending"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexed"
  | "failed"
  | "skipped";

export interface DocumentRead {
  id: string;
  project_id: string | null;
  filename: string;
  sha256: string;
  mime: string;
  size_bytes: number;
  page_count: number | null;
  scanned_page_count: number | null;
  status: DocumentStatus;
  parser: string | null;
  ingested_at: string | null;
  error: string | null;
  created_at: string;
}

export interface ChunkRead {
  id: string;
  document_id: string;
  ordinal: number;
  text: string;
  section_path: string | null;
  page_from: number | null;
  page_to: number | null;
  token_count: number;
}

export interface SearchChunkResult {
  marker: string;
  label: string;
  chunk_id: string;
  document_id: string;
  text: string;
  page_from: number | null;
  page_to: number | null;
  section_path: string | null;
  doc_title: string | null;
  score: number | null;
}

export interface KnowledgeSearchResponse {
  query: string;
  chunks: SearchChunkResult[];
  reranked: boolean;
  timings: {
    embed_ms: number | null;
    retrieve_ms: number | null;
    rerank_ms: number | null;
    total_ms: number | null;
  };
}

// --- Network / sovereignty (vajra/sentinel/*) -----------------------

export interface ConnectionRow {
  pid: number | null;
  process: string | null;
  laddr: string | null;
  raddr: string | null;
  status: string | null;
  classification: "local" | "internal" | "external";
}

export interface ConnectionSnapshot {
  ts: string;
  available: boolean;
  detail: string;
  rows: ConnectionRow[];
  local: number | null;
  internal: number | null;
  external: number | null;
}

export interface NftCounter {
  available: boolean;
  detail?: string | null;
  packets: number | null;
  bytes: number | null;
}

export interface NetworkSnapshot {
  ts: string;
  connections: ConnectionSnapshot;
  nft_counter: NftCounter;
  app_blocked_total: number;
  external_connections: number | null;
  internal_connections: number | null;
  local_connections: number | null;
  services: Record<string, string>;
}

export interface NetworkEvent {
  id: string;
  ts: string;
  direction: string;
  src: string | null;
  dst_ip: string | null;
  dst_host: string | null;
  dst_port: number | null;
  proto: string | null;
  process: string | null;
  verdict: "allow" | "block";
  layer: "app" | "docker" | "nft" | "connection_audit";
  raw_log: string | null;
  stack_frame: string | null;
}

export interface SelfAuditAssertion {
  name: string;
  outcome: "pass" | "fail" | "skipped";
  detail: string;
}

export interface SelfAuditResult {
  ts: string;
  profile: string;
  assertions: SelfAuditAssertion[];
  passed: boolean;
}

export interface NftStatus {
  available: boolean;
  detail: string;
  platform: string;
  table: string;
}

export interface NftRuleset {
  available: boolean;
  detail: string;
  text: string | null;
}

// --- Tools / sandbox --------------------------------------------------

export interface ToolListing {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns: Record<string, unknown>;
  side_effects: "none" | "filesystem" | "compute";
  requires_confirmation: boolean;
  implemented: boolean;
  invocation_count: number;
  avg_duration_ms: number | null;
}

export interface ToolTestResult {
  ok: boolean;
  output: Record<string, unknown>;
  error: string | null;
  error_code: string | null;
  duration_ms: number;
}

export interface SandboxPolicy {
  image: string;
  limits: {
    mem_limit: string;
    memswap_limit: string;
    cpu_cores: number;
    pids_limit: number;
    wall_clock_timeout_s: number;
    output_truncate_bytes: number;
  };
  filesystem: {
    read_only_rootfs: boolean;
    tmpfs_mounts: Record<string, string>;
    work_dir: string;
    work_dir_writable: boolean;
    allowed_input_files: string[];
  };
  network: {
    network_disabled: boolean;
    network_mode: string;
  };
  security: {
    user: string;
    cap_drop: string[];
    no_new_privileges: boolean;
    seccomp_profile_path: string | null;
  };
}

export interface SandboxStatus {
  available: boolean;
  detail: string;
  image: string;
  image_present: boolean | null;
  policy: SandboxPolicy;
}

export interface GuardFinding {
  rule: string;
  symbol: string;
  line: number;
  detail: string;
}

export interface GuardResponse {
  accepted: boolean;
  findings: GuardFinding[];
}

// --- Audit --------------------------------------------------------

export interface AuditEvent {
  id: string;
  seq: number;
  stream: string;
  run_id?: string | null;
  ts: string;
  type: WireEventType;
  node_id?: string | null;
  payload: Record<string, any>;
  duration_ms?: number | null;
}

export interface AuditEventPage {
  items: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

// vajra/api/analytics.py: AnalyticsSummary
export type AnalyticsWindow = "24h" | "7d" | "30d" | "all";

export interface AnalyticsSummary {
  window: AnalyticsWindow;
  since: string | null;
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  cancelled_runs: number;
  in_progress_runs: number;
  p50_duration_ms: number | null;
  p95_duration_ms: number | null;
  total_tokens: number;
  tokens_measured_runs: number;
  model_usage: Record<string, number>;
  retrieval_grounded_count: number;
  retrieval_total_count: number;
  egress_blocked_count: number;
  egress_allowed_count: number;
}

// vajra/api/knowledge.py: GraphNode / GraphEdge / KnowledgeGraphResponse.
// A real heuristic co-occurrence graph over ingested documents -- see the
// endpoint's `method` field, always rendered so the graph is never mistaken
// for verified entity extraction.
export interface GraphEntity {
  id: string;
  label: string;
  kind: "document" | "term";
  weight: number;
  x?: number;
  y?: number;
}

export interface GraphRelationship {
  id: string;
  source: string;
  target: string;
  weight: number;
}

export interface KnowledgeGraphResponse {
  nodes: GraphEntity[];
  edges: GraphRelationship[];
  documents_indexed: number;
  method: string;
}

// The workflow builder renders these from local/derived data; there is no
// backend workflow engine or persistence for them yet.

export interface WorkflowNode {
  id: string;
  label: string;
  type: string;
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

// --- Auth & User Management --------------------------------------------------

export type UserRole = 'admin' | 'user';

export interface UserRead {
  id: string;
  username: string;
  role: UserRole;
  display_name?: string | null;
  enabled: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login_at?: string | null;
}

export interface SessionRead {
  id: string;
  user_id: string;
  username?: string | null;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked: boolean;
}

export interface LoginResponse {
  user: UserRead;
  token: string;
}

export interface CreateUserResponse {
  user: UserRead;
  temporary_password: string;
}

export interface ResetPasswordResponse {
  user: UserRead;
  temporary_password: string;
}

