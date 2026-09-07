'use client';

import React from 'react';
import Link from 'next/link';
import { useShellStore } from '../../stores/shellStore';
import { Shield, ShieldAlert, Cpu, Activity, ExternalLink } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const {
    sovereigntyAlert,
    blockedCount,
    egressCount,
    gpuUsagePercent,
    vramUsedGb,
    vramTotalGb,
    activeRunId,
    activeModelName,
    setCommandPaletteOpen
  } = useShellStore();

  return (
    <footer className="h-7 bg-bg-panel border-t border-border px-3 flex items-center justify-between text-[11px] font-mono text-text-secondary select-none z-30 flex-shrink-0">
      {/* Left: Sovereignty status & models */}
      <div className="flex items-center gap-4">
        {/* Sovereignty Indicator */}
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
              <ShieldAlert className="w-3 h-3 text-error" />
              <span>● BLOCKED EGRESS</span>
            </>
          ) : (
            <>
              <Shield className="w-3 h-3 text-ok" />
              <span>● SOVEREIGN</span>
            </>
          )}
        </div>

        {/* Loaded Model & VRAM */}
        <div className="hidden sm:flex items-center gap-1.5 text-text-tertiary">
          <Cpu className="w-3 h-3" />
          <span className="text-text-secondary">{activeModelName}</span>
          <span>({vramUsedGb} GB / {vramTotalGb} GB)</span>
        </div>

        {/* GPU Usage */}
        <div className="hidden md:flex items-center gap-1.5 text-text-tertiary">
          <Activity className="w-3 h-3" />
          <span>GPU: <strong className="text-text-primary">{gpuUsagePercent}%</strong></span>
        </div>
      </div>

      {/* Right: Active run, Egress counts, Command trigger */}
      <div className="flex items-center gap-4">
        {/* Active Run tracker */}
        {activeRunId && (
          <Link
            href={`/runs/${activeRunId}`}
            className="flex items-center gap-1 text-accent hover:underline hover:text-accent-hover transition-colors"
          >
            <span>Run: {activeRunId}</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}

        {/* Egress counters */}
        <div className="flex items-center gap-1.5">
          <span className="text-ok font-medium">{egressCount} EXTERNAL</span>
          <span className="text-text-tertiary">|</span>
          <span className={blockedCount > 0 ? 'text-warn font-semibold' : 'text-text-tertiary'}>
            {blockedCount} BLOCKED
          </span>
        </div>

        {/* Shortcut hint */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hover:text-text-primary transition-colors hidden lg:inline"
        >
          ⌘K for menu
        </button>
      </div>
    </footer>
  );
};
