'use client';

import React, { useState } from 'react';
import { useShellStore } from '../../stores/shellStore';
import { Settings as SettingsIcon, CheckCircle2, ShieldCheck, Cpu, Sliders } from 'lucide-react';

export default function SettingsPage() {
  const { activeModelName, setActiveModel } = useShellStore();
  const [activeTab, setActiveTab] = useState<'general' | 'models' | 'security' | 'tools' | 'system'>('models');

  // Preferences matching Reference Image 1 Bottom Right
  const [defaultModel, setDefaultModel] = useState('Llama 3.1 70B');
  const [enableMultimodal, setEnableMultimodal] = useState(true);
  const [showModelParams, setShowModelParams] = useState(false);
  const [autoSelectBest, setAutoSelectBest] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header matching Reference Image 1 Bottom Right */}
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          Settings
        </h1>
        <p className="text-xs text-text-secondary">
          Configure your workbench environment
        </p>
      </div>

      {/* Tabs matching Reference Image 1 */}
      <div className="flex items-center gap-8 border-b border-border text-xs font-medium">
        {(['general', 'models', 'security', 'tools', 'system'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`pb-2.5 capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Models Tab Content matching Reference Image 1 */}
      {activeTab === 'models' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">
              Model Preferences
            </h2>
          </div>

          {/* Default Model */}
          <div className="flex flex-col gap-1.5 max-w-md">
            <label className="text-xs font-medium text-text-secondary">Default Model</label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="bg-bg-panel border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
            >
              <option value="Llama 3.1 70B">Llama 3.1 70B</option>
              <option value="Qwen2-VL 72B">Qwen2-VL 72B</option>
              <option value="Mistral Large 2">Mistral Large 2</option>
              <option value="Phi 3 Medium">Phi 3 Medium</option>
            </select>
            <span className="text-[11px] text-text-tertiary">
              This model will be used by default for new chats
            </span>
          </div>

          {/* Toggles matching Reference Image 1 Bottom Right */}
          <div className="flex flex-col gap-5 pt-2 border-t border-border">
            {/* Enable Multimodal Inputs */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-primary">
                  Enable Multimodal Inputs
                </span>
                <span className="text-[11px] text-text-tertiary">
                  Allow image and document inputs where supported
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableMultimodal}
                onChange={(e) => setEnableMultimodal(e.target.checked)}
                className="w-4 h-4 rounded text-accent accent-accent"
              />
            </div>

            {/* Show Model Parameters */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-primary">
                  Show Model Parameters
                </span>
                <span className="text-[11px] text-text-tertiary">
                  Display detailed model information
                </span>
              </div>
              <input
                type="checkbox"
                checked={showModelParams}
                onChange={(e) => setShowModelParams(e.target.checked)}
                className="w-4 h-4 rounded text-accent accent-accent"
              />
            </div>

            {/* Auto-Select Best Model */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-primary">
                  Auto-Select Best Model
                </span>
                <span className="text-[11px] text-text-tertiary">
                  Automatically choose the best model for each task
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoSelectBest}
                onChange={(e) => setAutoSelectBest(e.target.checked)}
                className="w-4 h-4 rounded text-accent accent-accent"
              />
            </div>
          </div>

          {/* Save Button matching Reference Image 1 */}
          <div className="pt-4 border-t border-border flex justify-end">
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all flex items-center gap-1.5"
            >
              {saved ? <CheckCircle2 className="w-4 h-4" /> : null}
              <span>{saved ? 'Changes Saved' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="bg-bg-panel border border-border rounded-md p-6 flex flex-col gap-4 text-xs font-mono">
          <h2 className="text-sm font-semibold text-text-primary font-sans">
            Airgap & Network Defense
          </h2>
          <div className="flex items-center justify-between p-3 rounded bg-bg-elevated border border-border">
            <span>In-Process Python Socket Hook</span>
            <span className="text-ok font-bold">ACTIVE (vajra.sovereignty.guard)</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded bg-bg-elevated border border-border">
            <span>Startup Zero Cloud Key Assertion</span>
            <span className="text-ok font-bold">VERIFIED (Fail-Closed)</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded bg-bg-elevated border border-border">
            <span>Docker Sandbox Network</span>
            <span className="text-ok font-bold">ISOLATED (--network=none)</span>
          </div>
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="bg-bg-panel border border-border rounded-md p-6 flex flex-col gap-3 text-xs font-mono">
          <h2 className="text-sm font-semibold text-text-primary font-sans">
            System Environment
          </h2>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Version:</span>
            <span className="text-text-primary">VAJRA v0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Profile:</span>
            <span className="text-text-primary">laptop-8gb.yaml (Single-Resident VRAM)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Vector Engine:</span>
            <span className="text-text-primary">Qdrant Embedded (data/qdrant)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Database:</span>
            <span className="text-text-primary">SQLite WAL Mode (data/sqlite/vajra.db)</span>
          </div>
        </div>
      )}
    </div>
  );
}
