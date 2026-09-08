'use client';

import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import { LoadingState } from '../../components/primitives/LoadingState';
import { MetricStat } from '../../components/primitives/MetricStat';
import type { AnalyticsWindow } from '../../lib/types';
import { MessageSquare, Timer, Database, ShieldCheck } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  Completed: '#35C08A',
  Failed: '#E5484D',
  Cancelled: '#8B94A6',
  'In progress': '#4DA3FF',
};

const MODEL_COLORS = ['#4DA3FF', '#35C08A', '#A78BFA', '#E0A32E', '#4DD4AC', '#E5484D'];

export default function AnalyticsPage() {
  const [window, setWindow] = useState<AnalyticsWindow>('7d');
  const { data: summary, loading, error, reload } = useApiResource(() => api.getAnalyticsSummary(window), [window]);

  const statusData = summary
    ? [
        { name: 'Completed', value: summary.completed_runs },
        { name: 'Failed', value: summary.failed_runs },
        { name: 'Cancelled', value: summary.cancelled_runs },
        { name: 'In progress', value: summary.in_progress_runs },
      ].filter((d) => d.value > 0)
    : [];

  const modelData = summary
    ? Object.entries(summary.model_usage)
        .sort((a, b) => b[1] - a[1])
        .map(([model_id, count]) => ({ model_id, count }))
    : [];

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">System Analytics</h1>
          <p className="text-xs text-text-secondary">Aggregated from the runs, events and network ledgers -- no simulated series</p>
        </div>

        <select
          value={window}
          onChange={(e) => setWindow(e.target.value as AnalyticsWindow)}
          className="bg-bg-panel border border-border rounded-md px-3 py-1.5 text-xs text-text-secondary font-mono focus:border-accent outline-none"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {loading && <LoadingState label="Aggregating analytics..." />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricStat label="Total Runs" value={summary.total_runs} icon={<MessageSquare className="w-4 h-4 text-accent" />} />
            <MetricStat
              label="p50 / p95 Duration"
              value={
                summary.p50_duration_ms != null
                  ? `${(summary.p50_duration_ms / 1000).toFixed(1)}s / ${((summary.p95_duration_ms ?? 0) / 1000).toFixed(1)}s`
                  : '—'
              }
              icon={<Timer className="w-4 h-4 text-ok" />}
            />
            <MetricStat
              label="Total Tokens"
              value={summary.total_tokens > 0 ? summary.total_tokens.toLocaleString() : summary.tokens_measured_runs === 0 ? 'unmeasured' : '0'}
              icon={<Database className="w-4 h-4 text-modality-vision" />}
            />
            <MetricStat
              label="Grounded Retrievals"
              value={summary.retrieval_total_count > 0 ? `${summary.retrieval_grounded_count}/${summary.retrieval_total_count}` : '—'}
              icon={<ShieldCheck className="w-4 h-4 text-warn" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-bg-panel border border-border rounded-md p-5 flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">Model Usage</h2>
                <span className="text-xs text-text-tertiary">Runs per selected model, this window</span>
              </div>

              {modelData.length === 0 ? (
                <p className="text-xs text-text-tertiary font-mono py-8 text-center">No runs recorded in this window.</p>
              ) : (
                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modelData} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid stroke="#232833" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" stroke="#5A6376" fontSize={11} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="model_id" stroke="#5A6376" fontSize={11} tickLine={false} width={140} />
                      <Tooltip contentStyle={{ backgroundColor: '#171B22', borderColor: '#2E3542', borderRadius: '4px', fontSize: '12px' }} />
                      <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                        {modelData.map((_, i) => (
                          <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-bg-panel border border-border rounded-md p-5 flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono mb-1">Run Status</h2>
                <span className="text-xs text-text-tertiary">Outcome distribution, this window</span>
              </div>

              {statusData.length === 0 ? (
                <p className="text-xs text-text-tertiary font-mono py-8 text-center">No runs recorded.</p>
              ) : (
                <div className="h-44 w-full my-2 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value">
                        {statusData.map((entry) => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#171B22', borderColor: '#2E3542', borderRadius: '4px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="flex flex-col gap-1.5 pt-2 border-t border-border text-xs font-mono">
                {statusData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.name] }} />
                      <span className="text-text-secondary">{item.name}</span>
                    </div>
                    <span className="text-text-primary font-bold">{item.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-text-secondary">Egress blocked / allowed</span>
                  <span className="text-text-primary font-bold">
                    {summary.egress_blocked_count} / {summary.egress_allowed_count}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
