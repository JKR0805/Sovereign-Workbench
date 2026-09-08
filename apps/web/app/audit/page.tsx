'use client';

import React, { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import { LoadingState, EmptyState } from '../../components/primitives/LoadingState';
import type { AuditEvent } from '../../lib/types';
import { Download, ChevronRight, X, Loader2 } from 'lucide-react';

export default function AuditExplorerPage() {
  const { data: logsPage, loading: logsLoading, error: logsError, reload: reloadLogs } = useApiResource(
    () => api.getAuditLogs({ limit: 500 }),
    []
  );
  const { data: eventTypes } = useApiResource(() => api.getAuditEventTypes(), []);

  const [selectedRecord, setSelectedRecord] = useState<AuditEvent | null>(null);
  const [filterType, setFilterType] = useState('ALL');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const logs = logsPage?.items ?? [];

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await api.exportAuditManifest();
      // The endpoint currently always raises 501 (not implemented) --
      // signed export requires Ed25519 key generation the backend does not
      // yet do. If it ever succeeds, there is nothing more to do here since
      // there is no download to trigger yet either.
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'not_implemented'
          ? 'Signed audit export is not implemented yet: it requires Ed25519 key generation at first boot, which the backend does not do.'
          : err instanceof Error
          ? err.message
          : 'Export failed.';
      setExportError(message);
    } finally {
      setExporting(false);
    }
  };

  const filtered = logs.filter((l) => (filterType === 'ALL' ? true : l.type.includes(filterType)));

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Audit Explorer</h1>
          <p className="text-sm text-text-secondary">
            Append-only event store with monotonic sequence IDs
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-bg-panel border border-border hover:border-accent text-xs font-mono text-text-primary hover:text-accent transition-colors self-start sm:self-auto font-medium disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{exporting ? 'Requesting export...' : 'Export Manifest'}</span>
          </button>
          {exportError && <span className="text-xs font-mono text-warn max-w-xs text-right">{exportError}</span>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-text-tertiary">Filter Event Type:</span>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-bg-panel border border-border rounded-md px-3 py-1.5 text-xs text-text-secondary font-mono focus:border-accent outline-none"
        >
          <option value="ALL">All Event Types ({eventTypes?.length ?? 0})</option>
          {(eventTypes ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {logsLoading && <LoadingState label="Loading audit log..." />}
      {logsError && <ErrorState error={logsError} onRetry={reloadLogs} />}
      {!logsLoading && !logsError && filtered.length === 0 && (
        <EmptyState label="No events recorded" detail="Events appear here as runs, ingestions and egress attempts happen." />
      )}

      {!logsLoading && !logsError && filtered.length > 0 && (
        <div className="bg-bg-panel border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm font-mono">
              <thead>
                <tr className="border-b border-border text-text-tertiary text-xs bg-bg-elevated/40">
                  <th className="p-3">Seq #</th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Stream / Run ID</th>
                  <th className="p-3">Event Type</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  let badgeColor = 'bg-accent/15 text-accent border-accent/30';
                  if (r.type.includes('BLOCKED') || r.type.includes('FAILED')) {
                    badgeColor = 'bg-error/15 text-error border-error/30';
                  } else if (r.type.includes('PASSED') || r.type.includes('COMPLETED')) {
                    badgeColor = 'bg-ok/15 text-ok border-ok/30';
                  }

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRecord(r)}
                      className="hover:bg-bg-elevated/50 cursor-pointer transition-colors"
                    >
                      <td className="p-3 text-text-primary font-bold">#{r.seq}</td>
                      <td className="p-3 text-text-secondary">{r.ts}</td>
                      <td className="p-3 text-text-secondary truncate max-w-xs">{r.stream}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded border text-xs font-bold ${badgeColor}`}>{r.type}</span>
                      </td>
                      <td className="p-3 text-text-tertiary">{r.duration_ms != null ? `${r.duration_ms}ms` : '—'}</td>
                      <td className="p-3 text-right text-text-tertiary">
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRecord && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border rounded-lg max-w-xl w-full p-5 shadow-2xl flex flex-col gap-3 font-mono">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-sm font-bold text-text-primary">
                Event #{selectedRecord.seq}: {selectedRecord.type}
              </span>
              <button onClick={() => setSelectedRecord(null)} className="text-text-tertiary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-text-secondary">
              Stream: <strong className="text-text-primary">{selectedRecord.stream}</strong> · Timestamp: {selectedRecord.ts}
            </div>
            <div className="bg-bg-base border border-border rounded p-3 text-xs text-text-primary overflow-x-auto max-h-72">
              <pre>{JSON.stringify(selectedRecord.payload, null, 2)}</pre>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-3 py-1.5 rounded bg-bg-panel border border-border text-xs text-text-secondary hover:text-text-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
