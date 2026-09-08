import {
  ModelRead,
  SystemHealth,
  NetworkSnapshot,
  SimulateRequest,
  SimulateResponse,
  DocumentRead,
  ChunkRead,
  KnowledgeSearchResponse,
  ToolSpecification,
  RunRead,
  RunStep,
  RunArtifact,
  WireEvent,
  ProbeEgressResult,
  ModelProbeResult,
  AstGuardResult,
  AuditRecord,
  ResidencyState,
  RuntimeRead,
  RoutingPolicy,
  SandboxPolicy,
  SelfAuditResult,
  NetworkRulesetResponse,
  ToolTestResult
} from './types';

import {
  MOCK_MODELS,
  MOCK_DOCUMENTS,
  MOCK_CHUNKS,
  MOCK_SYSTEM_HEALTH,
  MOCK_NETWORK_SNAPSHOT,
  MOCK_TOOLS,
  MOCK_RUN,
  MOCK_RUN_STEPS,
  MOCK_RUN_ARTIFACTS,
  MOCK_TIMELINE_EVENTS,
  MOCK_AUDIT_LOGS,
  MOCK_RUNTIMES,
  MOCK_RESIDENCY,
  MOCK_ROUTING_POLICIES,
  MOCK_RULESET,
  MOCK_SELF_AUDIT,
  MOCK_SANDBOX_POLICY,
  MOCK_AUDIT_EVENT_TYPES
} from './mockData';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// In-memory mock state during session for mutations
let sessionModels: ModelRead[] = [...MOCK_MODELS];
let sessionDocuments: DocumentRead[] = [...MOCK_DOCUMENTS];
let sessionRuntimes: RuntimeRead[] = [...MOCK_RUNTIMES];
let sessionRoutingPolicies: RoutingPolicy[] = [...MOCK_ROUTING_POLICIES];
let sessionBlocksCount = 4;
let sessionEgressDrops = 4;

import { useState, useEffect } from 'react';

// Mock status tracking across API domains
export type ApiDomain =
  | 'system'
  | 'models'
  | 'runtimes'
  | 'routing'
  | 'runs'
  | 'knowledge'
  | 'network'
  | 'tools'
  | 'audit'
  | 'workflows'
  | 'global';

const mockStatusStore: Record<ApiDomain, boolean> = {
  system: false,
  models: false,
  runtimes: false,
  routing: false,
  runs: false,
  knowledge: false,
  network: false,
  tools: false,
  audit: false,
  workflows: true, // Default template until deployed/saved
  global: false,
};

const mockListeners = new Set<() => void>();

export function getMockStatus(domain: ApiDomain = 'global'): boolean {
  return mockStatusStore[domain] ?? mockStatusStore.global;
}

export function subscribeMockStatus(cb: () => void): () => void {
  mockListeners.add(cb);
  return () => {
    mockListeners.delete(cb);
  };
}

export function setDomainMockStatus(domain: ApiDomain, isMock: boolean) {
  if (mockStatusStore[domain] !== isMock) {
    mockStatusStore[domain] = isMock;
    if (isMock) {
      mockStatusStore.global = true;
    }
    mockListeners.forEach((fn) => fn());
  }
}

export function useIsMock(domain: ApiDomain = 'global'): boolean {
  const [isMock, setIsMock] = useState<boolean>(() => getMockStatus(domain));

  useEffect(() => {
    setIsMock(getMockStatus(domain));
    const unsubscribe = subscribeMockStatus(() => {
      setIsMock(getMockStatus(domain));
    });
    return unsubscribe;
  }, [domain]);

  return isMock;
}

function resolveDomainFromEndpoint(endpoint: string): ApiDomain {
  if (endpoint.includes('/system')) return 'system';
  if (endpoint.includes('/models')) return 'models';
  if (endpoint.includes('/runtimes')) return 'runtimes';
  if (endpoint.includes('/routing')) return 'routing';
  if (endpoint.includes('/runs')) return 'runs';
  if (endpoint.includes('/knowledge')) return 'knowledge';
  if (endpoint.includes('/network')) return 'network';
  if (endpoint.includes('/tools') || endpoint.includes('/sandbox')) return 'tools';
  if (endpoint.includes('/audit')) return 'audit';
  return 'global';
}

async function fetchWithFallback<T>(
  endpoint: string,
  options?: RequestInit,
  fallbackFn?: () => T | Promise<T>
): Promise<T> {
  const domain = resolveDomainFromEndpoint(endpoint);
  try {
    const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
    const headers: Record<string, string> = {};
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...(options?.headers as Record<string, string>),
      },
    });

    if (!res.ok) {
      if (fallbackFn) {
        setDomainMockStatus(domain, true);
        return await fallbackFn();
      }
      const errorData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errorData.detail || `Request failed with status ${res.status}`);
    }

    setDomainMockStatus(domain, false);

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return (await res.text()) as unknown as T;
  } catch (err) {
    if (fallbackFn) {
      setDomainMockStatus(domain, true);
      return await fallbackFn();
    }
    throw err;
  }
}

export const api = {
  isMock: getMockStatus,
  useIsMock,
  // ==========================================
  // 1. System & Health
  // ==========================================
  async getSystemHealth(): Promise<SystemHealth> {
    return fetchWithFallback('/system/health', {}, () => MOCK_SYSTEM_HEALTH);
  },

  async ping(): Promise<{ status: string; version: string }> {
    return fetchWithFallback('/system/ping', {}, () => ({ status: "ok", version: "0.1.0" }));
  },

  // ==========================================
  // 2. Models & Hardware Registry
  // ==========================================
  async getModels(params?: { capability?: string; enabled_only?: boolean }): Promise<ModelRead[]> {
    const query = new URLSearchParams();
    if (params?.capability) query.set('capability', params.capability);
    if (params?.enabled_only) query.set('enabled_only', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';

    return fetchWithFallback(`/models${qs}`, {}, () => {
      let filtered = [...sessionModels];
      if (params?.capability) {
        filtered = filtered.filter(m => params.capability! in m.capabilities);
      }
      if (params?.enabled_only) {
        filtered = filtered.filter(m => m.enabled);
      }
      return filtered;
    });
  },

  async getModel(id: string): Promise<ModelRead> {
    return fetchWithFallback(`/models/${id}`, {}, () => {
      const found = sessionModels.find(m => m.id === id);
      if (!found) throw new Error(`Model ${id} not found`);
      return found;
    });
  },

  async registerModel(modelData: Partial<ModelRead>, probe: boolean = true): Promise<ModelRead> {
    return fetchWithFallback(
      `/models?probe=${probe}`,
      {
        method: 'POST',
        body: JSON.stringify(modelData),
      },
      () => {
        const newModel: ModelRead = {
          id: modelData.id || `model-${Date.now()}`,
          display_name: modelData.display_name || 'Custom Model',
          runtime_id: modelData.runtime_id || 'ollama-local',
          runtime_model_id: modelData.runtime_model_id || 'custom:latest',
          capabilities: modelData.capabilities || { text: 0.8 },
          context_window: modelData.context_window || 8192,
          num_ctx: modelData.num_ctx || 8192,
          vram_gb: modelData.vram_gb || 4.0,
          device: 'gpu',
          modalities_in: modelData.modalities_in || ['text'],
          priority: modelData.priority || 50,
          enabled: true,
          license: modelData.license || 'Open-Source',
          health: 'healthy',
          avg_latency_ms: 350.0,
          tokens_per_sec: 40.0,
          request_count: 0,
          error_count: 0,
          last_probe_at: new Date().toISOString(),
          is_resident: false,
        };
        sessionModels.push(newModel);
        return newModel;
      }
    );
  },

  async updateModel(id: string, modelData: Partial<ModelRead>): Promise<ModelRead> {
    return fetchWithFallback(
      `/models/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(modelData),
      },
      () => {
        sessionModels = sessionModels.map(m => m.id === id ? { ...m, ...modelData } : m);
        const updated = sessionModels.find(m => m.id === id);
        if (!updated) throw new Error(`Model ${id} not found`);
        return updated;
      }
    );
  },

  async deleteModel(id: string): Promise<void> {
    return fetchWithFallback(
      `/models/${id}`,
      { method: 'DELETE' },
      () => {
        sessionModels = sessionModels.filter(m => m.id !== id);
      }
    );
  },

  async probeModel(runtimeId: string, modelId: string): Promise<ModelProbeResult> {
    return fetchWithFallback(
      '/models/probe',
      {
        method: 'POST',
        body: JSON.stringify({ runtime_id: runtimeId, runtime_model_id: modelId }),
      },
      () => ({
        runtime_reachable: true,
        model_available: true,
        text_generation_ok: true,
        text_latency_ms: 380.2,
        vision_ok: modelId.includes('vl') || modelId.includes('vision') || modelId.includes('70b'),
        tool_calling_ok: true,
        vram_delta_mb: 5120.0,
        probed_at: new Date().toISOString(),
      })
    );
  },

  async refreshModel(id: string): Promise<ModelRead> {
    return fetchWithFallback(
      `/models/${id}/refresh`,
      { method: 'POST' },
      () => {
        const found = sessionModels.find(m => m.id === id);
        if (!found) throw new Error(`Model ${id} not found`);
        found.last_probe_at = new Date().toISOString();
        found.health = 'healthy';
        return { ...found };
      }
    );
  },

  async getModelResidency(): Promise<ResidencyState> {
    return fetchWithFallback(
      '/models/residency',
      {},
      () => ({
        ...MOCK_RESIDENCY,
        ts: new Date().toISOString()
      })
    );
  },

  async loadModel(id: string): Promise<void> {
    return fetchWithFallback(
      `/models/${id}/load`,
      { method: 'POST' },
      () => {
        sessionModels = sessionModels.map(m => ({
          ...m,
          is_resident: m.id === id,
        }));
      }
    );
  },

  async unloadModel(id: string): Promise<void> {
    return fetchWithFallback(
      `/models/${id}/unload`,
      { method: 'POST' },
      () => {
        sessionModels = sessionModels.map(m =>
          m.id === id ? { ...m, is_resident: false } : m
        );
      }
    );
  },

  // ==========================================
  // 3. Runtimes
  // ==========================================
  async getRuntimes(): Promise<RuntimeRead[]> {
    return fetchWithFallback('/runtimes', {}, () => sessionRuntimes);
  },

  async getRuntime(id: string): Promise<RuntimeRead> {
    return fetchWithFallback(`/runtimes/${id}`, {}, () => {
      const found = sessionRuntimes.find(r => r.id === id);
      if (!found) throw new Error(`Runtime ${id} not found`);
      return found;
    });
  },

  async registerRuntime(data: Partial<RuntimeRead>): Promise<RuntimeRead> {
    return fetchWithFallback(
      '/runtimes',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => {
        const newRuntime: RuntimeRead = {
          id: data.id || `runtime-${Date.now()}`,
          name: data.name || 'Custom Runtime',
          type: data.type || 'ollama',
          endpoint: data.endpoint || 'http://127.0.0.1:11434',
          is_local: true,
          status: 'healthy',
          version: '1.0.0',
          available_models_count: 1
        };
        sessionRuntimes.push(newRuntime);
        return newRuntime;
      }
    );
  },

  async getAvailableRuntimeModels(runtimeId: string): Promise<string[]> {
    return fetchWithFallback(
      `/runtimes/${runtimeId}/available`,
      {},
      () => ['qwen3:8b', 'qwen2.5-vl:3b', 'llama3.1:70b', 'deepseek-r1:14b']
    );
  },

  async probeRuntime(runtimeId: string): Promise<{ reachable: boolean; latency_ms: number }> {
    return fetchWithFallback(
      `/runtimes/${runtimeId}/probe`,
      { method: 'POST' },
      () => ({ reachable: true, latency_ms: 12.4 })
    );
  },

  // ==========================================
  // 4. Routing Engine & Studio
  // ==========================================
  async simulateRouting(req: SimulateRequest): Promise<SimulateResponse> {
    return fetchWithFallback(
      '/routing/simulate',
      {
        method: 'POST',
        body: JSON.stringify(req),
      },
      () => {
        const text = req.prompt.toLowerCase();
        const hasImage = req.attachments?.some(a => a.mime.startsWith('image') || (a.scanned_page_count || 0) > 0) || text.includes('scan') || text.includes('diagram') || text.includes('p&id') || text.includes('inspection');
        const hasCode = text.includes('code') || text.includes('csv') || text.includes('telemetry') || text.includes('script') || text.includes('function') || text.includes('python');

        let selected = "general-reasoning";
        let score = 91.2;
        let required_capabilities = ["text"];
        let intent = "general_reasoning";
        let rationale = "General reasoning task routed to resident 8B model with verified logic capabilities.";

        if (hasImage) {
          selected = "qwen2-vl-72b";
          score = 94.8;
          required_capabilities = ["vision", "doc_understanding"];
          intent = "multimodal_inspection";
          rationale = "Task requires visual reasoning and scanned layout extraction. Routed to top vision specialist.";
        } else if (hasCode) {
          selected = "llama-3-1-70b";
          score = 93.6;
          required_capabilities = ["coding", "structured_output"];
          intent = "code_and_telemetry";
          rationale = "Structured telemetry data parsing routed to high-parameter reasoning & coding model.";
        }

        return {
          task: {
            task_id: `sim-${Date.now()}`,
            intent,
            required_capabilities,
            preferred_capabilities: ["reasoning"],
            required_modalities: hasImage ? ["text", "image"] : ["text"],
            estimated_input_tokens: Math.max(120, Math.floor(req.prompt.length / 3) + (req.attachments?.length || 0) * 850),
            latency_budget_ms: 30000.0,
          },
          decision: {
            task_id: `sim-${Date.now()}`,
            selected,
            score,
            rationale,
            candidates: [
              {
                model_id: selected,
                total_score: score,
                capability_score: 0.94,
                context_score: 0.95,
                latency_score: 0.90,
                residency_score: 1.0,
                is_resident: true,
              },
              {
                model_id: "general-reasoning",
                total_score: 72.4,
                capability_score: 0.75,
                context_score: 0.90,
                latency_score: 0.88,
                residency_score: 1.0,
                is_resident: true,
              }
            ],
            rejected: [
              {
                model_id: "mistral-large-2",
                reason: "DEGRADED_HEALTH",
                detail: "Model flagged degraded latency / unverified residency"
              }
            ],
            fallbacks: ["general-reasoning", "phi-3-medium"],
            decided_in_ms: 4.8,
          }
        };
      }
    );
  },

  async getRoutingPolicies(): Promise<RoutingPolicy[]> {
    return fetchWithFallback('/routing/policies', {}, () => sessionRoutingPolicies);
  },

  async getRoutingPolicy(id: string): Promise<RoutingPolicy> {
    return fetchWithFallback(`/routing/policies/${id}`, {}, () => {
      const found = sessionRoutingPolicies.find(p => p.id === id);
      if (!found) throw new Error(`Routing policy ${id} not found`);
      return found;
    });
  },

  async saveRoutingPolicy(id: string, policy: Partial<RoutingPolicy>): Promise<RoutingPolicy> {
    return fetchWithFallback(
      `/routing/policies/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(policy),
      },
      () => {
        sessionRoutingPolicies = sessionRoutingPolicies.map(p => p.id === id ? { ...p, ...policy, updated_at: new Date().toISOString() } : p);
        const saved = sessionRoutingPolicies.find(p => p.id === id);
        return saved || (policy as RoutingPolicy);
      }
    );
  },

  async getRoutingCapabilities(): Promise<string[]> {
    return fetchWithFallback(
      '/routing/capabilities',
      {},
      () => [
        "text",
        "reasoning",
        "coding",
        "vision",
        "embedding",
        "tool_calling",
        "structured_output",
        "doc_understanding",
        "multimodal"
      ]
    );
  },

  // ==========================================
  // 5. Runs & Agent Orchestration
  // ==========================================
  async getRuns(): Promise<RunRead[]> {
    return fetchWithFallback('/runs', {}, () => [MOCK_RUN]);
  },

  async getRun(runId: string): Promise<RunRead> {
    return fetchWithFallback(`/runs/${runId}`, {}, () => ({
      ...MOCK_RUN,
      id: runId,
    }));
  },

  async getRunSteps(runId: string): Promise<RunStep[]> {
    return fetchWithFallback(`/runs/${runId}/steps`, {}, () => MOCK_RUN_STEPS);
  },

  async getRunArtifacts(runId: string): Promise<RunArtifact[]> {
    return fetchWithFallback(`/runs/${runId}/artifacts`, {}, () => MOCK_RUN_ARTIFACTS);
  },

  async createRun(
    prompt: string,
    attachments: any[] = [],
    execution_mode: 'demo' | 'live' = 'demo'
  ): Promise<{ run_id: string; status: string; events_url: string }> {
    return fetchWithFallback(
      '/runs',
      {
        method: 'POST',
        body: JSON.stringify({ prompt, attachments, execution_mode }),
      },
      () => {
        const id = `run-${Date.now().toString(16)}`;
        return {
          run_id: id,
          status: "pending",
          events_url: `/api/runs/${id}/events`,
        };
      }
    );
  },

  async cancelRun(runId: string): Promise<RunRead> {
    return fetchWithFallback(
      `/runs/${runId}/cancel`,
      { method: 'POST' },
      () => ({
        ...MOCK_RUN,
        id: runId,
        status: "cancelled"
      })
    );
  },

  // ==========================================
  // 6. Real-Time Server-Sent Events (SSE)
  // ==========================================
  subscribeToRunEvents(
    runId: string,
    onEvent: (event: WireEvent) => void,
    onError?: (err: any) => void
  ): () => void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return () => {};
    }

    try {
      const es = new EventSource(`${BASE_URL}/runs/${runId}/events`);

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          onEvent(parsed);
        } catch (err) {
          console.error("Failed to parse SSE event data", err);
        }
      };

      es.onerror = (err) => {
        if (onError) onError(err);
        es.close();
      };

      return () => es.close();
    } catch (err) {
      if (onError) onError(err);
      return () => {};
    }
  },

  subscribeToNetworkEvents(
    onEvent: (event: any) => void,
    onError?: (err: any) => void
  ): () => void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return () => {};
    }

    try {
      const es = new EventSource(`${BASE_URL}/network/events/stream`);

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          onEvent(parsed);
        } catch (err) {
          console.error("Failed to parse network SSE event data", err);
        }
      };

      es.onerror = (err) => {
        if (onError) onError(err);
        es.close();
      };

      return () => es.close();
    } catch (err) {
      if (onError) onError(err);
      return () => {};
    }
  },

  // ==========================================
  // 7. Knowledge & Document RAG
  // ==========================================
  async getDocuments(): Promise<DocumentRead[]> {
    return fetchWithFallback('/knowledge/documents', {}, () => sessionDocuments);
  },

  async uploadDocument(file: File, projectId?: string): Promise<DocumentRead> {
    const formData = new FormData();
    formData.append('file', file);
    const qs = projectId ? `?project_id=${projectId}` : '';

    return fetchWithFallback(
      `/knowledge/documents${qs}`,
      {
        method: 'POST',
        body: formData,
      },
      () => {
        const newDoc: DocumentRead = {
          id: `doc-${Date.now()}`,
          filename: file.name,
          sha256: "mock-sha256-" + Math.random().toString(16).substring(2),
          mime: file.type || "application/octet-stream",
          size_bytes: file.size,
          page_count: Math.max(1, Math.round(file.size / 50000)),
          scanned_page_count: 0,
          status: "analyzed",
          parser: file.name.endsWith('.pdf') ? "pymupdf" : "text",
          ingested_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          chunks_count: Math.max(2, Math.round(file.size / 15000)),
        };
        sessionDocuments.unshift(newDoc);
        return newDoc;
      }
    );
  },

  async deleteDocument(id: string): Promise<void> {
    return fetchWithFallback(
      `/knowledge/documents/${id}`,
      { method: 'DELETE' },
      () => {
        sessionDocuments = sessionDocuments.filter(d => d.id !== id);
      }
    );
  },

  async getDocumentChunks(docId: string): Promise<ChunkRead[]> {
    return fetchWithFallback(
      `/knowledge/documents/${docId}/chunks`,
      {},
      () => MOCK_CHUNKS[docId] || [
        {
          id: `${docId}:0`,
          document_id: docId,
          ordinal: 0,
          text: "Document section excerpt demonstrating local CPU ONNX vector extraction and grounded citation indexing.",
          section_path: "General Content",
          page_from: 1,
          page_to: 1,
          token_count: 42,
        }
      ]
    );
  },

  async searchKnowledge(
    query: string,
    top_k: number = 3,
    document_ids: string[] = [],
    rerank: boolean = true
  ): Promise<KnowledgeSearchResponse> {
    return fetchWithFallback(
      '/knowledge/search',
      {
        method: 'POST',
        body: JSON.stringify({ query, top_k, document_ids, rerank }),
      },
      () => ({
        query,
        chunks: [
          {
            marker: "[C1]",
            label: "Refinery_Safety_Manual.pdf > p.12",
            chunk_id: "chunk-rs-1",
            document_id: "doc-refinery-safety",
            text: "In case of abnormal temperature or pressure conditions, the emergency shutdown system (ESD) shall be activated immediately. The ESD will isolate the distillation column and cut feed supply within 30 seconds.",
            page_from: 12,
            page_to: 12,
            section_path: "Safety Protocols > Emergency Shutdown",
            doc_title: "Refinery_Safety_Manual.pdf",
            score: 0.942,
          },
          {
            marker: "[C2]",
            label: "Equipment_Specifications.docx > p.4",
            chunk_id: "chunk-rs-2",
            document_id: "doc-equipment-spec",
            text: "Design maximum temperature limit for distillation column DC-101 is 350°C. Temperature sensor alarms trigger at 340°C.",
            page_from: 4,
            page_to: 4,
            section_path: "Specifications > Thermal Limits",
            doc_title: "Equipment_Specifications.docx",
            score: 0.884,
          }
        ],
        reranked: false,
        timings: {
          embed_ms: 38.4,
          retrieve_ms: 5.2,
          rerank_ms: null,
          total_ms: 43.6,
        }
      })
    );
  },

  // ==========================================
  // 8. Network & Sovereignty Sentinel
  // ==========================================
  async getNetworkSnapshot(): Promise<NetworkSnapshot> {
    return fetchWithFallback('/network/snapshot', {}, () => ({
      ...MOCK_NETWORK_SNAPSHOT,
      nft_drop_count: sessionEgressDrops,
      persisted_block_count: sessionBlocksCount,
    }));
  },

  async triggerEgressProbe(): Promise<ProbeEgressResult> {
    sessionBlocksCount += 1;
    sessionEgressDrops += 1;

    return fetchWithFallback(
      '/network/probe',
      { method: 'POST' },
      () => ({
        target: "https://api.openai.com/v1/models",
        blocked: true,
        layer: "app",
        detail: "Blocked egress connection to api.openai.com:443 [RFC1918/loopback policy violation]",
        caller: "httpx/_transports/default.py:line 84 in socket.connect()",
      })
    );
  },

  async getNetworkRuleset(): Promise<NetworkRulesetResponse> {
    return fetchWithFallback(
      '/network/ruleset',
      {},
      () => ({
        available: true,
        ruleset: MOCK_RULESET
      })
    );
  },

  async getNetworkSelfAudit(): Promise<SelfAuditResult> {
    return fetchWithFallback(
      '/network/selfaudit',
      {},
      () => MOCK_SELF_AUDIT
    );
  },

  // ==========================================
  // 9. Tools & Sandbox
  // ==========================================
  async getTools(): Promise<ToolSpecification[]> {
    return fetchWithFallback('/tools', {}, () => MOCK_TOOLS);
  },

  async getTool(name: string): Promise<ToolSpecification> {
    return fetchWithFallback(`/tools/${name}`, {}, () => {
      const found = MOCK_TOOLS.find(t => t.name === name);
      if (!found) throw new Error(`Tool ${name} not found`);
      return found;
    });
  },

  async testTool(name: string, args: Record<string, any> = {}): Promise<ToolTestResult> {
    return fetchWithFallback(
      `/tools/${name}/test`,
      {
        method: 'POST',
        body: JSON.stringify(args),
      },
      () => ({
        tool: name,
        success: true,
        output: { result: "Tool validation executed successfully in local environment", args_echo: args },
        duration_ms: 18.5,
      })
    );
  },

  async getSandboxStatus(): Promise<{ connected: boolean; image: string }> {
    return fetchWithFallback(
      '/sandbox/status',
      {},
      () => ({ connected: true, image: "vajra-sandbox:py311" })
    );
  },

  async getSandboxPolicy(): Promise<SandboxPolicy> {
    return fetchWithFallback(
      '/sandbox/policy',
      {},
      () => MOCK_SANDBOX_POLICY
    );
  },

  async scanAstGuard(code: string): Promise<AstGuardResult> {
    return fetchWithFallback(
      '/sandbox/guard',
      {
        method: 'POST',
        body: JSON.stringify({ code }),
      },
      () => {
        const lines = code.split('\n');
        const violations = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/import\s+(socket|requests|urllib|httpx|aiohttp)/.test(line) || /from\s+(socket|requests|urllib|httpx|aiohttp)/.test(line)) {
            violations.push({
              line: i + 1,
              col: 1,
              code_snippet: line.trim(),
              rule: "DISALLOWED_NETWORKING_MODULE",
              severity: "error" as const,
            });
          }
          if (line.includes('os.system') || line.includes('subprocess.')) {
            violations.push({
              line: i + 1,
              col: 1,
              code_snippet: line.trim(),
              rule: "RESTRICTED_SUBPROCESS_INVOCATION",
              severity: "error" as const,
            });
          }
        }
        return {
          valid: violations.length === 0,
          violations,
          scanned_in_ms: 1.4,
        };
      }
    );
  },

  // ==========================================
  // 10. Audit & Event Store
  // ==========================================
  async getAuditLogs(params?: { run_id?: string; type?: string; limit?: number; offset?: number }): Promise<AuditRecord[]> {
    const query = new URLSearchParams();
    if (params?.run_id) query.set('run_id', params.run_id);
    if (params?.type) query.set('type', params.type);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';

    return fetchWithFallback(`/audit/events${qs}`, {}, () => {
      let filtered = [...MOCK_AUDIT_LOGS];
      if (params?.type && params.type !== 'ALL') {
        filtered = filtered.filter(l => l.type.includes(params.type!));
      }
      if (params?.run_id) {
        filtered = filtered.filter(l => l.run_id === params.run_id);
      }
      return filtered;
    });
  },

  async getAuditEventTypes(): Promise<string[]> {
    return fetchWithFallback(
      '/audit/event-types',
      {},
      () => MOCK_AUDIT_EVENT_TYPES
    );
  },

  async exportAuditManifest(): Promise<{ exported: boolean; filename: string; size_bytes: number }> {
    return fetchWithFallback(
      '/audit/export',
      {},
      () => ({
        exported: true,
        filename: `audit_manifest_${Date.now()}.zip`,
        size_bytes: 48920
      })
    );
  }
};
