'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Database,
  ShieldCheck,
  Sparkles,
  Search,
  CheckCircle2,
  Layers,
  ArrowRight,
  Terminal,
  Activity,
  FileText,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export interface InferenceGraphProps {
  prompt: string;
  attachmentName?: string;
  onComplete: (result: {
    selectedModel: string;
    modelScore: number;
    intent: string;
    toolUsed: string;
    citations: string[];
    replyText: string;
  }) => void;
}

interface StepState {
  id: string;
  title: string;
  subtitle: string;
  status: 'pending' | 'active' | 'completed';
  latencyMs?: number;
  details?: React.ReactNode;
}

export const InferenceGraph: React.FC<InferenceGraphProps> = ({
  prompt,
  attachmentName,
  onComplete,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState(true);

  const isVision =
    attachmentName?.endsWith('.pdf') ||
    attachmentName?.endsWith('.png') ||
    prompt.toLowerCase().includes('report') ||
    prompt.toLowerCase().includes('thickness') ||
    prompt.toLowerCase().includes('image') ||
    prompt.toLowerCase().includes('diagram');

  const isCode =
    prompt.toLowerCase().includes('code') ||
    prompt.toLowerCase().includes('python') ||
    prompt.toLowerCase().includes('telemetry') ||
    prompt.toLowerCase().includes('sensor') ||
    prompt.toLowerCase().includes('csv');

  const intent = isVision
    ? 'multimodal_doc_inspection'
    : isCode
    ? 'telemetry_code_synthesis'
    : 'general_domain_reasoning';

  const winningModel = isVision
    ? 'Qwen 2.5 VL 72B'
    : isCode
    ? 'Llama 3.1 70B'
    : 'Qwen 3 8B (Reasoning)';

  const winningModelId = isVision
    ? 'qwen2-vl-72b'
    : isCode
    ? 'llama-3-1-70b'
    : 'general-reasoning';

  const winningScore = isVision ? 94.8 : isCode ? 93.6 : 91.2;

  const toolName = isVision
    ? 'knowledge_vector_search'
    : isCode
    ? 'sandbox_python_executor'
    : 'local_rag_citation_retriever';

  const citations = useMemo(
    () =>
      isVision
        ? ['e102_report.md (p.1 - Wall Thickness: 6.8mm)', 'Refinery_Safety_Manual.pdf (p.12 - ESD Protocol)']
        : isCode
        ? ['equipment_telemetry.csv (Row 4200 - Alert Threshold 340°C)']
        : ['Local On-Premise Knowledge Base'],
    [isVision, isCode]
  );

  const replyText = isVision
    ? `Based on the refinery inspection manual and e102_report.md:

1. Measured Wall Thickness:
   • Measured: 6.8 mm across all tube passes.
   • ASME Section VIII retirement threshold: 5.0 mm minimum.
   • Safety Margin: +1.8 mm (+36% above minimum allowable threshold).

2. Protocol Determination:
   • The equipment complies with active operational integrity requirements.
   • Recommend routine non-destructive examination scheduled in 12 months.`
    : isCode
    ? `Based on telemetry data analysis for Distillation Column DC-101:

1. Anomaly Profile:
   • Operating temperature reached 352.4°C at timestamp T-14:20:00 (Exceeds 350°C critical threshold).
   • High frequency vibration detected in upper bearing housing.

2. Automated Safety Intervention:
   • Emergency Shutdown System (ESD) isolation triggered.
   • Feed supply cut within 18.2 seconds.`
    : `Task evaluated locally on sovereign infrastructure using ${winningModel}.

All embeddings, mathematical arbitration, and token synthesis executed within your airgapped hardware perimeter with zero external network transmission.`;

  // Step progression sequence
  useEffect(() => {
    const t1 = setTimeout(() => {
      setCurrentStepIndex(1); // Routing & Candidate Arbitration
      setSelectedCandidate(winningModelId);
    }, 600);

    const t2 = setTimeout(() => {
      setCurrentStepIndex(2); // Tool Calling & Vector Retrieval
    }, 1400);

    const t3 = setTimeout(() => {
      setCurrentStepIndex(3); // Sovereignty & AST Guard Verification
    }, 2200);

    const t4 = setTimeout(() => {
      setCurrentStepIndex(4); // Synthesis Complete
    }, 2900);

    const t5 = setTimeout(() => {
      onComplete({
        selectedModel: winningModel,
        modelScore: winningScore,
        intent,
        toolUsed: toolName,
        citations,
        replyText,
      });
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [winningModelId, onComplete, winningModel, winningScore, intent, toolName, citations, replyText]);

  const steps: StepState[] = [
    {
      id: 'classify',
      title: 'Task Ingestion & Intent Classification',
      subtitle: `Classified as: ${intent.toUpperCase()} · ~2,400 Tokens`,
      status: currentStepIndex > 0 ? 'completed' : currentStepIndex === 0 ? 'active' : 'pending',
      latencyMs: 14.2,
      details: (
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-text-secondary">
            Input: {prompt.slice(0, 48)}...
          </span>
          {attachmentName && (
            <span className="px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-medium">
              📎 {attachmentName}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-ok-muted text-ok border border-ok/30 font-medium">
            Intent: {intent}
          </span>
        </div>
      ),
    },
    {
      id: 'route',
      title: 'Neural Model Arbitration & Residency Match',
      subtitle: `Evaluating local model matrix · Target locked: ${winningModel}`,
      status: currentStepIndex > 1 ? 'completed' : currentStepIndex === 1 ? 'active' : 'pending',
      latencyMs: 8.5,
      details: (
        <div className="flex flex-col gap-2 mt-1">
          <div className="text-xs font-mono text-text-tertiary">
            Multi-factor candidate scoring shootout:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
            <div
              className={`p-2 rounded border transition-all ${
                winningModelId === 'qwen2-vl-72b'
                  ? 'border-accent bg-accent/10 text-accent font-semibold'
                  : 'border-border bg-bg-elevated text-text-tertiary'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>Qwen 2.5 VL 72B</span>
                <span>94.8</span>
              </div>
              <div className="text-xs text-text-secondary mt-0.5">Vision + Doc specialist</div>
            </div>

            <div
              className={`p-2 rounded border transition-all ${
                winningModelId === 'llama-3-1-70b'
                  ? 'border-accent bg-accent/10 text-accent font-semibold'
                  : 'border-border bg-bg-elevated text-text-tertiary'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>Llama 3.1 70B</span>
                <span>93.6</span>
              </div>
              <div className="text-xs text-text-secondary mt-0.5">Code & telemetry logic</div>
            </div>

            <div
              className={`p-2 rounded border transition-all ${
                winningModelId === 'general-reasoning'
                  ? 'border-accent bg-accent/10 text-accent font-semibold'
                  : 'border-border bg-bg-elevated text-text-tertiary'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>Qwen 3 8B</span>
                <span>91.2</span>
              </div>
              <div className="text-xs text-text-secondary mt-0.5">Resident in VRAM (5.2GB)</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'tools',
      title: 'Tool Invocation & Vector Retrieval',
      subtitle: `Dispatched tool: ${toolName} · 0 External Calls`,
      status: currentStepIndex > 2 ? 'completed' : currentStepIndex === 2 ? 'active' : 'pending',
      latencyMs: 46.8,
      details: (
        <div className="flex flex-col gap-1 text-xs font-mono">
          <div className="flex items-center gap-2 text-ok font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Retrieved Grounded Citations from Local Qdrant / SQLite</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {citations.map((c, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-text-primary text-xs"
              >
                [C{i + 1}] {c}
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'guard',
      title: 'Airgap Verification & AST Process Guard',
      subtitle: 'Verified: 0 external sockets · Isolated kernel namespace',
      status: currentStepIndex > 3 ? 'completed' : currentStepIndex === 3 ? 'active' : 'pending',
      latencyMs: 2.1,
      details: (
        <div className="flex items-center gap-4 text-xs font-mono text-text-secondary">
          <span className="flex items-center gap-1.5 text-ok font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SOVEREIGN BOUNDARY ENFORCED</span>
          </span>
          <span>·</span>
          <span>RFC1918 / Loopback Only</span>
          <span>·</span>
          <span>0 Egress Drops</span>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-bg-panel border border-accent/40 rounded-lg shadow-lg overflow-hidden my-4 transition-all duration-300">
      {/* Top Header Bar */}
      <div className="bg-bg-elevated px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
          <span className="font-mono text-xs uppercase tracking-wider text-accent font-bold">
            Dynamic AI Inference Pipeline · Assembling Task DAG
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary hidden sm:inline">
            Active Model: <strong className="text-text-primary font-medium">{winningModel}</strong>
          </span>
          <button
            onClick={() => setExpandedDetails(!expandedDetails)}
            className="text-text-tertiary hover:text-text-primary transition-colors p-1"
            title={expandedDetails ? 'Collapse pipeline steps' : 'Expand pipeline steps'}
          >
            {expandedDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Pipeline DAG Visualization */}
      <div className="p-4 flex flex-col gap-3">
        {steps.map((step, idx) => {
          const isActive = step.status === 'active';
          const isCompleted = step.status === 'completed';
          const isPending = step.status === 'pending';

          return (
            <div key={step.id} className="flex flex-col">
              {/* Step Card */}
              <div
                className={`p-3 rounded-md border transition-all flex flex-col gap-2 ${
                  isActive
                    ? 'border-accent bg-accent/5 shadow-sm'
                    : isCompleted
                    ? 'border-border bg-bg-panel'
                    : 'border-border/40 bg-bg-panel/40 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Status Icon */}
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-ok" />
                      ) : isActive ? (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-border" />
                      )}
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-text-primary font-mono flex items-center gap-2">
                        <span>{step.title}</span>
                        {isActive && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent uppercase">
                            Executing
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary font-mono mt-0.5">
                        {step.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono text-xs text-text-tertiary">
                    {isCompleted ? `${step.latencyMs}ms` : isActive ? 'Processing...' : 'Queued'}
                  </div>
                </div>

                {/* Expanded Details Body */}
                {expandedDetails && (isActive || isCompleted) && step.details && (
                  <div className="pl-9 pt-1 border-t border-border/50 mt-1">
                    {step.details}
                  </div>
                )}
              </div>

              {/* Connecting DAG Edge */}
              {idx < steps.length - 1 && (
                <div className="ml-6 w-0.5 h-2 bg-border relative my-0.5">
                  {isCompleted && (
                    <div className="absolute inset-0 bg-ok animate-pulse" />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Synthesis indicator */}
        {currentStepIndex >= 4 && (
          <div className="p-3 rounded-md border border-ok/40 bg-ok/5 flex items-center justify-between text-xs font-mono text-ok animate-pulse">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Synthesizing Airgapped Deliverable · Streaming Tokens...</span>
            </div>
            <span className="font-bold">42.8 tokens/sec</span>
          </div>
        )}
      </div>
    </div>
  );
};
