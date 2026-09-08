'use client';

import React, { useState, useEffect } from 'react';
import { api, useIsMock } from '../../lib/api';
import { SimulateResponse, RoutingPolicy } from '../../lib/types';
import { MockBadge } from '../../components/primitives/MockBadge';
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

export default function RoutingStudioPage() {
  const isRoutingMock = useIsMock('routing');
  const [prompt, setPrompt] = useState(
    'Review this heat exchanger inspection report and verify if wall thickness complies with ASME safety limits.'
  );

  const [policies, setPolicies] = useState<RoutingPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('default-institutional');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // 7 Scoring Weights matching FRONTEND_SPECIFICATION.md Section 4.5
  const [weights, setWeights] = useState({
    capability: 0.40,
    preferred: 0.15,
    context: 0.10,
    latency: 0.10,
    priority: 0.10,
    residency: 0.10,
    reliability: 0.05,
  });

  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      const list = await api.getRoutingPolicies();
      setPolicies(list);
      if (list.length > 0 && list[0].weights) {
        setWeights(list[0].weights);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await api.simulateRouting({
        prompt,
        weights,
      });
      setSimResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  const handleSavePolicy = async () => {
    setSaving(true);
    try {
      await api.saveRoutingPolicy(selectedPolicyId, {
        weights,
      });
      setSaveMessage('Policy weights successfully persisted');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Routing Studio
            </h1>
            {isRoutingMock && <MockBadge label="Mock Engine" size="sm" />}
          </div>
          <p className="text-sm text-text-secondary">
            Visual policy editor, 7-factor scoring weights tuner, and deterministic arbitration simulator
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
                    Winner: {simResult.decision.selected} ({simResult.decision.score})
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Simulation Output Card */}
          {simResult && (
            <div className="mt-4 p-3 bg-bg-elevated border border-accent/40 rounded text-xs font-mono flex flex-col gap-1.5 animate-in fade-in duration-200">
              <div className="flex justify-between text-accent font-bold">
                <span>Decision Rationale:</span>
                <span>Latency: {simResult.decision.decided_in_ms}ms</span>
              </div>
              <p className="font-sans text-text-secondary">
                {simResult.decision.rationale}
              </p>
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
