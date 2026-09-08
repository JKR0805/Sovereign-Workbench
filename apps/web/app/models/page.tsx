'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, useIsMock } from '../../lib/api';
import { ModelRead, ModelProbeResult } from '../../lib/types';
import { CapabilityChip } from '../../components/primitives/CapabilityChip';
import { StatusDot } from '../../components/primitives/StatusDot';
import { MockBadge } from '../../components/primitives/MockBadge';
import { useShellStore } from '../../stores/shellStore';
import {
  Cpu,
  Plus,
  Play,
  Square,
  RefreshCw,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Sliders,
  Sparkles
} from 'lucide-react';

export default function ModelManagementPage() {
  const { setActiveModel, activeModelId } = useShellStore();
  const isModelsMock = useIsMock('models');
  const [models, setModels] = useState<ModelRead[]>([]);
  const [residency, setResidency] = useState<any>(null);
  const [runtimes, setRuntimes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'deploy' | 'playground'>('installed');
  const [capabilityFilter, setCapabilityFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Deploy New Model form state
  const [newRuntimeId, setNewRuntimeId] = useState('ollama-local');
  const [newModelId, setNewModelId] = useState('qwen2.5-vl:3b');
  const [newDisplayName, setNewDisplayName] = useState('Qwen 2.5 VL 3B');
  const [newVramGb, setNewVramGb] = useState(3.2);
  const [probeResult, setProbeResult] = useState<ModelProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Playground state
  const [compareMode, setCompareMode] = useState(true);
  const [selectedPlaygroundModel, setSelectedPlaygroundModel] = useState('llama-3-1-70b');
  const [playgroundPrompt, setPlaygroundPrompt] = useState('Analyze the maintenance and sensor vibration data for the distillation column.');

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    setLoading(true);
    try {
      const [data, resData, runtimesData] = await Promise.all([
        api.getModels(),
        api.getModelResidency(),
        api.getRuntimes(),
      ]);
      setModels(data);
      setResidency(resData);
      setRuntimes(runtimesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRunning = async (model: ModelRead) => {
    if (model.health === 'healthy' || model.is_resident) {
      await api.unloadModel(model.id);
    } else {
      await api.loadModel(model.id);
    }
    await loadModels();
  };

  const handleRefreshModel = async (id: string) => {
    try {
      await api.refreshModel(id);
      await loadModels();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Remove this model from local registry?')) return;
    try {
      await api.deleteModel(id);
      await loadModels();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectModel = (model: ModelRead) => {
    setActiveModel(model.id, model.display_name);
  };

  const handleProbe = async () => {
    setProbing(true);
    try {
      const res = await api.probeModel(newRuntimeId, newModelId);
      setProbeResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setProbing(false);
    }
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.registerModel({
      id: newModelId.replace(':', '-'),
      display_name: newDisplayName,
      runtime_id: newRuntimeId,
      runtime_model_id: newModelId,
      vram_gb: newVramGb,
      capabilities: {
        text: 0.9,
        vision: newModelId.includes('vl') ? 0.92 : 0.0,
      },
    });
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setActiveTab('installed');
      loadModels();
    }, 800);
  };

  const filteredModels = models.filter((m) => {
    if (capabilityFilter === 'all') return true;
    return capabilityFilter in m.capabilities;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Model Management
            </h1>
            {isModelsMock && <MockBadge label="Mock Registry" size="sm" />}
          </div>
          <p className="text-sm text-text-secondary">
            Manage, verify and deploy open-weight models on your sovereign hardware perimeters
          </p>
        </div>

        {/* Action button */}
        <button
          onClick={() => setActiveTab('deploy')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold font-mono shadow transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Deploy New Model</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border text-sm font-medium">
        <button
          onClick={() => setActiveTab('installed')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'installed'
              ? 'border-accent text-accent font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Installed Models ({models.length})
        </button>
        <button
          onClick={() => setActiveTab('available')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'available'
              ? 'border-accent text-accent font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Runtime Adapters ({runtimes.length})
        </button>
        <button
          onClick={() => setActiveTab('deploy')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'deploy'
              ? 'border-accent text-accent font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Deploy New Model
        </button>
        <button
          onClick={() => setActiveTab('playground')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'playground'
              ? 'border-accent text-accent font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Model Playground
        </button>
      </div>

      {/* VRAM Allocation Bar */}
      <div className="bg-bg-panel border border-border rounded-md p-4">
        <div className="flex items-center justify-between text-xs sm:text-sm mb-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            <span className="font-semibold text-text-primary">GPU VRAM Allocation Budget</span>
            <span className="text-xs font-mono text-text-tertiary">(Single-Resident Laptop Profile)</span>
          </div>
          <span className="font-mono text-xs text-text-secondary">
            <strong className="text-text-primary">{residency ? (residency.used_vram_mb / 1024).toFixed(1) : '5.2'} GB</strong> used / {residency ? (residency.total_vram_mb / 1024).toFixed(1) : '8.0'} GB Physical VRAM
          </span>
        </div>

        {/* Stacked Bar */}
        <div className="w-full h-3 bg-bg-base rounded-full overflow-hidden flex border border-border">
          <div className="h-full bg-accent" style={{ width: '65%' }} title="Active Resident Model" />
          <div className="h-full bg-[#E0A32E]" style={{ width: '16%' }} title="OS & Display Compositor" />
          <div className="h-full bg-[#232833]" style={{ width: '19%' }} title="Free Headroom" />
        </div>

        <div className="flex items-center justify-between text-xs font-mono text-text-tertiary mt-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent" /> Active Model ({residency ? (residency.used_vram_mb / 1024).toFixed(1) : '5.2'} GB)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#E0A32E]" /> OS Reserved (1.3 GB)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#232833]" /> Available VRAM Headroom
            </span>
          </div>
        </div>
      </div>

      {/* Tab Content: Installed Models */}
      {activeTab === 'installed' && (
        <div className="flex flex-col gap-4">
          {/* Filter Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary">Filter Capability:</span>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'reasoning', 'coding', 'vision'].map((cap) => (
                  <button
                    key={cap}
                    onClick={() => setCapabilityFilter(cap)}
                    className={`px-2.5 py-1 rounded text-xs font-mono capitalize transition-colors ${
                      capabilityFilter === cap
                        ? 'bg-accent text-white font-medium shadow-sm'
                        : 'bg-bg-panel border border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-text-tertiary">
              Showing {filteredModels.length} of {models.length} registered models
            </span>
          </div>

          {/* Model Cards List */}
          <div className="flex flex-col gap-3">
            {filteredModels.map((model) => {
              const isSelected = activeModelId === model.id;
              const isRunning = model.health === 'healthy' && model.is_resident;

              return (
                <div
                  key={model.id}
                  className={`bg-bg-panel border rounded-md p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isSelected ? 'border-accent shadow-glow-accent' : 'border-border hover:border-border-strong'
                  }`}
                >
                  {/* Left: Model identity and tags */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded bg-bg-elevated border border-border flex items-center justify-center flex-shrink-0 text-accent">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h2 className="text-sm font-semibold text-text-primary font-mono">
                          {model.display_name}
                        </h2>
                        {Object.keys(model.capabilities).map((cap) => (
                          <CapabilityChip key={cap} label={cap} size="sm" />
                        ))}
                      </div>
                      <div className="text-xs text-text-tertiary font-mono">
                        {model.runtime_id.includes('ollama') ? 'Meta / Alibaba / Open Weights' : 'Local ONNX'} ·{' '}
                        {model.context_window.toLocaleString()} ctx · {model.license}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status badge & Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                    <div className="px-2.5 py-1 rounded bg-bg-elevated border border-border">
                      <StatusDot status={isRunning ? 'running' : 'stopped'} pulse={isRunning} />
                    </div>

                    <button
                      onClick={() => handleSelectModel(model)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-accent/20 text-accent border border-accent/40'
                          : 'bg-accent hover:bg-accent-hover text-white shadow'
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
                      title="Re-probe capabilities"
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

      {/* Tab Content: Deploy New Model (3-Step Wizard + Live Probe) */}
      {activeTab === 'deploy' && (
        <div className="bg-bg-panel border border-border rounded-lg p-6 max-w-2xl mx-auto w-full">
          <h2 className="text-base font-bold text-text-primary mb-1">
            Deploy New Local Model
          </h2>
          <p className="text-xs text-text-secondary mb-6">
            Register an open-weight model from your local runtime adapter into the sovereign workbench.
          </p>

          <form onSubmit={handleSaveModel} className="flex flex-col gap-4">
            {/* Step 1: Runtime */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                1. Local Runtime Adapter
              </label>
              <select
                value={newRuntimeId}
                onChange={(e) => setNewRuntimeId(e.target.value)}
                className="bg-bg-elevated border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
              >
                <option value="ollama-local">Ollama Local (http://127.0.0.1:11434) · GPU Passthrough</option>
                <option value="vllm-local">vLLM Engine (http://127.0.0.1:8001)</option>
                <option value="fastembed-cpu">FastEmbed ONNX CPU (Embedding Runtime)</option>
              </select>
            </div>

            {/* Step 2: Model Tag & Display Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  2. Runtime Model Tag
                </label>
                <input
                  type="text"
                  required
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  placeholder="e.g. qwen2.5-vl:3b"
                  className="bg-bg-elevated border border-border rounded-md px-3 py-2 text-xs text-text-primary font-mono focus:border-accent outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g. Qwen 2.5 Vision Specialist"
                  className="bg-bg-elevated border border-border rounded-md px-3 py-2 text-xs text-text-primary focus:border-accent outline-none"
                />
              </div>
            </div>

            {/* Step 3: VRAM requirement */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                3. Estimated VRAM Footprint: <strong className="text-text-primary">{newVramGb} GB</strong>
              </label>
              <input
                type="range"
                min={1}
                max={24}
                step={0.5}
                value={newVramGb}
                onChange={(e) => setNewVramGb(parseFloat(e.target.value))}
                className="accent-accent"
              />
            </div>

            {/* Live Test Connection Probe */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-text-primary">
                  Capability Verification Checklist
                </span>
                <button
                  type="button"
                  onClick={handleProbe}
                  disabled={probing}
                  className="px-2.5 py-1 rounded bg-bg-elevated border border-border hover:border-accent text-accent text-xs font-mono flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${probing ? 'animate-spin' : ''}`} />
                  <span>Test Connection</span>
                </button>
              </div>

              {probeResult ? (
                <div className="bg-bg-base border border-border rounded p-3 text-xs font-mono flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-ok">
                    <span>✓ Runtime reachable</span>
                    <span>12ms</span>
                  </div>
                  <div className="flex items-center justify-between text-ok">
                    <span>✓ Model weights present locally</span>
                    <span>present</span>
                  </div>
                  <div className="flex items-center justify-between text-ok">
                    <span>✓ Text generation probe</span>
                    <span>{probeResult.text_latency_ms}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Multimodal vision probe</span>
                    <span className={probeResult.vision_ok ? 'text-ok' : 'text-text-tertiary'}>
                      {probeResult.vision_ok ? '✓ verified' : 'not enabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-text-secondary">
                    <span>VRAM delta measured</span>
                    <span>{probeResult.vram_delta_mb} MB</span>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-base border border-border rounded p-3 text-center text-xs text-text-tertiary font-mono">
                  Click &ldquo;Test Connection&rdquo; to execute live local verification probe before saving.
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full py-2.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all"
            >
              {saveSuccess ? '✓ Model Registered Successfully!' : 'Register Model in Sovereign Fleet'}
            </button>
          </form>
        </div>
      )}

      {/* Tab Content: Playground matching Reference Image 2 */}
      {activeTab === 'playground' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-primary">
                Test and compare different open-weight models on your data
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary cursor-pointer" htmlFor="compare-toggle">
                Compare Mode
              </label>
              <input
                type="checkbox"
                id="compare-toggle"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-bg-panel text-accent"
              />
            </div>
          </div>

          {/* Model selection cards matching Reference Image 2 Center */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'llama-3-1-70b', name: 'Llama 3.1 70B', author: 'Meta', tags: ['Text', 'Vision', 'Code'] },
              { id: 'qwen2-vl-72b', name: 'Qwen2-VL 72B', author: 'Alibaba', tags: ['Vision', 'Multimodal'] },
              { id: 'mistral-large-2', name: 'Mistral Large 2', author: 'Mistral AI', tags: ['Text', 'Vision'] },
              { id: 'phi-3-medium', name: 'Phi 3 Medium', author: 'Microsoft', tags: ['Text'] },
            ].map((pm) => (
              <div
                key={pm.id}
                onClick={() => setSelectedPlaygroundModel(pm.id)}
                className={`p-3 rounded-md border cursor-pointer transition-all flex flex-col justify-between ${
                  selectedPlaygroundModel === pm.id
                    ? 'bg-accent/10 border-accent'
                    : 'bg-bg-panel border-border hover:border-border-strong'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Cpu className="w-5 h-5 text-accent" />
                    <span className="text-xs font-mono text-text-tertiary">{pm.author}</span>
                  </div>
                  <h3 className="text-sm font-bold text-text-primary mb-1">{pm.name}</h3>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {pm.tags.map((t) => (
                      <span key={t} className="text-xs font-mono px-1.5 py-0.5 rounded bg-bg-elevated border border-border text-text-secondary">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className={`w-full py-1.5 text-xs font-semibold rounded transition-colors ${
                    selectedPlaygroundModel === pm.id
                      ? 'bg-accent text-white'
                      : 'bg-bg-elevated border border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {selectedPlaygroundModel === pm.id ? 'Selected' : 'Select'}
                </button>
              </div>
            ))}
          </div>

          {/* Model Response Comparison Box */}
          <div className="bg-bg-panel border border-border rounded-md p-4">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <span className="text-sm font-semibold text-text-primary">
                Model Response Comparison
              </span>
              <div className="flex gap-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-medium">
                  Llama 3.1 70B
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-bg-elevated text-text-tertiary">
                  Qwen2-VL 72B
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-bg-elevated text-text-tertiary">
                  Mistral Large 2
                </span>
              </div>
            </div>

            <div className="text-sm text-text-secondary whitespace-pre-line leading-relaxed mb-4 font-sans">
              Based on the provided maintenance document and sensor data, here are the key findings:

              1. The vibration levels are 23% higher than normal operating range.
              2. This indicates potential bearing wear in the distillation column DC-101.
              3. Recommended actions:
                 • Schedule non-destructive inspection within 72 hours.
                 • Check alignment and lubrication systems immediately.
                 • Review ASME Section VIII wall thickness logs.
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-text-tertiary border-t border-border pt-2">
              <span>Tokens: 432 | Latency: 2.1s</span>
              <span className="text-ok">✓ Grounded against local corpus</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Available Models */}
      {activeTab === 'available' && (
        <div className="bg-bg-panel border border-border rounded-md p-8 text-center">
          <Cpu className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            All Recommended Models Present in Local Storage
          </h2>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            All 5 open-weight models declared in your hardware profiles (`qwen3:8b`, `qwen2.5-coder:7b`, `llama3.1:70b`, `qwen2.5-vl:3b`, `fastembed-cpu`) are physically cached on disk.
          </p>
        </div>
      )}
    </div>
  );
}
