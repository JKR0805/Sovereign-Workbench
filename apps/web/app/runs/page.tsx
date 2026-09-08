'use client';

import React from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import { LoadingState, EmptyState } from '../../components/primitives/LoadingState';
import { PlayCircle, ExternalLink } from 'lucide-react';

export default function RunsListPage() {
  const { data, loading, error, reload } = useApiResource(() => api.getRuns({ limit: 50 }), []);
  const runs = data?.items ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Agent Execution Runs</h1>
          <p className="text-xs text-text-secondary">
            Audit history of agent tasks, step graphs, and generated deliverables
          </p>
        </div>
      </div>

      {loading && <LoadingState label="Loading runs..." />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && runs.length === 0 && (
        <EmptyState label="No runs yet" detail="Runs created from the chat composer or API will appear here." />
      )}

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
                  <span className="text-sm font-mono font-bold text-text-primary">Run {r.id.slice(0, 8)}</span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-xs uppercase font-bold border ${
                      r.status === 'completed'
                        ? 'bg-ok-muted text-ok border-ok/30'
                        : r.status === 'failed'
                        ? 'bg-error/10 text-error border-error/30'
                        : 'bg-accent/10 text-accent border-accent/30'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-sm text-text-secondary line-clamp-1 mb-1 font-sans">{r.prompt}</p>
                <div className="text-xs font-mono text-text-tertiary flex items-center gap-3">
                  <span>Models: {r.models_used.length > 0 ? r.models_used.join(', ') : '—'}</span>
                  <span>·</span>
                  <span>{r.total_tokens} tokens</span>
                  {r.duration_ms != null && (
                    <>
                      <span>·</span>
                      <span>{(r.duration_ms / 1000).toFixed(1)}s</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-accent text-xs font-mono self-end sm:self-center">
              <span>Inspect</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
