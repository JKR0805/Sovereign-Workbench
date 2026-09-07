'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShellStore } from '../../stores/shellStore';
import {
  Search,
  MessageSquare,
  FileText,
  Cpu,
  ShieldAlert,
  GitFork,
  Sliders,
  Activity,
  FileCheck2,
  X
} from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen, triggerEgressPulse } = useShellStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const commands = [
    { label: 'Go to Workbench / Chat', icon: MessageSquare, action: () => router.push('/') },
    { label: 'Go to Document Analysis', icon: FileText, action: () => router.push('/knowledge') },
    { label: 'Go to Knowledge Graph', icon: Activity, action: () => router.push('/knowledge/graph') },
    { label: 'Go to Model Management', icon: Cpu, action: () => router.push('/models') },
    { label: 'Go to Agent Workflow Builder', icon: GitFork, action: () => router.push('/workflows') },
    { label: 'Go to Routing Studio', icon: Sliders, action: () => router.push('/routing') },
    { label: 'Go to Network & Sovereignty Monitor', icon: ShieldAlert, action: () => router.push('/network') },
    { label: 'Go to System Analytics', icon: Activity, action: () => router.push('/analytics') },
    { label: 'Go to Audit Explorer', icon: FileCheck2, action: () => router.push('/audit') },
    {
      label: 'Trigger Simulated Egress Probe (Test Process Guard)',
      icon: ShieldAlert,
      badge: 'Test Egress',
      action: () => {
        triggerEgressPulse();
        alert('Blocked outbound socket call to api.openai.com:443. Egress ledger recorded event.');
      }
    },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4 animate-in fade-in duration-150">
      <div className="bg-bg-elevated border border-border-strong w-full max-w-xl rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Input */}
        <div className="flex items-center px-4 py-3 border-b border-border gap-3">
          <Search className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <input
            type="text"
            placeholder="Type a command or jump to screen... (ESC to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-text-primary placeholder-text-tertiary focus:outline-none"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 rounded text-text-tertiary hover:text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto p-2 flex flex-col gap-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-tertiary font-mono">
              No matching commands found.
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    cmd.action();
                    setCommandPaletteOpen(false);
                  }}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-bg-panel text-left text-xs transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-text-tertiary group-hover:text-accent" />
                    <span className="text-text-primary group-hover:text-accent font-medium">
                      {cmd.label}
                    </span>
                  </div>
                  {cmd.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/15 text-warn border border-warn/30">
                      {cmd.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border bg-bg-panel/50 flex items-center justify-between text-[11px] font-mono text-text-tertiary">
          <span>Navigate with mouse or arrow keys</span>
          <span>Sovereign Airgap Mode</span>
        </div>
      </div>
    </div>
  );
};
