'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useApiResource } from '../../../lib/useApiResource';
import { ErrorState } from '../../../components/primitives/ErrorState';
import { LoadingState } from '../../../components/primitives/LoadingState';
import type { AuditEvent, RunRead, RunStep } from '../../../lib/types';
import { ChevronLeft, FileText } from 'lucide-react';

type InspectorTab = 'routing' | 'retrieval' | 'reply' | 'artifacts';

function fmtTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = (params?.id as string) || '';

  const { data: run, loading: runLoading, error: runError, reload: reloadRun } = useApiResource<RunRead>(
    () => api.getRun(runId),
    [runId]
  );
  const { data: steps, loading: stepsLoading } = useApiResource<RunStep[]>(
    () => api.getRunSteps(runId),
    [runId]
  );
  const { data: artifacts } = useApiResource<Record<string, unknown>[]>(
    () => api.getRunArtifacts(runId),
    [runId]
  );
  const { data: eventPage } = useApiResource(
    () => api.getAuditLogs({ run_id: runId, limit: 500 }),
    [runId]
  );

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>('routing');
  const [timelineFilter, setTimelineFilter] = useState('ALL');

  const events: AuditEvent[] = eventPage?.items ?? [];
  const runCompleted = events.find((e) => e.type === 'RUN_COMPLETED');
  const citations = Array.isArray(runCompleted?.payload?.citations) ? runCompleted!.payload.citations : [];
  const reply = typeof runCompleted?.payload?.reply === 'string' ? runCompleted!.payload.reply : null;

  useEffect(() => {
    if (!activeNodeId && steps && steps.length > 0) {
      setActiveNodeId(steps[0].node_id);
      setTab(steps[0].node_id === 'retrieve' ? 'retrieval' : 'routing');
    }
  }, [steps, activeNodeId]);

  if (runLoading) return <LoadingState label={`Loading run ${runId}...`} className="h-full" />;
  if (runError || !run) {
    return (
      <div className="p-6">
        <ErrorState error={runError ?? new Error('Run not found')} onRetry={reloadRun} />
      </div>
    );
  }

  const classifyStep = (steps ?? []).find((s) => s.node_id === 'classify');
  const routingDecision = classifyStep?.routing_decision as any;
  const durationStr = run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(2)}s` : '—';

  const filteredEvents = events.filter((e) => (timelineFilter === 'ALL' ? true : e.type.includes(timelineFilter)));

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      {/* Top Banner */}
      <div className="bg-bg-panel border-b border-border px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm flex-shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href="/runs" className="flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors font-mono">
            <ChevronLeft className="w-4 h-4" />
            <span>Runs</span>
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="font-mono font-bold text-text-primary">Run {runId.slice(0, 8)}</span>
          <span className="text-text-tertiary truncate max-w-md hidden md:inline">· {run.prompt}</span>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold uppercase border ${
              run.status === 'completed'
                ? 'bg-ok-muted text-ok border-ok/30'
                : run.status === 'failed'
                ? 'bg-error/10 text-error border-error/30'
                : 'bg-accent/10 text-accent border-accent/30'
            }`}
          >
            {run.status}
          </span>
          <span className="font-mono text-xs text-text-tertiary">· {durationStr}</span>
          {run.total_tokens > 0 && <span className="font-mono text-xs text-text-tertiary">· {run.total_tokens} tokens</span>}
        </div>

        <div className="flex items-center gap-3 font-mono text-xs text-text-secondary flex-shrink-0">
          {run.models_used.length > 0 && <span>Model: {run.models_used.join(', ')}</span>}
          {run.error && <span className="text-error">error: {run.error}</span>}
        </div>
      </div>

      {/* 3-Pane Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane: Timeline */}
        <div className="w-full lg:w-72 bg-bg-panel border-b lg:border-b-0 lg:border-r border-border flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold text-text-primary uppercase font-mono tracking-wider">
              Timeline Events ({events.length})
            </span>
            <select
              value={timelineFilter}
              onChange={(e) => setTimelineFilter(e.target.value)}
              className="bg-bg-elevated border border-border rounded px-2.5 py-1 text-xs font-mono text-text-secondary outline-none"
            >
              <option value="ALL">All Events</option>
              <option value="NODE">Nodes</option>
              <option value="MODEL">Routing</option>
              <option value="RAG">RAG</option>
              <option value="LLM">Tokens</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
            {filteredEvents.length === 0 && (
              <p className="text-xs text-text-tertiary font-mono p-2">No events recorded yet.</p>
            )}
            {filteredEvents.map((evt) => (
              <div
                key={evt.id}
                onClick={() => evt.node_id && setActiveNodeId(evt.node_id)}
                className={`p-2.5 rounded border text-xs cursor-pointer transition-all flex flex-col gap-1 ${
                  evt.node_id === activeNodeId
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-bg-elevated border-border text-text-secondary hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-text-tertiary">{fmtTs(evt.ts)}</span>
                  <span className="font-semibold text-text-primary truncate ml-1">{evt.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Pane: Execution graph */}
        <div className="flex-1 bg-[#0A0C10] p-6 relative overflow-hidden flex flex-col items-center overflow-y-auto">
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(#2E3542 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          />
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-4 z-10">
            Execution Graph · Click a node to inspect
          </div>

          {stepsLoading && <LoadingState compact label="Loading steps..." />}

          <div className="flex flex-col items-center gap-5 z-10 w-full max-w-sm">
            {(steps ?? []).map((step, idx) => {
              const isSelected = activeNodeId === step.node_id;
              return (
                <React.Fragment key={step.id}>
                  <div
                    onClick={() => {
                      setActiveNodeId(step.node_id);
                      setTab(
                        step.node_id === 'retrieve'
                          ? 'retrieval'
                          : step.node_id === 'execute'
                          ? 'reply'
                          : 'routing'
                      );
                    }}
                    className={`w-full p-4 rounded-md border cursor-pointer transition-all flex items-center justify-between bg-bg-panel shadow-lg ${
                      isSelected ? 'border-accent shadow-glow-accent scale-[1.02]' : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          step.status === 'completed' ? 'bg-ok' : step.status === 'failed' ? 'bg-error' : 'bg-border'
                        }`}
                      />
                      <div>
                        <div className="text-sm font-bold text-text-primary font-mono">{step.node_id}</div>
                        <div className="text-xs text-text-tertiary font-mono">{step.kind}</div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <span className="text-text-tertiary">
                        {step.duration_ms != null ? `${step.duration_ms.toFixed(1)}ms` : step.status}
                      </span>
                    </div>
                  </div>
                  {idx < (steps?.length ?? 0) - 1 && (
                    <div className="w-0.5 h-4 bg-[#2E3542] relative flex items-center justify-center">
                      <div className="w-1.5 h-1.5 border-b-2 border-r-2 border-[#2E3542] rotate-45 translate-y-1" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Inspector */}
        <div className="w-full lg:w-96 bg-bg-panel border-t lg:border-t-0 lg:border-l border-border flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="flex items-center border-b border-border text-xs sm:text-sm font-mono">
            {(['routing', 'retrieval', 'reply', 'artifacts'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 capitalize transition-colors border-b-2 -mb-px text-center ${
                  tab === t ? 'border-accent text-accent font-semibold' : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-4 flex flex-col gap-4 text-sm">
            {tab === 'routing' && (
              <div className="flex flex-col gap-3">
                {!routingDecision ? (
                  <p className="text-xs text-text-tertiary font-mono">No routing decision recorded for this run.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <span className="font-semibold text-text-primary">Winning Model</span>
                      <span className="font-mono text-accent font-bold">
                        {routingDecision.selected} ({Number(routingDecision.score).toFixed(1)})
                      </span>
                    </div>
                    <div className="text-text-secondary leading-relaxed text-sm">
                      <strong>Rationale:</strong> {routingDecision.rationale}
                    </div>
                    <div className="border-t border-border pt-3">
                      <span className="font-mono text-xs text-text-tertiary uppercase font-bold block mb-2">
                        Candidate Ranking
                      </span>
                      <div className="flex flex-col gap-2 font-mono text-xs">
                        {(routingDecision.candidates ?? []).map((c: any, i: number) => (
                          <div
                            key={c.model_id}
                            className={`p-2.5 rounded bg-bg-elevated border flex justify-between ${
                              i === 0 ? 'border-accent/40' : 'border-border'
                            }`}
                          >
                            <span className={i === 0 ? 'text-text-primary font-medium' : 'text-text-secondary'}>
                              {i + 1}. {c.model_id}
                            </span>
                            <span className={i === 0 ? 'text-accent font-bold' : 'text-text-tertiary'}>
                              Score: {Number(c.total).toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {(routingDecision.rejected ?? []).length > 0 && (
                      <div className="border-t border-border pt-3">
                        <span className="font-mono text-xs text-text-tertiary uppercase font-bold block mb-2">
                          Rejected Candidates
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {routingDecision.rejected.map((r: any) => (
                            <div key={r.model_id} className="p-2 rounded bg-error/10 border border-error/20 font-mono text-xs text-error">
                              {r.model_id}: {r.detail}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'retrieval' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="font-semibold text-text-primary">Retrieved Grounding Chunks</span>
                  <span className="font-mono text-ok text-xs font-semibold">{citations.length} cited</span>
                </div>
                {citations.length === 0 && (
                  <p className="text-xs text-text-tertiary font-mono">
                    No citations -- either nothing relevant was indexed, or the run answered from general knowledge.
                  </p>
                )}
                {citations.map((c: any) => (
                  <div key={c.chunk_id} className="p-3 rounded bg-bg-elevated border border-border flex flex-col gap-1.5 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-accent font-bold">
                        {c.marker} {c.doc_title ?? c.document_id}
                        {c.section_path ? ` > ${c.section_path}` : ''}
                      </span>
                      {c.score != null && <span className="text-ok">{Number(c.score).toFixed(2)} score</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'reply' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border font-mono text-xs">
                  <span className="text-text-secondary">
                    Total Tokens: <strong>{run.total_tokens || '—'}</strong>
                  </span>
                </div>
                <div className="bg-bg-base border border-border rounded p-3 font-mono text-xs sm:text-sm leading-relaxed text-text-primary whitespace-pre-line max-h-96 overflow-y-auto">
                  {reply ?? 'No reply recorded yet.'}
                </div>
              </div>
            )}

            {tab === 'artifacts' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="font-semibold text-text-primary">Deliverable Files</span>
                  <span className="font-mono text-ok text-xs font-semibold">{(artifacts ?? []).length} produced</span>
                </div>
                {(artifacts ?? []).length === 0 && (
                  <p className="text-xs text-text-tertiary font-mono">No artifacts were generated by this run.</p>
                )}
                {(artifacts ?? []).map((art: any) => (
                  <div key={art.id} className="p-3 rounded bg-bg-elevated border border-border flex flex-col gap-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-accent" />
                        <span className="text-text-primary font-bold truncate">{art.filename}</span>
                      </div>
                      <span className="text-text-tertiary">{((art.size_bytes ?? 0) / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="text-xs text-text-tertiary truncate">SHA-256: {art.sha256}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
