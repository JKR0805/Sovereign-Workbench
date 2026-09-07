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
  AuditRecord
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
  MOCK_AUDIT_LOGS
} from './mockData';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// In-memory mock state during session for mutations
let sessionModels = [...MOCK_MODELS];
let sessionDocuments = [...MOCK_DOCUMENTS];
let sessionBlocksCount = 4;
let sessionEgressDrops = 4;

async function fetchWithFallback<T>(
  endpoint: string,
  options?: RequestInit,
  fallbackFn?: () => T | Promise<T>
): Promise<T> {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      // RFC 7807 error or fallback
      if (fallbackFn) {
        return await fallbackFn();
      }
      const errorData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errorData.detail || `Request failed with status ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    if (fallbackFn) {
      return await fallbackFn();
    }
    throw err;
  }
}

export const api = {
  // System & Health
  async getSystemHealth(): Promise<SystemHealth> {
    return fetchWithFallback('/system/health', {}, () => MOCK_SYSTEM_HEALTH);
  },

  async ping(): Promise<{ status: string; version: string }> {
    return fetchWithFallback('/system/ping', {}, () => ({ status: "ok", version: "0.1.0" }));
  },

  // Models
  async getModels(params?: { capability?: string; enabled_only?: boolean }): Promise<ModelRead[]> {
    return fetchWithFallback('/models', {}, () => {
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

  async loadModel(id: string): Promise<void> {
    sessionModels = sessionModels.map(m => ({
      ...m,
      is_resident: m.id === id,
    }));
  },

  async unloadModel(id: string): Promise<void> {
    sessionModels = sessionModels.map(m => 
      m.id === id ? { ...m, is_resident: false } : m
    );
  },

  async registerModel(modelData: Partial<ModelRead>): Promise<ModelRead> {
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
  },

  // Routing Engine & Simulation
  async simulateRouting(req: SimulateRequest): Promise<SimulateResponse> {
    return fetchWithFallback(
      '/routing/simulate',
      {
        method: 'POST',
        body: JSON.stringify(req),
      },
      () => {
        const text = req.prompt.toLowerCase();
        const hasImage = req.attachments?.some(a => a.mime.startsWith('image') || a.scanned_page_count! > 0) || text.includes('scan') || text.includes('diagram') || text.includes('p&id') || text.includes('inspection');
        const hasCode = text.includes('code') || text.includes('csv') || text.includes('telemetry') || text.includes('script') || text.includes('function');

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

  // Knowledge & Documents
  async getDocuments(): Promise<DocumentRead[]> {
    return fetchWithFallback('/knowledge/documents', {}, () => sessionDocuments);
  },

  async uploadDocument(file: File): Promise<DocumentRead> {
    // In demo mode or real upload
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
  },

  async deleteDocument(id: string): Promise<void> {
    sessionDocuments = sessionDocuments.filter(d => d.id !== id);
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

  async searchKnowledge(query: string, top_k: number = 3): Promise<KnowledgeSearchResponse> {
    return fetchWithFallback(
      '/knowledge/search',
      {
        method: 'POST',
        body: JSON.stringify({ query, top_k }),
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

  // Runs
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

  async createRun(prompt: string, attachments: any[] = []): Promise<{ run_id: string; status: string; events_url: string }> {
    return fetchWithFallback(
      '/runs',
      {
        method: 'POST',
        body: JSON.stringify({ prompt, attachments, execution_mode: 'demo' }),
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

  // Network & Sovereignty Sentinel
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

  // Tools & Sandbox
  async getTools(): Promise<ToolSpecification[]> {
    return fetchWithFallback('/tools', {}, () => MOCK_TOOLS);
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

  // Audit Events
  async getAuditLogs(): Promise<AuditRecord[]> {
    return fetchWithFallback('/audit/events', {}, () => MOCK_AUDIT_LOGS);
  }
};
