'use client';

import React, { useState, useEffect } from 'react';
import { api, useIsMock } from '../../lib/api';
import { AuditRecord } from '../../lib/types';
import { MockBadge } from '../../components/primitives/MockBadge';
import {
  FileCheck2,
  Search,
  Filter,
  Download,
  Code,
  ShieldCheck,
  ChevronRight,
  X
} from 'lucide-react';

export default function AuditExplorerPage() {
  const isAuditMock = useIsMock('audit');
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [filterType, setFilterType] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsData, typesData] = await Promise.all([
        api.getAuditLogs(),
        api.getAuditEventTypes(),
      ]);
      setLogs(logsData);
      setEventTypes(typesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.exportAuditManifest();
      alert(`Exported signed manifest: ${res.filename} (${(res.size_bytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const filtered = logs.filter((l) => {
    if (filterType === 'ALL') return true;
    return l.type.includes(filterType);
  });

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Audit Explorer
            </h1>
            {isAuditMock && <MockBadge label="Mock Event Log" size="sm" />}
          </div>
          <p className="text-sm text-text-secondary">
            Tamper-evident append-only event store with monotonic sequence IDs and verifiable telemetry
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-bg-panel border border-border hover:border-accent text-xs font-mono text-text-primary hover:text-accent transition-colors self-start sm:self-auto font-medium"
        >
          <Download className="w-4 h-4" />
          <span>{exporting ? 'Generating Bundle...' : 'Export Manifest (.zip)'}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-text-tertiary">Filter Event Type:</span>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-bg-panel border border-border rounded-md px-3 py-1.5 text-xs text-text-secondary font-mono focus:border-accent outline-none"
        >
          <option value="ALL">All Event Types ({(eventTypes.length || 25)})</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Sequential Event Table */}
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
                if (r.type.includes('BLOCKED')) {
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
                      <span className={`px-2 py-0.5 rounded border text-xs font-bold ${badgeColor}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="p-3 text-text-tertiary">
                      {r.duration_ms ? `${r.duration_ms}ms` : '—'}
                    </td>
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

      {/* Raw Payload Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border rounded-lg max-w-xl w-full p-5 shadow-2xl flex flex-col gap-3 font-mono">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text-primary">
                  Event #{selectedRecord.seq}: {selectedRecord.type}
                </span>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-text-tertiary hover:text-text-primary"
              >
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
