'use client';

import React, { useState, useEffect } from 'react';
import { useShellStore } from '../../stores/shellStore';
import { api } from '../../lib/api';
import type { ModelRead, RuntimeRead, SandboxStatus, SelfAuditResult, SystemHealth } from '../../lib/types';
import { CheckCircle2, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const { setActiveModel } = useShellStore();
  const [activeTab, setActiveTab] = useState<'general' | 'models' | 'security' | 'tools' | 'system'>('models');
  const [models, setModels] = useState<ModelRead[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeRead[]>([]);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [selfAudit, setSelfAudit] = useState<SelfAuditResult | null>(null);
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus | null>(null);

  // Preferences matching Reference Image 1 Bottom Right
  const [defaultModel, setDefaultModel] = useState('Qwen 3 8B');
  const [enableMultimodal, setEnableMultimodal] = useState(true);
  const [showModelParams, setShowModelParams] = useState(false);
  const [autoSelectBest, setAutoSelectBest] = useState(true);

  // General & Tools Preferences
  const [themeMode, setThemeMode] = useState('Dark Industrial (Default)');
  const [fontScaling, setFontScaling] = useState('Comfortable (1.1x)');
  const [sandboxTimeout, setSandboxTimeout] = useState('30s');
  const [humanInTheLoop, setHumanInTheLoop] = useState(true);
  const [saved, setSaved] = useState(false);

  // Load from localStorage & backend on mount
  useEffect(() => {
    async function loadData() {
      try {
        const stored = localStorage.getItem('sovereign_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.defaultModel) setDefaultModel(parsed.defaultModel);
          if (parsed.enableMultimodal !== undefined) setEnableMultimodal(parsed.enableMultimodal);
          if (parsed.showModelParams !== undefined) setShowModelParams(parsed.showModelParams);
          if (parsed.autoSelectBest !== undefined) setAutoSelectBest(parsed.autoSelectBest);
          if (parsed.themeMode) setThemeMode(parsed.themeMode);
          if (parsed.fontScaling) setFontScaling(parsed.fontScaling);
          if (parsed.sandboxTimeout) setSandboxTimeout(parsed.sandboxTimeout);
          if (parsed.humanInTheLoop !== undefined) setHumanInTheLoop(parsed.humanInTheLoop);
        }

        const [modelsList, runtimesList] = await Promise.all([api.getModels(), api.getRuntimes()]);
        setRuntimes(runtimesList);
        if (modelsList && modelsList.length > 0) {
          setModels(modelsList);
          if (!stored) {
            setDefaultModel(modelsList[0].display_name);
            setActiveModel(modelsList[0].id, modelsList[0].display_name);
          }
        }
      } catch (err) {
        console.error('Failed to load settings data', err);
      }
    }
    loadData();
  }, [setActiveModel]);

  useEffect(() => {
    if (activeTab === 'security') {
      api.getNetworkSelfAudit().then(setSelfAudit).catch(() => setSelfAudit(null));
      api.getSandboxStatus().then(setSandboxStatus).catch(() => setSandboxStatus(null));
    }
    if (activeTab === 'system') {
      api.getSystemHealth().then(setSystemHealth).catch(() => setSystemHealth(null));
    }
  }, [activeTab]);

  const handleProbeOllama = async () => {
    if (runtimes.length === 0) {
      setProbeResult('No runtimes registered.');
      return;
    }
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await api.probeRuntime(runtimes[0].id);
      if (res.state === 'healthy') {
        setProbeResult(`Connected to ${runtimes[0].id}! Latency: ${res.latency_ms?.toFixed(1) ?? '—'}ms`);
      } else {
        setProbeResult(`${runtimes[0].id} reported ${res.state}${res.detail ? `: ${res.detail}` : ''}`);
      }
    } catch (err) {
      setProbeResult(err instanceof Error ? err.message : 'Probe error');
    } finally {
      setProbing(false);
    }
  };

  const handleSave = () => {
    try {
      const data = {
        defaultModel,
        enableMultimodal,
        showModelParams,
        autoSelectBest,
        themeMode,
        fontScaling,
        sandboxTimeout,
        humanInTheLoop,
      };
      localStorage.setItem('sovereign_settings', JSON.stringify(data));
      const found = models.find((m) => m.display_name === defaultModel);
      const modelId = found?.id || defaultModel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      setActiveModel(modelId, defaultModel);
    } catch {
      // Ignore
    }
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
          Configure your workbench environment and local model execution parameters
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

      {/* Models Tab Content */}
      {activeTab === 'models' && (
        <div className="flex flex-col gap-6">
          {/* Live Runtime Status Banner */}
          <div className="flex flex-col gap-3 p-4 rounded-md bg-bg-panel border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${runtimes[0]?.health === 'healthy' ? 'bg-ok animate-pulse' : 'bg-text-tertiary'}`}
                />
                <span className="text-sm font-semibold text-text-primary">
                  {runtimes[0]?.id ?? 'No runtime registered'}
                </span>
                {runtimes[0] && (
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      runtimes[0].health === 'healthy' ? 'bg-ok/10 text-ok border-ok/30' : 'bg-warn/10 text-warn border-warn/30'
                    }`}
                  >
                    {runtimes[0].health} · {runtimes[0].base_url}
                  </span>
                )}
              </div>
              <button
                onClick={handleProbeOllama}
                disabled={probing}
                className="px-3 py-1 text-xs font-mono rounded bg-bg-elevated border border-border hover:border-accent text-text-primary transition-all flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                <span>{probing ? 'Testing...' : 'Test Connection'}</span>
              </button>
            </div>
            {probeResult && (
              <div className="text-xs font-mono text-ok px-2.5 py-1.5 rounded bg-ok/10 border border-ok/30">
                ✓ {probeResult}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono mt-1">
              <div className="p-2.5 rounded bg-bg-elevated border border-border">
                <span className="text-text-tertiary block text-[11px]">Fleet Registered</span>
                <span className="text-text-primary font-bold">{models.length} Models</span>
              </div>
              <div className="p-2.5 rounded bg-bg-elevated border border-border">
                <span className="text-text-tertiary block text-[11px]">Runtimes Registered</span>
                <span className="text-text-primary font-bold">{runtimes.length}</span>
              </div>
              <div className="p-2.5 rounded bg-bg-elevated border border-border">
                <span className="text-text-tertiary block text-[11px]">Healthy Models</span>
                <span className="text-text-primary font-bold">{models.filter((m) => m.health === 'healthy').length}</span>
              </div>
              <div className="p-2.5 rounded bg-bg-elevated border border-border">
                <span className="text-text-tertiary block text-[11px]">Perimeter Status</span>
                <span className="text-ok font-bold">Airgapped Localhost</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">
              Model Preferences
            </h2>
          </div>

          {/* Default Model */}
          <div className="flex flex-col gap-1.5 max-w-md">
            <label className="text-xs font-medium text-text-secondary">Default Model for Chat & Tasks</label>
            <select
              value={defaultModel}
              onChange={(e) => {
                const sel = models.find((m) => m.display_name === e.target.value);
                setDefaultModel(e.target.value);
                if (sel) {
                  setActiveModel(sel.id, sel.display_name);
                }
              }}
              className="bg-bg-panel border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
            >
              {models.length > 0 ? (
                models.map((m) => (
                  <option key={m.id} value={m.display_name}>
                    {m.display_name} ({m.runtime_model_id}) - {m.health}
                  </option>
                ))
              ) : (
                <>
                  <option value="Qwen 3 8B">Qwen 3 8B (qwen3:8b)</option>
                  <option value="Qwen 2.5 Coder 7B">Qwen 2.5 Coder 7B (qwen2.5-coder:7b)</option>
                  <option value="Llava 7B (Vision Specialist)">Llava 7B (llava:7b)</option>
                  <option value="Llama 3 8B">Llama 3 8B (llama3:latest)</option>
                </>
              )}
            </select>
            <span className="text-xs text-text-tertiary">
              This model will be used by default for new chats and direct generation
            </span>
          </div>

          {/* Toggles matching Reference Image 1 Bottom Right */}
          <div className="flex flex-col gap-5 pt-2 border-t border-border">
            {/* Enable Multimodal Inputs */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">
                  Enable Multimodal Inputs
                </span>
                <span className="text-xs text-text-tertiary">
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
                <span className="text-sm font-medium text-text-primary">
                  Show Model Parameters
                </span>
                <span className="text-xs text-text-tertiary">
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
                <span className="text-sm font-medium text-text-primary">
                  Auto-Select Best Model
                </span>
                <span className="text-xs text-text-tertiary">
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

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">General Preferences</h2>
            <p className="text-xs text-text-tertiary">User interface aesthetics, font scale, and workspace defaults</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">UI Theme Palette</label>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value)}
                className="bg-bg-panel border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
              >
                <option>Dark Industrial (Default)</option>
                <option>High Contrast Airgap</option>
                <option>OLED Pure Black</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Font Scale</label>
              <select
                value={fontScaling}
                onChange={(e) => setFontScaling(e.target.value)}
                className="bg-bg-panel border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
              >
                <option>Comfortable (1.1x)</option>
                <option>Standard (1.0x)</option>
                <option>Compact (0.9x)</option>
              </select>
            </div>
          </div>

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

      {/* Tools Tab */}
      {activeTab === 'tools' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">Tool Execution & Sandbox Settings</h2>
            <p className="text-xs text-text-tertiary">Configure execution timeouts and airgap isolation parameters</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Sandbox Execution Timeout</label>
              <select
                value={sandboxTimeout}
                onChange={(e) => setSandboxTimeout(e.target.value)}
                className="bg-bg-panel border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
              >
                <option>15s</option>
                <option>30s</option>
                <option>60s</option>
                <option>120s</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-bg-panel border border-border">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-primary">Human-in-the-Loop Confirmation</span>
                <span className="text-[11px] text-text-tertiary">Require confirmation for file exports and tool calls</span>
              </div>
              <input
                type="checkbox"
                checked={humanInTheLoop}
                onChange={(e) => setHumanInTheLoop(e.target.checked)}
                className="w-4 h-4 rounded text-accent accent-accent"
              />
            </div>
          </div>

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
          <h2 className="text-sm font-semibold text-text-primary font-sans">Airgap & Network Defense</h2>
          {selfAudit ? (
            <>
              <div className="flex items-center justify-between p-3 rounded bg-bg-elevated border border-border">
                <span>Startup Self-Audit</span>
                <span className={selfAudit.passed ? 'text-ok font-bold' : 'text-error font-bold'}>
                  {selfAudit.passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
              {selfAudit.assertions.map((a) => (
                <div key={a.name} className="flex items-center justify-between p-3 rounded bg-bg-elevated border border-border">
                  <span>{a.name}</span>
                  <span className={a.outcome === 'pass' ? 'text-ok font-bold' : a.outcome === 'fail' ? 'text-error font-bold' : 'text-text-tertiary'}>
                    {a.outcome.toUpperCase()}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-text-tertiary">Loading self-audit...</p>
          )}
          <div className="flex items-center justify-between p-3 rounded bg-bg-elevated border border-border">
            <span>Docker Sandbox</span>
            <span className={sandboxStatus?.available ? 'text-ok font-bold' : 'text-warn font-bold'}>
              {sandboxStatus ? (sandboxStatus.available ? 'AVAILABLE' : sandboxStatus.detail) : 'Loading...'}
            </span>
          </div>
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="bg-bg-panel border border-border rounded-md p-6 flex flex-col gap-3 text-xs font-mono">
          <h2 className="text-sm font-semibold text-text-primary font-sans">System Environment</h2>
          {systemHealth ? (
            <>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Version:</span>
                <span className="text-text-primary">VAJRA v{systemHealth.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Profile:</span>
                <span className="text-text-primary">{systemHealth.profile}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Python:</span>
                <span className="text-text-primary">{systemHealth.python}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Database journal mode:</span>
                <span className="text-text-primary">{systemHealth.database_journal_mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Self-audit:</span>
                <span className="text-text-primary">
                  {systemHealth.self_audit_passed === null ? 'disabled' : systemHealth.self_audit_passed ? 'passed' : 'failed'}
                </span>
              </div>
              {systemHealth.services.map((s) => (
                <div key={s.name} className="flex justify-between">
                  <span className="text-text-tertiary">{s.name}:</span>
                  <span className={s.state === 'healthy' ? 'text-ok' : 'text-warn'}>{s.state}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-text-tertiary">Loading system health...</p>
          )}
        </div>
      )}
    </div>
  );
}
