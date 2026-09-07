'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRunStreamStore } from '../../../stores/runStreamStore';
import {
  ChevronLeft,
  PlayCircle,
  Clock,
  Cpu,
  FileCheck2,
  Download,
  Terminal,
  Layers,
  Sparkles,
  CheckCircle2,
  FileText,
  AlertCircle
} from 'lucide-react';

export default function RunDetailPage() {
  const params = useParams();
  const runId = (params?.id as string) || '8a31e847';
  
  const {
    prompt,
    status,
    totalTokens,
    tokenStream,
    steps,
    artifacts,
    timelineEvents,
    activeNodeId,
    setActiveNodeId,
    selectedInspectorTab,
    setSelectedInspectorTab,
  } = useRunStreamStore();

  const [timelineFilter, setTimelineFilter] = useState('ALL');

  const filteredEvents = timelineEvents.filter((e) => {
    if (timelineFilter === 'ALL') return true;
    return e.type.includes(timelineFilter);
  });

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      {/* Top Banner & Budget Tracker matching FRONTEND_SPECIFICATION.md Section 4.2 */}
      <div className="bg-bg-panel border-b border-border px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs flex-shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/runs"
            className="flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors font-mono"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Runs</span>
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="font-mono font-bold text-text-primary">Run {runId.slice(0, 8)}</span>
          <span className="text-text-tertiary truncate max-w-md hidden md:inline">
            · {prompt}
          </span>
          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-ok-muted text-ok border border-ok/30">
            {status}
          </span>
          <span className="font-mono text-text-tertiary">· 7.02s</span>
        </div>

        {/* Budget stats */}
        <div className="flex items-center gap-3 font-mono text-[11px] text-text-secondary flex-shrink-0">
          <span>Budget:</span>
          <span className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border">
            Steps [5/8]
          </span>
          <span className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border">
            Tools [2/12]
          </span>
          <span className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border">
            Time [7s/240s]
          </span>
          <button
            onClick={() => alert('Exporting signed Ed25519 audit manifest bundle...')}
            className="px-2.5 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 font-semibold transition-colors"
          >
            Export Audit
          </button>
        </div>
      </div>

      {/* 3-Pane Body matching FRONTEND_SPECIFICATION.md Section 4.2 */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane: Timeline (280px) */}
        <div className="w-full lg:w-72 bg-bg-panel border-b lg:border-b-0 lg:border-r border-border flex flex-col flex-shrink-0">
          {/* Timeline Header & Filters */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold text-text-primary uppercase font-mono tracking-wider">
              Timeline Events
            </span>
            <select
              value={timelineFilter}
              onChange={(e) => setTimelineFilter(e.target.value)}
              className="bg-bg-elevated border border-border rounded px-2 py-0.5 text-[10px] font-mono text-text-secondary outline-none"
            >
              <option value="ALL">All Events</option>
              <option value="NODE">Nodes</option>
              <option value="MODEL">Routing</option>
              <option value="RAG">RAG</option>
              <option value="FILE">Artifacts</option>
            </select>
          </div>

          {/* Chronological Event List */}
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
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
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-text-tertiary">{evt.ts}</span>
                  <span className="font-semibold text-text-primary truncate ml-1">{evt.type}</span>
                </div>
                {evt.payload && (
                  <div className="text-[11px] text-text-secondary line-clamp-1 font-mono">
                    {evt.payload.label || evt.payload.model_id || evt.payload.filename || JSON.stringify(evt.payload)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center Pane: React Flow Execution Graph */}
        <div className="flex-1 bg-[#0A0C10] p-6 relative overflow-hidden flex flex-col items-center justify-center">
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#2E3542 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-4">
            Directed Execution Acyclic Graph (DAG) · Click any node to inspect
          </div>

          {/* Vertical Flowchart Nodes matching specification */}
          <div className="flex flex-col items-center gap-5 z-10 w-full max-w-sm">
            {steps.map((step, idx) => {
              const isSelected = activeNodeId === step.node_id;

              return (
                <React.Fragment key={step.id}>
                  {/* Step Node Card */}
                  <div
                    onClick={() => setActiveNodeId(step.node_id)}
                    className={`w-full p-3.5 rounded-md border cursor-pointer transition-all flex items-center justify-between bg-bg-panel shadow-lg ${
                      isSelected
                        ? 'border-accent shadow-glow-accent scale-[1.02]'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-ok flex-shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-text-primary font-mono">
                          {step.label || step.node_id}
                        </div>
                        <div className="text-[11px] text-text-tertiary font-mono">
                          {step.kind}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono text-[11px]">
                      <span className="text-text-tertiary">{step.duration_ms}ms</span>
                    </div>
                  </div>

                  {/* Connecting Arrow */}
                  {idx < steps.length - 1 && (
                    <div className="w-0.5 h-4 bg-[#2E3542] relative flex items-center justify-center">
                      <div className="w-1.5 h-1.5 border-b-2 border-r-2 border-[#2E3542] rotate-45 translate-y-1" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Context-Sensitive Inspector (380px) */}
        <div className="w-full lg:w-96 bg-bg-panel border-t lg:border-t-0 lg:border-l border-border flex flex-col flex-shrink-0 overflow-y-auto">
          {/* Tabs */}
          <div className="flex items-center border-b border-border text-xs font-mono">
            {(['routing', 'rag', 'tokens', 'artifacts'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedInspectorTab(tab)}
                className={`flex-1 py-2.5 capitalize transition-colors border-b-2 -mb-px text-center ${
                  selectedInspectorTab === tab
                    ? 'border-accent text-accent font-semibold'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Inspector Content */}
          <div className="p-4 flex flex-col gap-4 text-xs">
            {selectedInspectorTab === 'routing' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="font-semibold text-text-primary">Winning Model</span>
                  <span className="font-mono text-accent font-bold">vision-document (92.4)</span>
                </div>

                <div className="text-text-secondary leading-relaxed">
                  <strong>Rationale:</strong> High vision capability score (0.88), model resident in memory, matches required input modality.
                </div>

                {/* Candidate Ranking */}
                <div className="border-t border-border pt-3">
                  <span className="font-mono text-[11px] text-text-tertiary uppercase font-bold block mb-2">
                    Candidate Evaluation Ranking
                  </span>
                  <div className="flex flex-col gap-2 font-mono text-[11px]">
                    <div className="p-2.5 rounded bg-bg-elevated border border-accent/40 flex justify-between">
                      <span className="text-text-primary">1. vision-document</span>
                      <span className="text-accent font-bold">Score: 92.4</span>
                    </div>
                    <div className="p-2.5 rounded bg-bg-elevated border border-border flex justify-between">
                      <span className="text-text-secondary">2. general-reasoning</span>
                      <span className="text-text-tertiary">Score: 71.0</span>
                    </div>
                  </div>
                </div>

                {/* Eliminated models */}
                <div className="border-t border-border pt-3">
                  <span className="font-mono text-[11px] text-text-tertiary uppercase font-bold block mb-2">
                    Rejected Candidates
                  </span>
                  <div className="p-2 rounded bg-error/10 border border-error/20 font-mono text-[11px] text-error">
                    reason-8b: Eliminated (Missing required vision capability)
                  </div>
                </div>
              </div>
            )}

            {selectedInspectorTab === 'rag' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="font-semibold text-text-primary">Retrieved Grounding Chunks</span>
                  <span className="font-mono text-ok">3 Cited</span>
                </div>

                <div className="p-3 rounded bg-bg-elevated border border-border flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-accent font-bold">[C1] e102_report.md &gt; p.1</span>
                    <span className="text-ok">0.94 score</span>
                  </div>
                  <p className="font-sans text-text-secondary">
                    Measured wall thickness: 6.8 mm across all tube passes. ASME Section VIII retirement limit is 5.0 mm.
                  </p>
                </div>
              </div>
            )}

            {selectedInspectorTab === 'tokens' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border font-mono text-[11px]">
                  <span className="text-text-secondary">Total Tokens: <strong>1,240</strong></span>
                  <span className="text-text-secondary">Speed: <strong>44 tok/s</strong></span>
                </div>

                <div className="bg-bg-base border border-border rounded p-3 font-mono text-[11px] leading-relaxed text-text-primary whitespace-pre-line max-h-96 overflow-y-auto">
                  {tokenStream}
                </div>
              </div>
            )}

            {selectedInspectorTab === 'artifacts' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="font-semibold text-text-primary">Deliverable Files</span>
                  <span className="font-mono text-ok">{artifacts.length} Produced</span>
                </div>

                {artifacts.map((art) => (
                  <div
                    key={art.id}
                    className="p-3 rounded bg-bg-elevated border border-border flex flex-col gap-2 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-accent" />
                        <span className="text-text-primary font-bold truncate">{art.filename}</span>
                      </div>
                      <span className="text-text-tertiary">{(art.size_bytes / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="text-[10px] text-text-tertiary truncate">
                      SHA-256: {art.sha256}
                    </div>
                    <button
                      onClick={() => alert(`Downloaded ${art.filename} from local sandbox.`)}
                      className="mt-1 w-full py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File</span>
                    </button>
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
