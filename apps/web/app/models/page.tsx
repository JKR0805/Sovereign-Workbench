'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import { LoadingState } from '../../components/primitives/LoadingState';
import type { ModelRead, ProbeReport, ResidencyReport, RuntimeModelInfo, RuntimeRead } from '../../lib/types';
import { CapabilityChip } from '../../components/primitives/CapabilityChip';
import { StatusDot } from '../../components/primitives/StatusDot';
import { useShellStore } from '../../stores/shellStore';
import {
  Cpu,
  Plus,
  Play,
  Square,
  RefreshCw,
  MoreVertical,
  CheckCircle2,
  HardDrive,
  Sparkles,
} from 'lucide-react';

const SERVICE_CAPABILITIES = new Set(['embedding', 'reranking']);

function isServiceModel(model: ModelRead): boolean {
  const keys = Object.keys(model.capabilities || {});
  return keys.length > 0 && keys.every((k) => SERVICE_CAPABILITIES.has(k));
}

export default function ModelManagementPage() {
  const { setActiveModel, activeModelId } = useShellStore();
  const {
    data: models,
    loading: modelsLoading,
    error: modelsError,
    reload: reloadModels,
  } = useApiResource<ModelRead[]>(() => api.getModels(), []);
  const { data: residency, reload: reloadResidency } = useApiResource<ResidencyReport>(
    () => api.getModelResidency(),
    []
  );
  const { data: runtimes } = useApiResource<RuntimeRead[]>(() => api.getRuntimes(), []);

  const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'deploy' | 'playground'>('installed');
  const [capabilityFilter, setCapabilityFilter] = useState<string>('all');

  const [newRuntimeId, setNewRuntimeId] = useState('ollama-local');
  const [newModelId, setNewModelId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newContextWindow, setNewContextWindow] = useState(8192);
  const [newVramGb, setNewVramGb] = useState(5.0);
  const [probeResult, setProbeResult] = useState<ProbeReport | null>(null);
  const [probing, setProbing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [availableRuntimeModels, setAvailableRuntimeModels] = useState<RuntimeModelInfo[]>([]);

  const [selectedPlaygroundModel, setSelectedPlaygroundModel] = useState<string | null>(null);
  const [playgroundPrompt, setPlaygroundPrompt] = useState('Explain how quicksort works in Python with a brief code example.');
  const [playgroundExecuting, setPlaygroundExecuting] = useState(false);
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);
  const [playgroundResult, setPlaygroundResult] = useState<{
    reply: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    tokens_measured: boolean;
    duration_ms: number;
    model_id: string;
  } | null>(null);

  useEffect(() => {
    api.getAvailableRuntimeModels(newRuntimeId).then(setAvailableRuntimeModels).catch(() => setAvailableRuntimeModels([]));
  }, [newRuntimeId]);

  useEffect(() => {
    if (models && models.length > 0 && !selectedPlaygroundModel) {
      const chatModel = models.find((m) => !isServiceModel(m));
      if (chatModel) setSelectedPlaygroundModel(chatModel.id);
    }
  }, [models, selectedPlaygroundModel]);

  const residentIds = new Set((residency?.entries ?? []).map((e) => e.model_id).filter((id): id is string => !!id));
  const usedVramGb = (residency?.entries ?? []).reduce((sum, e) => sum + (e.vram_gb ?? 0), 0);

  const reloadAll = () => {
    reloadModels();
    reloadResidency();
  };

  const handleRunPlayground = async () => {
    if (!playgroundPrompt.trim() || playgroundExecuting || !selectedPlaygroundModel) return;
    setPlaygroundExecuting(true);
    setPlaygroundError(null);
    try {
      const res = await api.chat(selectedPlaygroundModel, [{ role: 'user', content: playgroundPrompt }]);
      setPlaygroundResult({ ...res, model_id: selectedPlaygroundModel });
    } catch (err) {
      setPlaygroundError(err instanceof Error ? err.message : 'Playground execution failed.');
    } finally {
      setPlaygroundExecuting(false);
    }
  };

  const handleToggleRunning = async (model: ModelRead) => {
    if (residentIds.has(model.id)) {
      await api.unloadModel(model.id);
    } else {
      await api.loadModel(model.id);
    }
    reloadAll();
  };

  const handleRefreshModel = async (id: string) => {
    await api.refreshModel(id);
    reloadAll();
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Remove this model from local registry?')) return;
    await api.deleteModel(id);
    reloadAll();
  };

  const handleProbe = async () => {
    if (!newModelId) return;
    setProbing(true);
    try {
      const res = await api.probeModel(newRuntimeId, newModelId);
      setProbeResult(res);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Probe failed.');
    } finally {
      setProbing(false);
    }
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    try {
      await api.registerModel({
        id: newModelId.replace(/[:.]/g, '-'),
        display_name: newDisplayName || newModelId,
        runtime_id: newRuntimeId,
        runtime_model_id: newModelId,
        context_window: newContextWindow,
        vram_gb: newVramGb,
        capabilities: { text: 0.85 },
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setActiveTab('installed');
        reloadAll();
      }, 800);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to register model.');
    }
  };

  const filteredModels = (models ?? []).filter((m) => {
    if (capabilityFilter === 'all') return true;
    return capabilityFilter in m.capabilities;
  });

  if (modelsLoading) return <LoadingState label="Loading models..." className="p-6" />;
  if (modelsError) {
    return (
      <div className="p-6">
        <ErrorState error={modelsError} onRetry={reloadModels} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Model Management</h1>
          <p className="text-sm text-text-secondary">
            Manage, verify and deploy open-weight models on your sovereign hardware
          </p>
        </div>
        <button
          onClick={() => setActiveTab('deploy')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold font-mono shadow transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Deploy New Model</span>
        </button>
      </div>

      <div className="flex items-center gap-6 border-b border-border text-sm font-medium">
        <button
          onClick={() => setActiveTab('installed')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${activeTab === 'installed' ? 'border-accent text-accent font-semibold' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          Installed Models ({(models ?? []).length})
        </button>
        <button
          onClick={() => setActiveTab('available')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${activeTab === 'available' ? 'border-accent text-accent font-semibold' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          Runtime Adapters ({(runtimes ?? []).length})
        </button>
        <button
          onClick={() => setActiveTab('deploy')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${activeTab === 'deploy' ? 'border-accent text-accent font-semibold' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          Deploy New Model
        </button>
        <button
          onClick={() => setActiveTab('playground')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${activeTab === 'playground' ? 'border-accent text-accent font-semibold' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          Model Playground
        </button>
      </div>

      {/* Resident VRAM (real, no invented "total") */}
      <div className="bg-bg-panel border border-border rounded-md p-4">
        <div className="flex items-center justify-between text-xs sm:text-sm mb-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            <span className="font-semibold text-text-primary">Resident Model VRAM</span>
          </div>
          <span className="font-mono text-xs text-text-secondary">
            <strong className="text-text-primary">{usedVramGb.toFixed(1)} GB</strong> across {residency?.entries.length ?? 0} resident model(s)
          </span>
        </div>
        {(residency?.entries ?? []).length === 0 && (
          <p className="text-xs text-text-tertiary font-mono">No models currently resident in VRAM.</p>
        )}
        {(residency?.unreachable_runtimes ?? []).length > 0 && (
          <p className="text-xs text-warn font-mono mt-1">
            Unreachable: {residency!.unreachable_runtimes.join(', ')}
          </p>
        )}
      </div>

      {activeTab === 'installed' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary">Filter Capability:</span>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'reasoning', 'coding', 'vision'].map((cap) => (
                  <button
                    key={cap}
                    onClick={() => setCapabilityFilter(cap)}
                    className={`px-2.5 py-1 rounded text-xs font-mono capitalize transition-colors ${
                      capabilityFilter === cap ? 'bg-accent text-white font-medium shadow-sm' : 'bg-bg-panel border border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-text-tertiary">
              Showing {filteredModels.length} of {(models ?? []).length} registered models
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {filteredModels.map((model) => {
              const isSelected = activeModelId === model.id;
              const isRunning = residentIds.has(model.id);

              return (
                <div
                  key={model.id}
                  className={`bg-bg-panel border rounded-md p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isSelected ? 'border-accent shadow-glow-accent' : 'border-border hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded bg-bg-elevated border border-border flex items-center justify-center flex-shrink-0 text-accent">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h2 className="text-sm font-semibold text-text-primary font-mono">{model.display_name}</h2>
                        {Object.keys(model.capabilities).map((cap) => (
                          <CapabilityChip key={cap} label={cap} size="sm" />
                        ))}
                      </div>
                      <div className="text-xs text-text-tertiary font-mono">
                        {model.runtime_id} · {model.context_window.toLocaleString()} ctx · {model.license}
                        {model.health_detail && <span className="text-warn"> · {model.health_detail}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                    <div className="px-2.5 py-1 rounded bg-bg-elevated border border-border">
                      <StatusDot status={isRunning ? 'running' : model.health === 'healthy' ? 'ready' : model.health} pulse={isRunning} />
                    </div>
                    <button
                      onClick={() => setActiveModel(model.id, model.display_name)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                        isSelected ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-accent hover:bg-accent-hover text-white shadow'
                      }`}
                    >
                      {isSelected ? 'Active Model' : 'Use Model'}
                    </button>
                    <button
                      onClick={() => handleToggleRunning(model)}
                      className="p-1.5 rounded text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated transition-colors border border-border"
                      title={isRunning ? 'Unload from memory' : 'Load into VRAM'}
                    >
                      {isRunning ? <Square className="w-3.5 h-3.5 text-warn" /> : <Play className="w-3.5 h-3.5 text-ok" />}
                    </button>
                    <button
                      onClick={() => handleRefreshModel(model.id)}
                      className="p-1.5 rounded text-text-tertiary hover:text-accent hover:bg-bg-elevated transition-colors border border-border"
                      title="Re-probe health"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteModel(model.id)}
                      className="p-1.5 rounded text-text-tertiary hover:text-error hover:bg-bg-elevated transition-colors border border-border"
                      title="Delete from registry"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'deploy' && (
        <div className="bg-bg-panel border border-border rounded-lg p-6 max-w-2xl mx-auto w-full">
          <h2 className="text-base font-bold text-text-primary mb-1">Deploy New Local Model</h2>
          <p className="text-xs text-text-secondary mb-6">
            Register an open-weight model from a local runtime adapter into the registry.
          </p>

          <form onSubmit={handleSaveModel} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">1. Local Runtime Adapter</label>
              <select
                value={newRuntimeId}
                onChange={(e) => setNewRuntimeId(e.target.value)}
                className="bg-bg-elevated border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
              >
                {(runtimes ?? []).map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.id} ({rt.base_url})
                  </option>
                ))}
                {(runtimes ?? []).length === 0 && <option value="ollama-local">ollama-local</option>}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">2. Runtime Model Tag</label>
                <input
                  type="text"
                  required
                  list="runtime-tags"
                  value={newModelId}
                  onChange={(e) => {
                    setNewModelId(e.target.value);
                    if (!newDisplayName) setNewDisplayName(e.target.value);
                  }}
                  placeholder="e.g. qwen3:8b, llava:7b"
                  className="bg-bg-elevated border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
                />
                <datalist id="runtime-tags">
                  {availableRuntimeModels.map((m) => (
                    <option key={m.id} value={m.id} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Display Name</label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="bg-bg-elevated border border-border rounded-md px-3 py-2 text-xs text-text-primary focus:border-accent outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Context Window: <strong className="text-text-primary">{newContextWindow.toLocaleString()}</strong>
                </label>
                <input
                  type="range"
                  min={2048}
                  max={131072}
                  step={2048}
                  value={newContextWindow}
                  onChange={(e) => setNewContextWindow(parseInt(e.target.value, 10))}
                  className="accent-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Estimated VRAM: <strong className="text-text-primary">{newVramGb} GB</strong>
                </label>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={0.5}
                  value={newVramGb}
                  onChange={(e) => setNewVramGb(parseFloat(e.target.value))}
                  className="accent-accent"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-text-primary">Capability Verification Checklist</span>
                <button
                  type="button"
                  onClick={handleProbe}
                  disabled={probing || !newModelId}
                  className="px-2.5 py-1 rounded bg-bg-elevated border border-border hover:border-accent text-accent text-xs font-mono flex items-center gap-1.5 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${probing ? 'animate-spin' : ''}`} />
                  <span>Test Connection</span>
                </button>
              </div>

              {probeResult ? (
                <div className="bg-bg-base border border-border rounded p-3 text-xs font-mono flex flex-col gap-1.5">
                  <div className={`flex items-center justify-between ${probeResult.runtime_reachable ? 'text-ok' : 'text-error'}`}>
                    <span>{probeResult.runtime_reachable ? '✓ Runtime reachable' : '✗ Runtime unreachable'}</span>
                  </div>
                  <div className={`flex items-center justify-between ${probeResult.model_present ? 'text-ok' : 'text-warn'}`}>
                    <span>{probeResult.model_present ? '✓ Model weights present locally' : '✗ Model not pulled'}</span>
                  </div>
                  {probeResult.steps.map((step) => (
                    <div key={step.name} className={`flex items-center justify-between ${step.passed ? 'text-ok' : 'text-error'}`}>
                      <span>
                        {step.passed ? '✓' : '✗'} {step.name}
                      </span>
                      <span>{step.latency_ms != null ? `${step.latency_ms.toFixed(0)}ms` : step.detail ?? ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-bg-base border border-border rounded p-3 text-center text-xs text-text-tertiary font-mono">
                  Click &ldquo;Test Connection&rdquo; to run a live local verification probe before saving.
                </div>
              )}
            </div>

            {saveError && <ErrorState error={new Error(saveError)} compact />}

            <button
              type="submit"
              className="mt-2 w-full py-2.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all"
            >
              {saveSuccess ? '✓ Model Registered' : 'Register Model'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'playground' && (
        <div className="flex flex-col gap-4">
          <span className="text-xs font-semibold text-text-primary">Test open-weight models on your prompts</span>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {(models ?? [])
              .filter((m) => !isServiceModel(m))
              .map((pm) => {
                const isSelected = selectedPlaygroundModel === pm.id;
                const capKeys = Object.keys(pm.capabilities || {});
                return (
                  <div
                    key={pm.id}
                    onClick={() => setSelectedPlaygroundModel(pm.id)}
                    className={`p-3 rounded-md border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected ? 'bg-accent/10 border-accent shadow-sm' : 'bg-bg-panel border-border hover:border-border-strong'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Cpu className={`w-5 h-5 ${isSelected ? 'text-accent' : 'text-text-tertiary'}`} />
                        <span className="text-xs font-mono text-text-tertiary">
                          {residentIds.has(pm.id) ? 'In VRAM' : `${pm.vram_gb}GB`}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-text-primary mb-1">{pm.display_name}</h3>
                      <div className="text-xs font-mono text-text-secondary mb-2 truncate">{pm.runtime_model_id}</div>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {capKeys.slice(0, 3).map((t) => (
                          <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-elevated border border-border text-text-secondary uppercase">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`w-full py-1.5 text-xs font-semibold rounded transition-colors ${
                        isSelected ? 'bg-accent text-white shadow-sm' : 'bg-bg-elevated border border-border text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </button>
                  </div>
                );
              })}
          </div>

          <div className="bg-bg-panel border border-border rounded-md p-4 flex flex-col gap-3">
            <label className="text-xs font-semibold text-text-primary uppercase tracking-wider font-mono">
              Test Prompt (Target: {(models ?? []).find((m) => m.id === selectedPlaygroundModel)?.display_name ?? selectedPlaygroundModel ?? 'none'})
            </label>
            <textarea
              rows={3}
              value={playgroundPrompt}
              onChange={(e) => setPlaygroundPrompt(e.target.value)}
              placeholder="Enter prompt to evaluate model performance..."
              className="w-full bg-bg-elevated border border-border focus:border-accent rounded p-3 text-xs sm:text-sm text-text-primary placeholder-text-tertiary focus:outline-none resize-none font-mono"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-mono text-text-tertiary">Direct runtime chat · no routing applied</span>
              <button
                type="button"
                onClick={handleRunPlayground}
                disabled={playgroundExecuting || !playgroundPrompt.trim() || !selectedPlaygroundModel}
                className="flex items-center gap-2 px-4 py-2 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold font-mono shadow transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {playgroundExecuting ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Execute Inference</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-bg-panel border border-border rounded-md p-4">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-text-primary">Model Output</span>
              </div>
              {playgroundResult && (
                <span className="text-xs font-mono text-ok flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{playgroundResult.tokens_measured ? 'Measured' : 'Unmeasured'}</span>
                </span>
              )}
            </div>

            {playgroundExecuting ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3 text-text-secondary">
                <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                <span className="text-xs font-mono">Generating response...</span>
              </div>
            ) : playgroundError ? (
              <ErrorState error={new Error(playgroundError)} />
            ) : playgroundResult ? (
              <div className="text-sm text-text-primary whitespace-pre-line leading-relaxed mb-4 font-mono bg-bg-base/60 p-3 rounded border border-border">
                {playgroundResult.reply}
              </div>
            ) : (
              <div className="text-sm text-text-secondary whitespace-pre-line leading-relaxed mb-4 font-sans">
                Select a model above and click &ldquo;Execute Inference&rdquo;.
              </div>
            )}

            <div className="flex items-center justify-between text-xs font-mono text-text-tertiary border-t border-border pt-2">
              <span>
                {playgroundResult
                  ? `Tokens: ${(playgroundResult.prompt_tokens ?? 0) + (playgroundResult.completion_tokens ?? 0) || '—'} · Latency: ${(playgroundResult.duration_ms / 1000).toFixed(2)}s`
                  : 'Awaiting prompt submission'}
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'available' && (
        <div className="bg-bg-panel border border-border rounded-md p-8 text-center">
          <Cpu className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
          <h2 className="text-sm font-semibold text-text-primary mb-1">Runtime-reported models</h2>
          <p className="text-xs text-text-secondary max-w-md mx-auto mb-3">
            Models the {newRuntimeId} runtime reports as already present on disk.
          </p>
          <div className="flex flex-col gap-1.5 max-w-md mx-auto text-left">
            {availableRuntimeModels.length === 0 && (
              <p className="text-xs text-text-tertiary font-mono text-center">None reported, or runtime unreachable.</p>
            )}
            {availableRuntimeModels.map((m) => (
              <div key={m.id} className="px-2.5 py-1.5 rounded bg-bg-elevated border border-border font-mono text-xs text-text-secondary">
                {m.id}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
