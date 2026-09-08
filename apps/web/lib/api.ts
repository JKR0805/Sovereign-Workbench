// Typed client for the VAJRA backend. No mock fallback: a failed request
// throws ApiError and the caller renders a real error state. The backend is
// the only source of truth for whether something worked.

import type {
  AnalyticsSummary,
  AnalyticsWindow,
  AuditEventPage,
  BenchmarkResult,
  ChunkRead,
  ConversationDetail,
  ConversationListPage,
  ConversationRead,
  CreateUserResponse,
  DocumentRead,
  ExecutionMode,
  GuardResponse,
  KnowledgeGraphResponse,
  KnowledgeSearchResponse,
  LoginResponse,
  MessageRead,
  ModelRead,
  ModelRegistration,
  ModelUpdate,
  NetworkEvent,
  NetworkSnapshot,
  NftRuleset,
  NftStatus,
  PolicyRead,
  ProbeReport,
  ResidencyReport,
  ResetPasswordResponse,
  RunAttachment,
  RunCreated,
  RunListPage,
  RunRead,
  RunStep,
  RuntimeHealth,
  RuntimeModelInfo,
  RuntimeRead,
  RuntimeRegistration,
  SandboxPolicy,
  SandboxStatus,
  ScoringWeights,
  SelfAuditResult,
  SessionRead,
  SimulateResponse,
  SystemHealth,
  ToolListing,
  ToolTestResult,
  UserRead,
  UserRole,
  WireEvent,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/** All wire event types the backend can emit, kept in sync with
 * `vajra/events/types.py::EventType`. Used to attach one SSE listener per
 * named event rather than relying on `onmessage`, which never fires for a
 * named `event:` frame. */
const ALL_WIRE_EVENT_TYPES = [
  'RUN_CREATED',
  'RUN_COMPLETED',
  'RUN_FAILED',
  'RUN_CANCELLED',
  'NODE_ENTERED',
  'NODE_COMPLETED',
  'NODE_FAILED',
  'DOCUMENT_INGESTED',
  'PAGE_CLASSIFIED',
  'ATTACHMENT_SKIPPED',
  'VISION_ANALYSIS_STARTED',
  'VISION_ANALYSIS_COMPLETED',
  'TASK_CLASSIFIED',
  'MODEL_CANDIDATES',
  'MODEL_SELECTED',
  'MODEL_LOADING',
  'MODEL_READY',
  'LLM_TOKEN',
  'RAG_QUERY',
  'RAG_RESULTS',
  'TOOL_CALLED',
  'TOOL_RESULT',
  'SANDBOX_STARTED',
  'SANDBOX_COMPLETED',
  'VERIFICATION_PASSED',
  'VERIFICATION_FAILED',
  'FILE_CREATED',
  'EGRESS_ATTEMPT',
  'EGRESS_BLOCKED',
] as const;

/** Thrown by every failed request. Carries the backend's RFC 7807 problem
 * fields when the response had a JSON body, so a caller can branch on
 * `error.code` (e.g. "no_candidate_models") instead of parsing prose. */
export class ApiError extends Error {
  status: number;
  code?: string;
  context?: Record<string, unknown>;

  constructor(status: number, detail: string, code?: string, context?: Record<string, unknown>) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.context = context;
  }

  /** True for a request that never reached the server at all (backend down,
   * DNS failure, CORS). Distinguishing this from a real 4xx/5xx matters: one
   * means "the server said no", the other means "there is no server". */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      credentials: 'include',
      ...options,
      headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
    });
  } catch (err) {
    throw new ApiError(
      0,
      `Could not reach the backend at ${BASE_URL}${endpoint}. Is the API running?`,
      'network_error'
    );
  }

  if (!res.ok) {
    let detail = res.statusText || `Request failed with status ${res.status}`;
    let code: string | undefined;
    let context: Record<string, unknown> | undefined;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
      code = body?.code;
      context = body?.context;
    } catch {
      // Non-JSON error body (e.g. a plain-text 503); keep the status text.
    }
    throw new ApiError(res.status, detail, code, context);
  }

  if (res.status === 204) return undefined as unknown as T;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  // ==========================================
  // 0. Analytics
  // ==========================================
  async getAnalyticsSummary(window: AnalyticsWindow = '7d'): Promise<AnalyticsSummary> {
    return apiFetch(`/analytics/summary?window=${window}`);
  },

  // ==========================================
  // 1. System & Health
  // ==========================================
  async getSystemHealth(): Promise<SystemHealth> {
    return apiFetch('/system/health');
  },

  async ping(): Promise<{ status: string; version: string }> {
    return apiFetch('/system/ping');
  },

  // ==========================================
  // 2. Models & Hardware Registry
  // ==========================================
  async getModels(params?: { capability?: string; enabled_only?: boolean }): Promise<ModelRead[]> {
    const query = new URLSearchParams();
    if (params?.capability) query.set('capability', params.capability);
    if (params?.enabled_only) query.set('enabled_only', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`/models${qs}`);
  },

  async getModel(id: string): Promise<ModelRead> {
    return apiFetch(`/models/${encodeURIComponent(id)}`);
  },

  async registerModel(registration: ModelRegistration, probe = true): Promise<ModelRead> {
    return apiFetch(`/models?probe=${probe}`, {
      method: 'POST',
      body: JSON.stringify(registration),
    });
  },

  async updateModel(id: string, update: ModelUpdate): Promise<ModelRead> {
    return apiFetch(`/models/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  },

  async deleteModel(id: string): Promise<void> {
    return apiFetch(`/models/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async probeModel(runtime_id: string, runtime_model_id: string): Promise<ProbeReport> {
    const report = await apiFetch<ProbeReport>('/models/probe', {
      method: 'POST',
      body: JSON.stringify({ runtime_id, runtime_model_id }),
    });
    return { ...report, ok: report.runtime_reachable && report.model_present };
  },

  async getModelResidency(): Promise<ResidencyReport> {
    return apiFetch('/models/residency');
  },

  async loadModel(id: string): Promise<void> {
    return apiFetch(`/models/${encodeURIComponent(id)}/load`, { method: 'POST' });
  },

  async unloadModel(id: string): Promise<void> {
    return apiFetch(`/models/${encodeURIComponent(id)}/unload`, { method: 'POST' });
  },

  async refreshModel(id: string): Promise<ModelRead> {
    return apiFetch(`/models/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
  },

  async benchmarkModel(id: string): Promise<BenchmarkResult> {
    return apiFetch(`/models/${encodeURIComponent(id)}/benchmark`, { method: 'POST' });
  },

  async chat(
    modelId: string,
    messages: { role: string; content: string; images?: string[] }[],
    options?: { temperature?: number }
  ): Promise<{
    model_id: string;
    runtime_model_id: string;
    reply: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    tokens_measured: boolean;
    duration_ms: number;
  }> {
    return apiFetch(`/models/${encodeURIComponent(modelId)}/chat`, {
      method: 'POST',
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.7,
        stream: false,
      }),
    });
  },

  // ==========================================
  // 3. Runtimes
  // ==========================================
  async getRuntimes(): Promise<RuntimeRead[]> {
    return apiFetch('/runtimes');
  },

  async getRuntime(id: string): Promise<RuntimeRead> {
    return apiFetch(`/runtimes/${encodeURIComponent(id)}`);
  },

  async registerRuntime(registration: RuntimeRegistration): Promise<RuntimeRead> {
    return apiFetch('/runtimes', { method: 'POST', body: JSON.stringify(registration) });
  },

  async getAvailableRuntimeModels(runtimeId: string): Promise<RuntimeModelInfo[]> {
    return apiFetch(`/runtimes/${encodeURIComponent(runtimeId)}/available`);
  },

  async probeRuntime(runtimeId: string): Promise<RuntimeHealth> {
    return apiFetch(`/runtimes/${encodeURIComponent(runtimeId)}/probe`, { method: 'POST' });
  },

  // ==========================================
  // 4. Routing
  // ==========================================
  async simulateRouting(request: {
    prompt: string;
    attachments?: unknown[];
    weights?: ScoringWeights;
    task_labels?: Record<string, string>;
  }): Promise<SimulateResponse> {
    return apiFetch('/routing/simulate', { method: 'POST', body: JSON.stringify(request) });
  },

  async getRoutingPolicies(): Promise<PolicyRead[]> {
    return apiFetch('/routing/policies');
  },

  async getRoutingPolicy(id: string): Promise<PolicyRead> {
    return apiFetch(`/routing/policies/${encodeURIComponent(id)}`);
  },

  async saveRoutingPolicy(
    id: string,
    policy: {
      name: string;
      enabled?: boolean;
      priority?: number;
      graph?: Record<string, unknown>;
      rules?: Record<string, unknown>[];
      weights?: Record<string, number>;
    }
  ): Promise<PolicyRead> {
    return apiFetch(`/routing/policies/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(policy),
    });
  },

  async getRoutingCapabilities(): Promise<string[]> {
    return apiFetch('/routing/capabilities');
  },

  // ==========================================
  // 5. Runs
  // ==========================================
  async getRuns(params?: { status?: string; limit?: number; offset?: number }): Promise<RunListPage> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`/runs${qs}`);
  },

  async getRun(runId: string): Promise<RunRead> {
    return apiFetch(`/runs/${encodeURIComponent(runId)}`);
  },

  async getRunSteps(runId: string): Promise<RunStep[]> {
    return apiFetch(`/runs/${encodeURIComponent(runId)}/steps`);
  },

  async getRunArtifacts(runId: string): Promise<Record<string, unknown>[]> {
    return apiFetch(`/runs/${encodeURIComponent(runId)}/artifacts`);
  },

  async createRun(
    prompt: string,
    attachments: RunAttachment[] = [],
    executionMode: ExecutionMode = 'agent',
    opts?: { conversationId?: string; projectId?: string }
  ): Promise<RunCreated> {
    const body: Record<string, unknown> = {
      prompt,
      attachments,
      execution_mode: executionMode,
    };
    if (opts?.conversationId) body.conversation_id = opts.conversationId;
    if (opts?.projectId) body.project_id = opts.projectId;
    return apiFetch('/runs', { method: 'POST', body: JSON.stringify(body) });
  },

  async cancelRun(runId: string): Promise<RunRead> {
    return apiFetch(`/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
  },

  // ==========================================
  // 6. Conversations
  // ==========================================
  async listConversations(params?: {
    userId?: string;
    projectId?: string;
    archived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ConversationListPage> {
    const query = new URLSearchParams();
    if (params?.userId) query.set('user_id', params.userId);
    if (params?.projectId) query.set('project_id', params.projectId);
    if (params?.archived !== undefined) query.set('archived', String(params.archived));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`/conversations${qs}`);
  },

  async getConversations(params?: {
    userId?: string;
    projectId?: string;
    archived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ConversationListPage> {
    return this.listConversations(params);
  },

  async createConversation(opts?: string | { title?: string; project_id?: string }): Promise<ConversationRead> {
    const payload = typeof opts === 'string' ? { title: opts } : opts || {};
    return apiFetch('/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getConversation(id: string): Promise<ConversationDetail> {
    return apiFetch(`/conversations/${encodeURIComponent(id)}`);
  },

  async listConversationMessages(id: string): Promise<MessageRead[]> {
    return apiFetch(`/conversations/${encodeURIComponent(id)}/messages`);
  },

  async renameConversation(id: string, title: string): Promise<ConversationRead> {
    return apiFetch(`/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },

  async setConversationPinned(id: string, pinned: boolean): Promise<ConversationRead> {
    return apiFetch(`/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned }),
    });
  },

  async setConversationArchived(id: string, archived: boolean): Promise<ConversationRead> {
    return apiFetch(`/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    });
  },

  async deleteConversation(id: string): Promise<void> {
    return apiFetch(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ==========================================
  // 7. Real-Time Server-Sent Events (SSE)
  // ==========================================

  /** Subscribes to a run's event stream. Attaches one listener per named
   * event type (a browser `EventSource`'s `onmessage` never fires for a
   * named `event:` frame, which is what every frame here is) plus the
   * server's `lagged` control frame, so a slow consumer is told to
   * reconcile from `GET /api/runs/{id}/steps` rather than silently missing
   * events. Returns an unsubscribe function. */
  subscribeToRunEvents(
    runId: string,
    onEvent: (event: WireEvent) => void,
    onError?: (err: unknown) => void,
    options?: { since?: number; onLagged?: (info: { since: number; dropped: number }) => void }
  ): () => void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return () => {};
    }

    const query = options?.since ? `?since=${options.since}` : '';
    let es: EventSource;
    try {
      es = new EventSource(`${BASE_URL}/runs/${encodeURIComponent(runId)}/events${query}`);
    } catch (err) {
      onError?.(err);
      return () => {};
    }

    const handleMessage = (e: MessageEvent) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch (err) {
        console.error('Failed to parse SSE event data', err);
      }
    };
    const handleLagged = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        options?.onLagged?.(payload);
      } catch {
        options?.onLagged?.({ since: 0, dropped: 0 });
      }
    };

    ALL_WIRE_EVENT_TYPES.forEach((type) => {
      es.addEventListener(type, handleMessage as EventListener);
    });
    es.addEventListener('lagged', handleLagged as EventListener);

    es.onerror = (err) => {
      if (es.readyState === EventSource.CLOSED) return;
      onError?.(err);
    };

    return () => {
      ALL_WIRE_EVENT_TYPES.forEach((type) => {
        es.removeEventListener(type, handleMessage as EventListener);
      });
      es.removeEventListener('lagged', handleLagged as EventListener);
      es.close();
    };
  },

  subscribeToNetworkEvents(
    onEvent: (event: NetworkEvent) => void,
    onError?: (err: unknown) => void
  ): () => void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return () => {};
    }
    let es: EventSource;
    try {
      es = new EventSource(`${BASE_URL}/network/events/stream`);
    } catch (err) {
      onError?.(err);
      return () => {};
    }

    const handleMessage = (e: MessageEvent) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch (err) {
        console.error('Failed to parse network SSE event data', err);
      }
    };
    es.addEventListener('EGRESS_ATTEMPT', handleMessage as EventListener);
    es.addEventListener('EGRESS_BLOCKED', handleMessage as EventListener);
    es.onerror = (err) => {
      if (es.readyState === EventSource.CLOSED) return;
      onError?.(err);
    };
    return () => es.close();
  },

  // ==========================================
  // 8. Knowledge & RAG
  // ==========================================
  async getDocuments(projectId?: string): Promise<DocumentRead[]> {
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    return apiFetch(`/knowledge/documents${qs}`);
  },

  async getDocument(id: string): Promise<DocumentRead> {
    return apiFetch(`/knowledge/documents/${encodeURIComponent(id)}`);
  },

  async uploadDocument(file: File, projectId?: string): Promise<DocumentRead> {
    const formData = new FormData();
    formData.append('file', file);
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    return apiFetch(`/knowledge/documents${qs}`, { method: 'POST', body: formData });
  },

  async deleteDocument(id: string): Promise<void> {
    return apiFetch(`/knowledge/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getDocumentChunks(documentId: string): Promise<ChunkRead[]> {
    return apiFetch(`/knowledge/documents/${encodeURIComponent(documentId)}/chunks`);
  },

  async getKnowledgeGraph(limitDocuments = 50): Promise<KnowledgeGraphResponse> {
    return apiFetch(`/knowledge/graph?limit_documents=${limitDocuments}`);
  },

  async searchKnowledge(
    query: string,
    options?: { top_k?: number; document_ids?: string[]; rerank?: boolean }
  ): Promise<KnowledgeSearchResponse> {
    return apiFetch('/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        top_k: options?.top_k ?? 5,
        document_ids: options?.document_ids ?? [],
        rerank: options?.rerank ?? true,
      }),
    });
  },

  // ==========================================
  // 9. Network / Sovereignty
  // ==========================================
  async getNetworkSnapshot(): Promise<NetworkSnapshot> {
    return apiFetch('/network/snapshot');
  },

  async getNetworkEvents(limit = 100): Promise<NetworkEvent[]> {
    return apiFetch(`/network/events?limit=${limit}`);
  },

  async triggerEgressProbe(): Promise<{
    target: string;
    blocked: boolean;
    layer: string | null;
    detail: string;
    caller: string | null;
  }> {
    return apiFetch('/network/probe', { method: 'POST' });
  },

  /** Returns the raw ruleset text plus availability -- the endpoint is a
   * plain-text body (200) or a 503 with an explanatory plain-text body,
   * never JSON, so this wraps both into one shape for callers. */
  async getNetworkRuleset(): Promise<NftRuleset> {
    const res = await fetch(`${BASE_URL}/network/ruleset`);
    const text = await res.text();
    if (!res.ok) return { available: false, detail: text, text: null };
    return { available: true, detail: 'reachable', text };
  },

  async getNftStatus(): Promise<NftStatus> {
    return apiFetch('/network/nft/status');
  },

  async getNetworkSelfAudit(refresh = false): Promise<SelfAuditResult> {
    return apiFetch(`/network/selfaudit${refresh ? '?refresh=true' : ''}`);
  },

  // ==========================================
  // 10. Tools & Sandbox
  // ==========================================
  async getTools(): Promise<ToolListing[]> {
    return apiFetch('/tools');
  },

  async getTool(name: string): Promise<ToolListing> {
    return apiFetch(`/tools/${encodeURIComponent(name)}`);
  },

  async testTool(name: string, args: Record<string, unknown> = {}): Promise<ToolTestResult> {
    return apiFetch(`/tools/${encodeURIComponent(name)}/test`, {
      method: 'POST',
      body: JSON.stringify({ arguments: args }),
    });
  },

  async getSandboxStatus(): Promise<SandboxStatus> {
    return apiFetch('/sandbox/status');
  },

  async getSandboxPolicy(): Promise<SandboxPolicy> {
    return apiFetch('/sandbox/policy');
  },

  async scanAstGuard(code: string): Promise<GuardResponse> {
    return apiFetch('/sandbox/guard', { method: 'POST', body: JSON.stringify({ code }) });
  },

  // ==========================================
  // 11. Audit
  // ==========================================
  async getAuditLogs(params?: {
    run_id?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEventPage> {
    const query = new URLSearchParams();
    if (params?.run_id) query.set('run_id', params.run_id);
    if (params?.type) query.set('type', params.type);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`/audit/events${qs}`);
  },

  async getAuditEventTypes(): Promise<string[]> {
    return apiFetch('/audit/event-types');
  },

  /** Currently always raises 501 server-side (Ed25519-signed export is not
   * implemented). Callers must show that honestly, not synthesize a
   * download -- see the ApiError this throws. */
  async exportAuditManifest(runId?: string): Promise<Record<string, unknown>> {
    const qs = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
    return apiFetch(`/audit/export${qs}`);
  },

  // ==========================================
  // 12. Authentication
  // ==========================================
  async login(username: string, password: string, rememberMe = true): Promise<LoginResponse> {
    return apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, remember_me: rememberMe }),
    });
  },

  async logout(): Promise<{ ok: boolean }> {
    return apiFetch('/auth/logout', { method: 'POST' });
  },

  async getCurrentUser(): Promise<UserRead> {
    return apiFetch('/auth/me');
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<UserRead> {
    return apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
  },

  // ==========================================
  // 13. Admin Oversight & Management
  // ==========================================
  async adminListUsers(limit = 100, offset = 0): Promise<UserRead[]> {
    return apiFetch(`/admin/users?limit=${limit}&offset=${offset}`);
  },

  async adminCreateUser(data: {
    username: string;
    role?: UserRole;
    display_name?: string;
    password?: string;
  }): Promise<CreateUserResponse> {
    return apiFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async adminUpdateUser(
    userId: string,
    data: { display_name?: string; role?: UserRole; enabled?: boolean }
  ): Promise<UserRead> {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async adminResetPassword(userId: string): Promise<ResetPasswordResponse> {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
    });
  },

  async adminListSessions(): Promise<SessionRead[]> {
    return apiFetch('/admin/sessions');
  },
};
