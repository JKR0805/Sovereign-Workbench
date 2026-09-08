'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { HexLogo } from '../primitives/HexLogo';
import { useShellStore } from '../../stores/shellStore';
import { useAuthStore } from '../../stores/authStore';
import { ChevronDown, ShieldCheck, Command } from 'lucide-react';
import { api } from '../../lib/api';
import type { ModelRead } from '../../lib/types';

export const TopBar: React.FC = () => {
  const { activeModelId, activeModelName, setActiveModel, setCommandPaletteOpen } = useShellStore();
  const { currentUser } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [models, setModels] = useState<ModelRead[]>([]);
  const [residentIds, setResidentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dropdownOpen) return;
    let cancelled = false;
    Promise.all([api.getModels({ enabled_only: true }), api.getModelResidency()])
      .then(([modelList, residency]) => {
        if (cancelled) return;
        setModels(modelList);
        setResidentIds(new Set(residency.entries.map((e) => e.model_id).filter((id): id is string => !!id)));
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dropdownOpen]);

  return (
    <header className="h-14 bg-bg-panel border-b border-border px-4 flex items-center justify-between z-30 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <HexLogo size={28} />
          <span className="font-semibold text-base tracking-tight text-text-primary hidden sm:inline-block">
            Sovereign AI Workbench
          </span>
        </Link>
      </div>

      {/* Center: Model Selector */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-elevated border border-border hover:border-border-strong text-text-primary text-sm font-mono transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
          <span className="font-medium">{activeModelName ?? 'Auto-routed'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-72 bg-bg-elevated border border-border shadow-xl rounded-md py-1.5 z-50 max-h-96 overflow-y-auto">
            <div className="px-3 py-1 border-b border-border text-xs font-mono text-text-tertiary uppercase">
              Registered Models
            </div>
            {models.length === 0 && (
              <div className="px-3 py-3 text-xs text-text-tertiary font-mono">No models registered.</div>
            )}
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  setActiveModel(model.id, model.display_name);
                  setDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-bg-panel transition-colors text-sm ${
                  activeModelId === model.id ? 'text-accent font-semibold bg-bg-panel/50' : 'text-text-secondary'
                }`}
              >
                <div>
                  <div className="font-medium text-text-primary">{model.display_name}</div>
                  <div className="text-xs font-mono text-text-tertiary">
                    {model.device.toUpperCase()} · {model.vram_gb} GB
                  </div>
                </div>
                {residentIds.has(model.id) && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-ok-muted text-ok border border-ok/30">
                    RESIDENT
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Controls: On-Premise Badge, Command Palette, User Profile */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-bg-base border border-border text-text-tertiary hover:text-text-secondary text-xs font-mono transition-colors"
        >
          <Command className="w-3.5 h-3.5" />
          <span>K</span>
        </button>

        {/* On-Premise Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-ok/10 border border-ok/20 text-ok text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-ok" />
          <span className="font-medium">On-Premise</span>
        </div>

        {/* User Pill */}
        {currentUser ? (
          <Link
            href={currentUser.role === 'admin' ? '/admin/users' : '/settings'}
            className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-full hover:bg-bg-elevated transition-colors border border-transparent hover:border-border"
            title={`Signed in as ${currentUser.username} (${currentUser.role})`}
          >
            <div className="w-7 h-7 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center text-blue-200 text-xs font-semibold">
              {currentUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-text-primary leading-tight truncate max-w-[120px]">
                {currentUser.display_name || currentUser.username}
              </span>
              <span className="text-[10px] font-mono text-text-tertiary uppercase leading-none">
                {currentUser.role}
              </span>
            </div>
          </Link>
        ) : (
          <Link
            href="/login"
            className="text-xs text-accent hover:underline font-mono px-2 py-1"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
};
