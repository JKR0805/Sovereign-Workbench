'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { api } from '../../lib/api';
import { MessageCitation, RunAttachment, WireEvent } from '../../lib/types';

export interface InferenceGraphProps {
  prompt: string;
  attachments?: RunAttachment[];
  conversationId?: string;
  onToken?: (token: string) => void;
  onModelSelected?: (modelId: string, displayName: string) => void;
  onComplete: (result: {
    selectedModelId: string | null;
    selectedModelName: string;
    score: number | null;
    intent: string | null;
    citations: MessageCitation[];
    replyText: string;
    promptTokens: number | null;
    completionTokens: number | null;
    tokensPerSec: number | null;
    durationMs: number;
    verification: string | null;
  }) => void;
  onFailed: (error: { message: string; code?: string }) => void;
}

type NodeStatus = 'pending' | 'active' | 'completed' | 'failed';

interface CandidateInfo {
  modelId: string;
  score: number;
  resident: boolean;
}

interface NodeState {
  status: NodeStatus;
  durationMs: number | null;
  error?: string;
}

const NODE_ORDER = ['intake', 'vision', 'retrieve', 'classify', 'execute', 'verify'] as const;
type NodeId = (typeof NODE_ORDER)[number];

const NODE_TITLES: Record<NodeId, string> = {
  intake: 'Attachment Intake & Table Extraction',
  vision: 'Vision & Multimodal Fallback',
  retrieve: 'Knowledge Retrieval (RAG)',
  classify: 'Task Classification & Model Selection',
  execute: 'Target Model Execution',
  verify: 'Sovereignty Verification',
};

function initialNodeStates(): Record<NodeId, NodeState> {
  const state = {} as Record<NodeId, NodeState>;
  for (const id of NODE_ORDER) state[id] = { status: 'pending', durationMs: null };
  return state;
}

export const InferenceGraph: React.FC<InferenceGraphProps> = ({
  prompt,
  attachments,
  conversationId,
  onToken,
  onModelSelected,
  onComplete,
  onFailed,
}) => {
  const [nodeStates, setNodeStates] = useState<Record<NodeId, NodeState>>(initialNodeStates);
  const [expandedDetails, setExpandedDetails] = useState(true);
  const [streamedText, setStreamedText] = useState('');
  const [tokenCount, setTokenCount] = useState(0);
  const [tokensPerSec, setTokensPerSec] = useState<number | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string | null>(null);
  const [rejectedCount, setRejectedCount] = useState<number | null>(null);
  const [retrievalSummary, setRetrievalSummary] = useState<{
    scope: string;
    chunkCount: number;
    grounded: boolean;
  } | null>(null);
  const [skippedAttachments, setSkippedAttachments] = useState<{ filename: string; reason: string }[]>([]);
  const [visionSummary, setVisionSummary] = useState<{
    modelId: string;
    imageCount: number;
    descriptionChars: number | null;
  } | null>(null);
  const [promptEnhanced, setPromptEnhanced] = useState<{
    originalPrompt: string;
    enhancedPrompt: string;
    isCodingTask: boolean;
    intent: string;
    source: string;
  } | null>(null);
  const [extractedFiles, setExtractedFiles] = useState<{
    filename: string;
    chunkCount: number;
    summary: string | null;
    requiresMultimodal: boolean;
  }[]>([]);
  const [multimodalFallback, setMultimodalFallback] = useState<boolean>(false);
  const [inheritedFiles, setInheritedFiles] = useState<{ filename: string; documentId?: string }[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [laggedWarning, setLaggedWarning] = useState(false);

  const hasFinishedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const chunksRef = useRef<string[]>([]);
  const tokenStartRef = useRef(0);

  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onModelSelectedRef = useRef(onModelSelected);
  onModelSelectedRef.current = onModelSelected;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    function fail(message: string, code?: string) {
      if (hasFinishedRef.current || cancelled) return;
      hasFinishedRef.current = true;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          /* already closed */
        }
      }
      onFailedRef.current({ message, code });
    }

    function setNode(id: NodeId, patch: Partial<NodeState>) {
      setNodeStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    }

    async function run() {
      startTimeRef.current = Date.now();
      let runId: string;
      try {
        const created = await api.createRun(prompt, attachments ?? [], 'agent', {
          conversationId,
        });
        runId = created.run_id;
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Failed to start the run.');
        return;
      }
      if (cancelled) return;

      unsubscribe = api.subscribeToRunEvents(
        runId,
        (event: WireEvent) => {
          if (cancelled || hasFinishedRef.current) return;

          switch (event.type) {
            case 'NODE_ENTERED': {
              const nodeId = event.node_id as NodeId | undefined;
              if (nodeId && NODE_ORDER.includes(nodeId)) {
                setNode(nodeId, { status: 'active' });
                if (nodeId === 'execute') tokenStartRef.current = Date.now();
              }
              break;
            }

            case 'NODE_COMPLETED': {
              const nodeId = event.node_id as NodeId | undefined;
              if (nodeId && NODE_ORDER.includes(nodeId)) {
                setNode(nodeId, {
                  status: 'completed',
                  durationMs: event.duration_ms ?? null,
                });
                if (nodeId === 'verify' && typeof event.payload?.verdict === 'string') {
                  setVerdict(event.payload.verdict);
                }
              }
              break;
            }

            case 'NODE_FAILED': {
              const nodeId = event.node_id as NodeId | undefined;
              if (nodeId && NODE_ORDER.includes(nodeId)) {
                setNode(nodeId, { status: 'failed', error: String(event.payload?.error ?? '') });
              }
              break;
            }

            case 'ATTACHMENT_SKIPPED':
              setSkippedAttachments((prev) => [
                ...prev,
                {
                  filename: String(event.payload?.filename ?? 'unknown'),
                  reason: String(event.payload?.reason ?? 'not indexed'),
                },
              ]);
              break;

            case 'EXTRACTION_COMPLETED':
              setExtractedFiles((prev) => [
                ...prev,
                {
                  filename: String(event.payload?.filename ?? ''),
                  chunkCount: Number(event.payload?.chunk_count ?? 0),
                  summary: typeof event.payload?.summary === 'string' ? event.payload.summary : null,
                  requiresMultimodal: Boolean(event.payload?.requires_multimodal),
                },
              ]);
              break;

            case 'CONVERSATION_CONTEXT_INHERITED': {
              const rawDocs = Array.isArray(event.payload?.documents) ? event.payload.documents : [];
              setInheritedFiles(
                rawDocs.map((d: any) => ({
                  filename: String(d.filename || 'conversation document'),
                  documentId: d.document_id ? String(d.document_id) : undefined,
                }))
              );
              break;
            }

            case 'MULTIMODAL_FALLBACK':
              setMultimodalFallback(true);
              break;

            case 'VISION_ANALYSIS_STARTED':
              setVisionSummary({
                modelId: String(event.payload?.model_id ?? ''),
                imageCount: Number(event.payload?.image_count ?? 0),
                descriptionChars: null,
              });
              break;

            case 'VISION_ANALYSIS_COMPLETED':
              setVisionSummary((prev) => ({
                modelId: String(event.payload?.model_id ?? prev?.modelId ?? ''),
                imageCount: prev?.imageCount ?? 0,
                descriptionChars: Number(event.payload?.description_chars ?? 0),
              }));
              break;

            case 'PROMPT_ENHANCED':
              setPromptEnhanced({
                originalPrompt: String(event.payload?.original_prompt ?? ''),
                enhancedPrompt: String(event.payload?.enhanced_prompt ?? ''),
                isCodingTask: Boolean(event.payload?.is_coding_task),
                intent: String(event.payload?.intent ?? ''),
                source: String(event.payload?.source ?? 'general_model'),
              });
              if (typeof event.payload?.intent === 'string') {
                setIntent(event.payload.intent);
              }
              break;

            case 'TASK_CLASSIFIED':
              setIntent(typeof event.payload?.intent === 'string' ? event.payload.intent : null);
              if (typeof event.payload?.is_coding_task === 'boolean') {
                setPromptEnhanced((prev) =>
                  prev
                    ? { ...prev, isCodingTask: Boolean(event.payload.is_coding_task) }
                    : {
                        originalPrompt: prompt,
                        enhancedPrompt: prompt,
                        isCodingTask: Boolean(event.payload.is_coding_task),
                        intent: String(event.payload?.intent ?? ''),
                        source: 'router',
                      }
                );
              }
              break;

            case 'MODEL_CANDIDATES': {
              const raw = Array.isArray(event.payload?.candidates) ? event.payload.candidates : [];
              setCandidates(
                raw.map((c: any) => ({
                  modelId: String(c.model_id),
                  score: Number(c.score ?? 0),
                  resident: Boolean(c.resident),
                }))
              );
              const rejected = Array.isArray(event.payload?.rejected) ? event.payload.rejected.length : null;
              setRejectedCount(rejected);
              break;
            }

            case 'MODEL_SELECTED': {
              const modelId = typeof event.payload?.model_id === 'string' ? event.payload.model_id : null;
              const displayName =
                typeof event.payload?.display_name === 'string' ? event.payload.display_name : modelId;
              setSelectedModelId(modelId);
              setSelectedModelName(displayName);
              if (modelId && displayName) onModelSelectedRef.current?.(modelId, displayName);
              break;
            }

            case 'RAG_RESULTS':
              setRetrievalSummary({
                scope: typeof event.payload?.scope === 'string' ? event.payload.scope : 'corpus',
                chunkCount: Number(event.payload?.chunk_count ?? 0),
                grounded: Boolean(event.payload?.grounded),
              });
              break;

            case 'LLM_TOKEN': {
              const token = typeof event.payload?.token === 'string' ? event.payload.token : '';
              chunksRef.current.push(token);
              setTokenCount((c) => c + 1);
              setStreamedText((prev) => prev + token);
              onTokenRef.current?.(token);
              if (tokenStartRef.current > 0) {
                const elapsedSec = (Date.now() - tokenStartRef.current) / 1000;
                if (elapsedSec > 0.3) {
                  setTokensPerSec(chunksRef.current.length / elapsedSec);
                }
              }
              break;
            }

            case 'RUN_COMPLETED': {
              if (hasFinishedRef.current) return;
              hasFinishedRef.current = true;
              if (unsubscribe) {
                try {
                  unsubscribe();
                } catch {
                  /* already closed */
                }
                unsubscribe = null;
              }
              const payload = event.payload ?? {};
              const replyText =
                typeof payload.reply === 'string' && payload.reply.length > 0
                  ? payload.reply
                  : chunksRef.current.join('');
              const citations: MessageCitation[] = Array.isArray(payload.citations)
                ? payload.citations
                : [];
              const modelsUsed = Array.isArray(payload.models_used) ? payload.models_used : [];
              const durationMs =
                typeof payload.duration_ms === 'number'
                  ? payload.duration_ms
                  : Date.now() - startTimeRef.current;

              setTimeout(() => {
                if (cancelled) return;
                onCompleteRef.current({
                  selectedModelId: modelsUsed[0] ?? selectedModelId,
                  selectedModelName: selectedModelName ?? modelsUsed[0] ?? 'model',
                  score: null,
                  intent,
                  citations,
                  replyText,
                  promptTokens: typeof payload.prompt_tokens === 'number' ? payload.prompt_tokens : null,
                  completionTokens:
                    typeof payload.completion_tokens === 'number' ? payload.completion_tokens : null,
                  tokensPerSec: typeof payload.tokens_per_sec === 'number' ? payload.tokens_per_sec : tokensPerSec,
                  durationMs,
                  verification: typeof payload.verification === 'string' ? payload.verification : verdict,
                });
              }, 250);
              break;
            }

            case 'RUN_FAILED':
              fail(String(event.payload?.error ?? 'The run failed.'), String(event.payload?.code ?? ''));
              break;
          }
        },
        () => fail('Lost connection to the run stream.'),
        {
          onLagged: () => {
            // The subscriber's queue overflowed and the server dropped
            // events for this connection only. Nothing was lost from the
            // durable log -- GET /api/runs/{id}/steps and /events?since=
            // can still reconstruct the full picture -- but this stream's
            // live view may now be behind, so say so rather than silently
            // showing a stale graph.
            setLaggedWarning(true);
          },
        }
      );
    }

    run();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, conversationId]);

  const activeIndex = NODE_ORDER.findIndex((id) => nodeStates[id].status === 'active');
  const isDone = NODE_ORDER.every((id) => nodeStates[id].status === 'completed');

  return (
    <div className="bg-bg-panel border border-accent/40 rounded-lg shadow-lg overflow-hidden my-4">
      <div className="bg-bg-elevated px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full bg-accent ${isDone ? '' : 'animate-ping'}`} />
          <span className="font-mono text-xs uppercase tracking-wider text-accent font-bold">
            Inference Pipeline · Local Execution
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selectedModelName && (
            <span className="font-mono text-xs text-text-tertiary hidden sm:inline">
              Model: <strong className="text-text-primary font-medium">{selectedModelName}</strong>
            </span>
          )}
          <button
            onClick={() => setExpandedDetails(!expandedDetails)}
            className="text-text-tertiary hover:text-text-primary transition-colors p-1"
            title={expandedDetails ? 'Collapse pipeline steps' : 'Expand pipeline steps'}
          >
            {expandedDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {laggedWarning && (
        <div className="px-4 py-2 bg-warn/10 border-b border-warn/30 text-xs font-mono text-warn flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Event stream fell behind; some intermediate updates may be missing from this view. The
          run itself continues correctly.
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {NODE_ORDER.map((nodeId, idx) => {
          const node = nodeStates[nodeId];
          const isActive = node.status === 'active';
          const isCompleted = node.status === 'completed';
          const isFailed = node.status === 'failed';

          return (
            <div key={nodeId} className="flex flex-col">
              <div
                className={`p-3 rounded-md border transition-colors duration-150 flex flex-col gap-2 ${
                  isFailed
                    ? 'border-error/60 bg-error/5'
                    : isActive
                    ? 'border-accent bg-accent/5 shadow-sm'
                    : isCompleted
                    ? 'border-border bg-bg-panel'
                    : 'border-border/40 bg-bg-panel/40 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                      {isFailed ? (
                        <XCircle className="w-4 h-4 text-error" />
                      ) : isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-ok" />
                      ) : isActive ? (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-border" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-text-primary font-mono flex items-center gap-2">
                        <span>{NODE_TITLES[nodeId]}</span>
                        {isActive && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent uppercase">
                            Executing
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary font-mono mt-0.5">
                        {nodeId === 'intake' &&
                          (extractedFiles.length > 0
                            ? `${extractedFiles.length} file(s) ingested & parsed${
                                inheritedFiles.length > 0 ? ` (${inheritedFiles.length} active from conversation)` : ''
                              }`
                            : inheritedFiles.length > 0
                            ? `${inheritedFiles.length} attachment(s) (active conversation context)`
                            : attachments && attachments.length > 0
                            ? `${attachments.length} attachment(s)`
                            : 'No attachments')}
                        {nodeId === 'vision' &&
                          (multimodalFallback
                            ? 'Multimodal fallback activated: scanned / sparse text analyzed via vision'
                            : visionSummary
                            ? `${visionSummary.imageCount} image(s) described by ${visionSummary.modelId}${
                                visionSummary.descriptionChars != null
                                  ? ` (${visionSummary.descriptionChars} chars)`
                                  : '...'
                              }`
                            : 'No visual inspection required')}
                        {nodeId === 'retrieve' &&
                          (retrievalSummary
                            ? `${retrievalSummary.chunkCount} chunk(s) retrieved · scope: ${retrievalSummary.scope}`
                            : 'Searching local knowledge base...')}
                        {nodeId === 'classify' &&
                          (promptEnhanced
                            ? `${promptEnhanced.isCodingTask ? '💻 Coding Specialist Task' : '📖 General Intelligence Task'}${
                                intent ? ` · ${intent}` : ''
                              }`
                            : intent
                            ? `Intent: ${intent}`
                            : 'Classifying and routing...')}
                        {nodeId === 'execute' &&
                          `${tokenCount > 0 ? `${tokenCount} tokens streamed` : 'Generating...'}`}
                        {nodeId === 'verify' && verdict && `Verdict: ${verdict}`}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono text-xs text-text-tertiary">
                    {isCompleted && node.durationMs != null
                      ? `${node.durationMs.toFixed(1)}ms`
                      : isActive
                      ? 'Processing...'
                      : isFailed
                      ? 'Failed'
                      : 'Queued'}
                  </div>
                </div>

                {expandedDetails && (isActive || isCompleted || isFailed) && (
                  <div className="pl-9 pt-1 border-t border-border/50 mt-1">
                    {nodeId === 'intake' && (
                      <div className="flex flex-col gap-2">
                        {inheritedFiles.length > 0 && (
                          <div className="p-2 rounded bg-accent/10 border border-accent/30 text-xs font-mono text-accent flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>
                              Active conversation context: {inheritedFiles.map((f) => f.filename).join(', ')} retained from previous turn(s).
                            </span>
                          </div>
                        )}
                        {skippedAttachments.length > 0 && (
                          <div className="flex flex-col gap-1 text-xs font-mono">
                            {skippedAttachments.map((s, i) => (
                              <span key={i} className="text-warn">
                                {s.filename}: {s.reason}
                              </span>
                            ))}
                          </div>
                        )}
                        {extractedFiles.length > 0 && (
                          <div className="flex flex-col gap-1.5 text-xs font-mono">
                            {extractedFiles.map((f, i) => (
                              <div key={i} className="p-2 rounded bg-bg-base border border-border/70 flex flex-col gap-1">
                                <div className="flex items-center justify-between text-accent">
                                  <span className="font-semibold truncate">{f.filename}</span>
                                  <span className="text-[11px] text-text-tertiary">{f.chunkCount} chunks indexed</span>
                                </div>
                                {f.summary && (
                                  <p className="text-text-secondary whitespace-pre-wrap text-[11px] leading-relaxed">
                                    {f.summary}
                                  </p>
                                )}
                                {f.requiresMultimodal && (
                                  <span className="text-[10px] text-warn font-semibold">
                                    ⚠️ Incomplete text / scanned pages detected &rarr; Vision fallback triggered
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {nodeId === 'vision' && multimodalFallback && (
                      <div className="p-2 rounded bg-warn/10 border border-warn/30 text-xs font-mono text-warn flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Multimodal fallback: Scanned / sparse pages processed via vision model.</span>
                      </div>
                    )}
                    {nodeId === 'retrieve' && promptEnhanced && promptEnhanced.enhancedPrompt && promptEnhanced.enhancedPrompt !== promptEnhanced.originalPrompt && (
                      <div className="p-2 rounded bg-bg-base border border-border/70 text-xs font-mono text-text-secondary flex flex-col gap-1 mb-1">
                        <div className="text-[10px] uppercase font-bold text-accent">Enriched Vector Retrieval Query:</div>
                        <div className="text-text-primary text-[11px] italic">&ldquo;{promptEnhanced.enhancedPrompt}&rdquo;</div>
                      </div>
                    )}
                    {nodeId === 'classify' && (
                      <div className="flex flex-col gap-2">
                        {promptEnhanced && (
                          <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/40 text-xs font-mono">
                            <span className="text-text-tertiary">Task Domain:</span>
                            <span
                              className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                                promptEnhanced.isCodingTask
                                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              }`}
                            >
                              {promptEnhanced.isCodingTask ? '💻 Coding Specialist Task' : '📖 General Intelligence Task'}
                            </span>
                            <span className="text-text-tertiary">Understanding Source:</span>
                            <span className="text-text-secondary italic">[{promptEnhanced.source}]</span>
                          </div>
                        )}
                        {candidates.length > 0 && (
                          <div className="flex flex-col gap-2 mt-1">
                            <div className="text-xs font-mono text-text-tertiary">
                              Candidate scoring{rejectedCount ? ` (${rejectedCount} rejected)` : ''}:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                              {candidates.map((c) => {
                                const isWinner = c.modelId === selectedModelId;
                                return (
                                  <div
                                    key={c.modelId}
                                    className={`p-2 rounded border transition-colors duration-150 ${
                                      isWinner
                                        ? 'border-accent bg-accent/10 text-accent font-semibold shadow-sm'
                                        : 'border-border bg-bg-elevated text-text-tertiary'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="truncate">{c.modelId}</span>
                                      <span>{c.score.toFixed(1)}</span>
                                    </div>
                                    <div className="text-xs text-text-secondary mt-0.5">
                                      {c.resident ? 'Resident in VRAM' : 'Not resident'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {nodeId === 'execute' && (
                      <div className="flex flex-col gap-2 text-xs font-mono">
                        <div className="flex items-center justify-between text-ok font-medium">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Local generation{selectedModelName ? ` · ${selectedModelName}` : ''}</span>
                          </span>
                          {tokensPerSec != null && (
                            <span className="text-accent font-bold">{tokensPerSec.toFixed(1)} tok/s</span>
                          )}
                        </div>
                        {streamedText && (
                          <div className="p-2 rounded bg-bg-base border border-border/80 text-text-secondary font-mono max-h-24 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                            {streamedText}
                          </div>
                        )}
                      </div>
                    )}
                    {nodeId === 'verify' && (
                      <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
                        {verdict === 'pass' && (
                          <span className="flex items-center gap-1.5 text-ok font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>SOVEREIGN BOUNDARY VERIFIED CLEAN</span>
                          </span>
                        )}
                        {verdict === 'fail' && (
                          <span className="flex items-center gap-1.5 text-error font-semibold">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>EGRESS DETECTED DURING RUN</span>
                          </span>
                        )}
                        {(verdict === 'unverified' || !verdict) && isCompleted && (
                          <span className="flex items-center gap-1.5 text-text-tertiary font-semibold">
                            <ShieldQuestion className="w-3.5 h-3.5" />
                            <span>NOT MEASURED (guard unavailable in this configuration)</span>
                          </span>
                        )}
                      </div>
                    )}
                    {isFailed && node.error && (
                      <div className="text-xs font-mono text-error">{node.error}</div>
                    )}
                  </div>
                )}
              </div>

              {idx < NODE_ORDER.length - 1 && (
                <div className="ml-6 w-0.5 h-2 bg-border relative my-0.5">
                  {isCompleted && <div className="absolute inset-0 bg-ok animate-pulse" />}
                </div>
              )}
            </div>
          );
        })}

        {activeIndex === NODE_ORDER.indexOf('execute') && (
          <div className="p-3 rounded-md border border-ok/40 bg-ok/5 flex items-center justify-between text-xs font-mono text-ok animate-pulse">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Synthesizing response · streaming live tokens...</span>
            </div>
            <span className="font-bold">
              {tokensPerSec != null ? `${tokensPerSec.toFixed(1)} tok/s` : `${tokenCount} tokens`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
