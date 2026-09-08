'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, useIsMock } from '../../lib/api';
import { RunRead } from '../../lib/types';
import { MOCK_RUN } from '../../lib/mockData';
import { MockBadge } from '../../components/primitives/MockBadge';
import { PlayCircle, Clock, ExternalLink, Cpu, CheckCircle2 } from 'lucide-react';

const FALLBACK_RUNS: RunRead[] = [
  MOCK_RUN,
  {
    id: "7b12e091a182410a8bc0192847192840",
    prompt: "Synthesize vibration anomalies across CDU-100 sensor logs and draft maintenance schedule.",
    status: "completed" as const,
    execution_mode: "demo" as const,
    project_id: "default-psu",
    agent_id: "industrial-inspector",
    budget: {
      max_steps: 8,
      max_tool_calls: 12,
      max_wall_time_s: 240,
      used_steps: 4,
      used_tool_calls: 2,
      used_wall_time_s: 4.8
    },
    models_used: ["llama-3-1-70b"],
    attachments: [],
    total_tokens: 890,
    started_at: "2026-09-07T16:20:00.000000Z",
    created_at: "2026-09-07T16:20:00.000000Z"
  }
];

export default function RunsListPage() {
  const isRunsMock = useIsMock('runs');
  const [runs, setRuns] = useState<RunRead[]>(FALLBACK_RUNS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRuns() {
      try {
        const data = await api.getRuns();
        if (data && data.length > 0) {
          setRuns(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadRuns();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Agent Execution Runs
            </h1>
            {isRunsMock && <MockBadge label="Mock Ledger" size="sm" />}
          </div>
          <p className="text-xs text-text-secondary">
            Audit history of autonomous agent tasks, step graphs, and generated deliverables
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {runs.map((r) => (
          <Link
            key={r.id}
            href={`/runs/${r.id}`}
            className="p-4 rounded-md bg-bg-panel border border-border hover:border-accent transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded bg-bg-elevated border border-border flex items-center justify-center flex-shrink-0 text-accent group-hover:scale-110 transition-transform">
                <PlayCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono font-bold text-text-primary">
                    Run {r.id.slice(0, 8)}
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-xs uppercase font-bold bg-ok-muted text-ok border border-ok/30">
                    {r.status}
                  </span>
                  {isRunsMock && <MockBadge label="Simulated" size="sm" />}
                </div>
                <p className="text-sm text-text-secondary line-clamp-1 mb-1 font-sans">
                  {r.prompt}
                </p>
                <div className="text-xs font-mono text-text-tertiary flex items-center gap-3">
                  <span>Models: {r.models_used.join(', ')}</span>
                  <span>·</span>
                  <span>{r.total_tokens} tokens</span>
                  <span>·</span>
                  <span>{r.budget.used_steps} steps</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-accent text-xs font-mono self-end sm:self-center">
              <span>Inspect DAG</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
