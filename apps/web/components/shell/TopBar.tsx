'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { HexLogo } from '../primitives/HexLogo';
import { useShellStore } from '../../stores/shellStore';
import { ChevronDown, ShieldCheck, Command } from 'lucide-react';
import { MOCK_MODELS } from '../../lib/mockData';

export const TopBar: React.FC = () => {
  const { activeModelId, activeModelName, setActiveModel, setCommandPaletteOpen } = useShellStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
          <span className="font-medium">{activeModelName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-72 bg-bg-elevated border border-border shadow-xl rounded-md py-1.5 z-50">
            <div className="px-3 py-1 border-b border-border text-xs font-mono text-text-tertiary uppercase">
              Installed Open Models
            </div>
            {MOCK_MODELS.map((model) => (
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
                  <div className="text-xs font-mono text-text-tertiary">{model.device.toUpperCase()} · {model.vram_gb} GB</div>
                </div>
                {model.is_resident && (
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
        <Link href="/login" className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-full hover:bg-bg-elevated transition-colors border border-transparent hover:border-border">
          <div className="w-7 h-7 rounded-full bg-[#1E3A8A] border border-[#3B82F6]/40 flex items-center justify-center text-white text-xs font-semibold">
            A
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-sm font-medium text-text-primary leading-tight">Admin</span>
            <span className="text-xs font-mono text-text-tertiary leading-none">PSU Network</span>
          </div>
        </Link>
      </div>
    </header>
  );
};
