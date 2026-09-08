'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { PolicyRead, ScoringWeights, SimulateResponse } from '../../lib/types';
import {
  Sliders,
  Play,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  HelpCircle,
  Save
} from 'lucide-react';

const DEFAULT_WEIGHTS: ScoringWeights = {
  capability: 0.4,
  preferred: 0.15,
  context: 0.1,
  latency: 0.1,
  priority: 0.1,
  residency: 0.1,
  reliability: 0.05,
};

export default function RoutingStudioPage() {
  const [prompt, setPrompt] = useState(
    'Review this heat exchanger inspection report and verify if wall thickness complies with ASME safety limits.'
  );

  const [policies, setPolicies] = useState<PolicyRead[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyRead | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);

  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      const list = await api.getRoutingPolicies();
      setPolicies(list);
      if (list.length > 0) {
        setSelectedPolicy(list[0]);
        setWeights({ ...DEFAULT_WEIGHTS, ...(list[0].weights as Partial<ScoringWeights>) });
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load policies.');
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    setSimError(null);
    try {
      const res = await api.simulateRouting({ prompt, weights });
      setSimResult(res);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setSimulating(false);
    }
  };

  const handleSavePolicy = async () => {
    if (!selectedPolicy) return;
    setSaving(true);
    try {
      await api.saveRoutingPolicy(selectedPolicy.id, {
        name: selectedPolicy.name,
        enabled: selectedPolicy.enabled,
        priority: selectedPolicy.priority,
        graph: selectedPolicy.graph,
        rules: selectedPolicy.rules,
        weights: { ...weights },
      });
      setSaveMessage('Policy weights successfully persisted');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Routing Studio</h1>
          <p className="text-sm text-text-secondary">
            7-factor scoring weights tuner and deterministic arbitration simulator
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={handleSavePolicy}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-bg-panel border border-border hover:border-accent text-text-primary hover:text-accent text-xs font-semibold font-mono shadow transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Policy'}</span>
          </button>

          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold font-mono shadow transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{simulating ? 'Simulating Pipeline...' : 'Run Simulation'}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-md bg-error/10 border border-error/30 text-error text-xs font-mono">{loadError}</div>
      )}

      {saveMessage && (
        <div className="p-3 rounded-md bg-ok-muted border border-ok/30 text-ok text-xs font-mono flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Main Grid: Policy Pipeline Canvas + Weight Tuner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 5-Stage Routing Pipeline Canvas (2 cols) */}
        <div className="lg:col-span-2 bg-[#090C12] border border-border rounded-lg p-5 flex flex-col justify-between min-h-[460px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold font-mono uppercase text-text-primary">
              5-Stage Dynamic Routing Pipeline
            </span>
            <span className="text-xs font-mono text-ok">Pure Function · Zero Hardcoded Models</span>
          </div>

          {/* SVG Pipeline Graph */}
          <div className="flex flex-col gap-3 my-auto">
            {[
              { stage: '1. Task Classification', desc: 'Intent classification & capability extraction', active: true },
              { stage: '2. Hard Filtering', desc: 'Eliminate models lacking required modalities or VRAM bounds', active: true },
              { stage: '3. 7-Factor Weighted Scoring', desc: 'Mathematical arbitration (0 - 100 score)', active: true },
              { stage: '4. Policy Overlay', desc: 'Institutional overrides and safety constraints', active: true },
              { stage: '5. Fallback Chain Assembly', desc: 'Assemble fallback redundancy chain', active: true },
            ].map((st, i) => (
              <div
                key={i}
                className={`p-3 rounded-md border flex items-center justify-between transition-all ${
                  simResult
                    ? 'bg-bg-panel border-accent shadow-glow-accent'
                    : 'bg-bg-panel border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-bg-elevated border border-border flex items-center justify-center font-mono text-xs text-accent">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-sm text-text-primary">{st.stage}</div>
                    <div className="text-xs text-text-tertiary font-mono">{st.desc}</div>
                  </div>
                </div>

                {simResult && i === 2 && (
                  <span className="font-mono text-xs font-bold text-accent px-2 py-0.5 rounded bg-accent/15 border border-accent/30">
                    Winner: {simResult.decision.selected} ({simResult.decision.score.toFixed(1)})
                  </span>
                )}
              </div>
            ))}
          </div>

          {simError && <div className="mt-4 p-3 rounded bg-error/10 border border-error/30 text-error text-xs font-mono">{simError}</div>}

          {simResult && (
            <div className="mt-4 p-3 bg-bg-elevated border border-accent/40 rounded text-xs font-mono flex flex-col gap-2 animate-in fade-in duration-200">
              <div className="flex justify-between text-accent font-bold">
                <span>Decision Rationale:</span>
                <span>Latency: {simResult.decision.decided_in_ms.toFixed(1)}ms</span>
              </div>
              <p className="font-sans text-text-secondary">{simResult.decision.rationale}</p>
              {simResult.decision.candidates.length > 0 && (
                <div className="flex flex-col gap-1 pt-1 border-t border-border/50">
                  {simResult.decision.candidates.map((c) => (
                    <div key={c.model_id} className="flex justify-between text-text-secondary">
                      <span className={c.model_id === simResult.decision.selected ? 'text-accent font-bold' : ''}>{c.model_id}</span>
                      <span>{c.total.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
              {simResult.decision.rejected.length > 0 && (
                <div className="flex flex-col gap-1 pt-1 border-t border-border/50">
                  {simResult.decision.rejected.map((r) => (
                    <div key={r.model_id} className="text-error">
                      {r.model_id}: {r.detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: 7-Factor Scoring Sliders Panel */}
        <div className="bg-bg-panel border border-border rounded-lg p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">
              7-Factor Scoring Weights
            </h2>
            <p className="text-xs text-text-tertiary">
              Adjust arbitration weights for hardware profile
            </p>
          </div>

          <div className="flex flex-col gap-3 text-xs font-mono">
            {Object.entries(weights).map(([k, val]) => (
              <div key={k} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="capitalize text-text-secondary">{k} Weight</span>
                  <span className="font-bold text-text-primary">w = {val.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={val}
                  onChange={(e) =>
                    setWeights({ ...weights, [k]: parseFloat(e.target.value) })
                  }
                  className="accent-accent h-1.5 bg-bg-base rounded"
                />
              </div>
            ))}
          </div>

          {/* Prompt input */}
          <div className="pt-3 border-t border-border flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-primary">Test Prompt</label>
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-bg-elevated border border-border rounded p-2 text-xs text-text-primary focus:border-accent outline-none resize-none leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
