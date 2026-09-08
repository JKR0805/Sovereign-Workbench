'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useShellStore } from '../../stores/shellStore';
import { api } from '../../lib/api';
import { Shield, ShieldAlert, Cpu, ExternalLink, WifiOff } from 'lucide-react';

const POLL_INTERVAL_MS = 15000;

export const StatusBar: React.FC = () => {
  const {
    sovereigntyAlert,
    externalConnections,
    blockedTotal,
    vramUsedGb,
    activeRunId,
    activeModelName,
    backendReachable,
    setNetworkStats,
    setVramUsedGb,
    setBackendReachable,
    setCommandPaletteOpen,
  } = useShellStore();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [snapshot, residency] = await Promise.all([
          api.getNetworkSnapshot(),
          api.getModelResidency(),
        ]);
        if (cancelled) return;
        setBackendReachable(true);
        setNetworkStats(snapshot.external_connections, snapshot.app_blocked_total);
        const usedGb = residency.entries.reduce((sum, e) => sum + (e.vram_gb ?? 0), 0);
        setVramUsedGb(residency.entries.length > 0 ? usedGb : null);
      } catch {
        if (!cancelled) setBackendReachable(false);
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setNetworkStats, setVramUsedGb, setBackendReachable]);

  return (
    <footer className="h-8 bg-bg-panel border-t border-border px-3.5 flex items-center justify-between text-xs font-mono text-text-secondary select-none z-30 flex-shrink-0">
      {/* Left: Sovereignty status & models */}
      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all ${
            sovereigntyAlert
              ? 'bg-error/20 text-error border border-error/50 animate-egress-pulse font-bold'
              : 'text-ok font-semibold'
          }`}
          title={sovereigntyAlert ? 'EGRESS ATTEMPT INTERCEPTED & BLOCKED BY PROCESS GUARD' : 'Airgap Sovereignty Enforced'}
        >
          {sovereigntyAlert ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-error" />
              <span>● BLOCKED EGRESS</span>
            </>
          ) : (
            <>
              <Shield className="w-3.5 h-3.5 text-ok" />
              <span>● SOVEREIGN</span>
            </>
          )}
        </div>

        {activeModelName && (
          <div className="hidden sm:flex items-center gap-2 text-text-tertiary">
            <Cpu className="w-3.5 h-3.5" />
            <span className="text-text-secondary font-medium">{activeModelName}</span>
            {vramUsedGb != null && <span>({vramUsedGb.toFixed(1)} GB resident)</span>}
          </div>
        )}

        <div className="hidden sm:flex items-center">
          {backendReachable === false ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-error/15 text-error border border-error/30 font-semibold">
              <WifiOff className="w-3 h-3" />
              BACKEND UNREACHABLE
            </span>
          ) : backendReachable === true ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-ok/15 text-ok border border-ok/30 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
              LIVE API
            </span>
          ) : null}
        </div>
      </div>

      {/* Right: Active run, Egress counts, Command trigger */}
      <div className="flex items-center gap-4">
        {activeRunId && (
          <Link
            href={`/runs/${activeRunId}`}
            className="flex items-center gap-1.5 text-accent hover:underline hover:text-accent-hover transition-colors"
          >
            <span>Run: {activeRunId}</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}

        <div className="flex items-center gap-2">
          <span className="text-ok font-semibold">
            {externalConnections != null ? `${externalConnections} EXTERNAL` : '— EXTERNAL'}
          </span>
          <span className="text-text-tertiary">|</span>
          <span className={blockedTotal && blockedTotal > 0 ? 'text-warn font-semibold' : 'text-text-tertiary'}>
            {blockedTotal != null ? `${blockedTotal} BLOCKED` : '— BLOCKED'}
          </span>
        </div>

        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hover:text-text-primary transition-colors hidden lg:inline"
        >
          ⌘K menu
        </button>
      </div>
    </footer>
  );
};
