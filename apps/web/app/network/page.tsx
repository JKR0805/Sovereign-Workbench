'use client';

import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import { LoadingState } from '../../components/primitives/LoadingState';
import { useShellStore } from '../../stores/shellStore';
import { AlertTriangle, Lock, Loader2 } from 'lucide-react';

export default function NetworkSovereigntyPage() {
  const { sovereigntyAlert, triggerEgressPulse } = useShellStore();
  const { data: snapshot, loading: snapshotLoading, error: snapshotError, reload: reloadSnapshot } = useApiResource(
    () => api.getNetworkSnapshot(),
    []
  );
  const { data: events } = useApiResource(() => api.getNetworkEvents(20), []);
  const { data: ruleset } = useApiResource(() => api.getNetworkRuleset(), []);
  const { data: selfAudit } = useApiResource(() => api.getNetworkSelfAudit(), []);

  const [probeResult, setProbeResult] = useState<{
    target: string;
    blocked: boolean;
    layer: string | null;
    detail: string;
    caller: string | null;
  } | null>(null);
  const [probing, setProbing] = useState(false);
  const [showRuleset, setShowRuleset] = useState(false);

  const handleAttemptExternalCall = async () => {
    setProbing(true);
    try {
      const res = await api.triggerEgressProbe();
      setProbeResult(res);
      triggerEgressPulse();
      reloadSnapshot();
    } catch (err) {
      setProbeResult({
        target: '(unknown)',
        blocked: true,
        layer: null,
        detail: err instanceof Error ? err.message : 'Probe request failed.',
        caller: null,
      });
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Network & Sovereignty Sentinel</h1>
          <p className="text-xs text-text-secondary">
            Live psutil socket inspection and measured egress denial telemetry
          </p>
        </div>
        <button
          onClick={handleAttemptExternalCall}
          disabled={probing}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-error hover:bg-error/90 text-white text-xs font-mono font-bold shadow-lg shadow-error/20 transition-all self-start sm:self-auto active:scale-95 disabled:opacity-60"
        >
          {probing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{probing ? 'Attempting call...' : 'ATTEMPT EXTERNAL CALL'}</span>
        </button>
      </div>

      {probeResult && (
        <div
          className={`rounded-md border p-3.5 text-xs font-mono flex flex-col gap-1 ${
            probeResult.blocked ? 'border-ok/30 bg-ok/5' : 'border-error/40 bg-error/10'
          }`}
        >
          <div className={`font-bold ${probeResult.blocked ? 'text-ok' : 'text-error'}`}>
            {probeResult.blocked ? `BLOCKED: ${probeResult.target}` : `REACHED: ${probeResult.target}`}
          </div>
          <div className="text-text-secondary">{probeResult.detail}</div>
          {probeResult.layer && <div className="text-text-tertiary">Layer: {probeResult.layer}</div>}
          {probeResult.caller && <div className="text-text-tertiary">Caller: {probeResult.caller}</div>}
        </div>
      )}

      <div
        className={`bg-bg-panel border rounded-lg p-6 relative overflow-hidden transition-all ${
          sovereigntyAlert ? 'border-error ring-2 ring-error/50 animate-egress-pulse' : 'border-border'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-ok" />
            <span className="text-xs font-bold text-text-primary font-mono uppercase">Trust Boundary</span>
          </div>
        </div>
        <div className="bg-[#090C12] border border-border-strong rounded-md p-6 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs font-mono">
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(snapshot?.services ?? {}).map(([name, url]) => (
              <div key={name} className="px-3 py-2 rounded bg-bg-elevated border border-border text-center">
                <span className="text-text-primary font-bold uppercase">{name}</span>
                <span className="text-xs text-text-tertiary block">{url}</span>
              </div>
            ))}
          </div>
          <div className="text-center sm:text-right border-t sm:border-t-0 sm:border-l border-border pt-4 sm:pt-0 sm:pl-6">
            <span className="text-error font-bold block">EGRESS POLICY: DENY ALL NON-LOOPBACK</span>
          </div>
        </div>
      </div>

      {snapshotLoading && <LoadingState label="Loading network snapshot..." />}
      {snapshotError && <ErrorState error={snapshotError} onRetry={reloadSnapshot} />}

      {snapshot && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
          <div className="bg-bg-panel border border-border rounded-md p-4">
            <span className="text-xs text-text-secondary uppercase">External Connections</span>
            <div className="text-3xl font-bold text-ok mt-1">{snapshot.external_connections ?? '—'}</div>
            <span className="text-xs text-text-tertiary">
              {snapshot.connections.available ? 'Measured' : `Unavailable: ${snapshot.connections.detail}`}
            </span>
          </div>
          <div className="bg-bg-panel border border-border rounded-md p-4">
            <span className="text-xs text-text-secondary uppercase">Blocked Calls (app)</span>
            <div className="text-3xl font-bold text-warn mt-1">{snapshot.app_blocked_total}</div>
            <span className="text-xs text-text-tertiary">In-process socket interceptions</span>
          </div>
          <div className="bg-bg-panel border border-border rounded-md p-4">
            <span className="text-xs text-text-secondary uppercase">Kernel Drop Counter</span>
            <div className="text-3xl font-bold text-error mt-1">{snapshot.nft_counter.packets ?? '—'}</div>
            <span className="text-xs text-text-tertiary">
              {snapshot.nft_counter.available ? 'nftables packet filter drops' : snapshot.nft_counter.detail}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-panel border border-border rounded-md p-4 flex flex-col gap-3">
          <h2 className="text-sm font-bold text-text-primary uppercase font-mono">Live Socket Connections (psutil)</h2>
          {!snapshot?.connections.available && (
            <p className="text-xs font-mono text-warn">{snapshot?.connections.detail ?? 'Unavailable'}</p>
          )}
          {snapshot?.connections.available && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-text-tertiary text-xs">
                    <th className="py-2">PID</th>
                    <th className="py-2">Process</th>
                    <th className="py-2">Local Address</th>
                    <th className="py-2">Remote Address</th>
                    <th className="py-2">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {snapshot.connections.rows.map((conn, idx) => (
                    <tr key={idx} className="hover:bg-bg-elevated/50">
                      <td className="py-2 text-text-secondary">{conn.pid ?? '—'}</td>
                      <td className="py-2 text-text-primary">{conn.process ?? '—'}</td>
                      <td className="py-2 text-text-secondary">{conn.laddr ?? '—'}</td>
                      <td className="py-2 text-text-secondary">{conn.raddr ?? '—'}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            conn.classification === 'external' ? 'bg-error/15 text-error' : 'bg-ok-muted text-ok'
                          }`}
                        >
                          {conn.classification.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {snapshot.connections.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-text-tertiary">
                        No active connections.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-bg-panel border border-border rounded-md p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary uppercase font-mono">Egress Ledger</h2>
            <button onClick={() => setShowRuleset(!showRuleset)} className="text-xs font-mono text-accent hover:underline">
              {showRuleset ? 'Hide nftables' : 'View nftables Rules'}
            </button>
          </div>

          {showRuleset ? (
            <pre className="bg-bg-base border border-border rounded-md p-3.5 text-xs font-mono text-text-secondary leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
              {ruleset?.available ? ruleset.text : ruleset?.detail ?? 'Loading...'}
            </pre>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto">
              {(events ?? []).length === 0 && (
                <p className="text-xs text-text-tertiary font-mono">No egress events recorded.</p>
              )}
              {(events ?? []).map((evt) => (
                <div
                  key={evt.id}
                  className={`bg-bg-elevated border rounded-md p-3.5 text-xs font-mono flex flex-col gap-1.5 ${
                    evt.verdict === 'block' ? 'border-error/30' : 'border-ok/30'
                  }`}
                >
                  <div className={`flex items-center justify-between font-bold ${evt.verdict === 'block' ? 'text-error' : 'text-ok'}`}>
                    <span>
                      {evt.verdict.toUpperCase()}: {evt.dst_host ?? evt.dst_ip ?? 'unknown'}
                      {evt.dst_port ? `:${evt.dst_port}` : ''}
                    </span>
                    <span className="text-xs text-text-tertiary">{evt.layer}</span>
                  </div>
                  {evt.stack_frame && <div className="text-xs text-text-secondary truncate">{evt.stack_frame}</div>}
                </div>
              ))}

              {selfAudit && (
                <div className="bg-bg-elevated border border-border rounded-md p-3.5 text-xs font-mono flex flex-col gap-1.5">
                  <div className={`flex items-center justify-between font-bold ${selfAudit.passed ? 'text-ok' : 'text-error'}`}>
                    <span>STARTUP SELF-AUDIT: {selfAudit.passed ? 'PASSED' : 'FAILED'}</span>
                  </div>
                  {selfAudit.assertions.map((a) => (
                    <div key={a.name} className="text-xs text-text-secondary flex justify-between">
                      <span>{a.name}</span>
                      <span className={a.outcome === 'pass' ? 'text-ok' : a.outcome === 'fail' ? 'text-error' : 'text-text-tertiary'}>
                        {a.outcome}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
