'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import type { GuardResponse, ToolTestResult } from '../../lib/types';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';

const EGRESS_TEST_SNIPPET = `import socket
import subprocess

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('8.8.8.8', 53))
subprocess.run(['curl', 'https://example.com'])
`;

export default function ToolsSandboxPage() {
  const { data: tools, loading: toolsLoading, error: toolsError } = useApiResource(() => api.getTools(), []);
  const { data: sandboxPolicy } = useApiResource(() => api.getSandboxPolicy(), []);

  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<ToolTestResult | null>(null);

  const [pythonCode, setPythonCode] = useState(
    `import math
import socket  # Try testing disallowed import
import json

def calculate_pressure(temp):
    return math.sqrt(temp * 1.8)

print(calculate_pressure(342))`
  );

  const [scanResult, setScanResult] = useState<GuardResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [egressTestResult, setEgressTestResult] = useState<GuardResponse | null>(null);
  const [egressTesting, setEgressTesting] = useState(false);

  const handleScanCode = async () => {
    setScanning(true);
    try {
      setScanResult(await api.scanAstGuard(pythonCode));
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const handleRunToolTest = async (toolName: string) => {
    setTestingTool(toolName);
    try {
      setTestOutput(await api.testTool(toolName, { sample_run: true }));
    } catch (err) {
      console.error(err);
    } finally {
      setTestingTool(null);
    }
  };

  const handleTestSandboxEgress = async () => {
    setEgressTesting(true);
    try {
      setEgressTestResult(await api.scanAstGuard(EGRESS_TEST_SNIPPET));
    } catch (err) {
      console.error(err);
    } finally {
      setEgressTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Tools & Code Execution Sandbox</h1>
          <p className="text-sm text-text-secondary">
            Tool registry, JSON schemas, and the static AST security scanner
          </p>
        </div>
      </div>

      <div className="bg-bg-panel border border-border rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-bg-elevated border border-border flex items-center justify-center text-ok flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-ok" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary font-mono uppercase">Sandbox Isolation Policy</h2>
            {sandboxPolicy ? (
              <div className="text-xs font-mono text-text-tertiary flex flex-wrap gap-3 mt-1">
                <span>
                  network: <strong className="text-text-secondary">{sandboxPolicy.network.network_mode}</strong>
                </span>
                <span>·</span>
                <span>
                  mem_limit: <strong className="text-text-secondary">{sandboxPolicy.limits.mem_limit}</strong>
                </span>
                <span>·</span>
                <span>
                  cpu_cores: <strong className="text-text-secondary">{sandboxPolicy.limits.cpu_cores}</strong>
                </span>
                <span>·</span>
                <span>
                  rootfs: <strong className="text-text-secondary">{sandboxPolicy.filesystem.read_only_rootfs ? 'read-only' : 'rw'}</strong>
                </span>
              </div>
            ) : (
              <span className="text-xs text-text-tertiary">Loading policy...</span>
            )}
          </div>
        </div>

        <button
          onClick={handleTestSandboxEgress}
          disabled={egressTesting}
          className="px-3.5 py-2 rounded-md bg-bg-elevated border border-border hover:border-error text-error text-xs font-mono transition-colors self-start sm:self-auto font-medium disabled:opacity-50"
        >
          {egressTesting ? 'Scanning...' : 'Test AST Guard Egress Denial'}
        </button>
      </div>

      {egressTestResult && (
        <div className="bg-[#090C12] border border-border rounded-md p-4 font-mono text-xs text-text-secondary leading-relaxed animate-in fade-in duration-150 flex flex-col gap-2">
          <div className={`font-bold ${egressTestResult.accepted ? 'text-ok' : 'text-error'}`}>
            {egressTestResult.accepted
              ? '✓ Code accepted (no violations found -- unexpected for this snippet)'
              : `✗ Code rejected: ${egressTestResult.findings.length} violation(s) detected before any container was dispatched`}
          </div>
          {egressTestResult.findings.map((f, i) => (
            <div key={i} className="text-text-tertiary">
              Line {f.line}: {f.symbol} -- {f.detail} ({f.rule})
            </div>
          ))}
        </div>
      )}

      {testOutput && (
        <div className="bg-[#090C12] border border-accent/40 rounded-md p-4 font-mono text-xs text-accent flex flex-col gap-1 animate-in fade-in duration-150">
          <div className="flex items-center justify-between font-bold">
            <span>{testOutput.ok ? '✓' : '✗'} Tool Test</span>
            <span className="text-text-tertiary font-normal">{testOutput.duration_ms.toFixed(1)}ms</span>
          </div>
          {testOutput.error ? (
            <div className="text-error">{testOutput.error}</div>
          ) : (
            <div className="text-text-secondary">{JSON.stringify(testOutput.output)}</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-panel border border-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">
                Interactive AST Guard Scanner
              </h2>
              <span className="text-xs text-text-tertiary">Detects prohibited imports before container dispatch</span>
            </div>
            <button
              onClick={handleScanCode}
              disabled={scanning}
              className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold font-mono shadow transition-all disabled:opacity-50"
            >
              {scanning ? 'Scanning...' : 'Scan AST'}
            </button>
          </div>

          <textarea
            rows={10}
            value={pythonCode}
            onChange={(e) => setPythonCode(e.target.value)}
            className="w-full bg-[#090C12] border border-border rounded p-3 text-xs font-mono text-text-primary focus:border-accent outline-none resize-none leading-relaxed"
          />

          {scanResult && (
            <div className="border-t border-border pt-3">
              {scanResult.accepted ? (
                <div className="p-3 rounded bg-ok-muted border border-ok/30 text-ok text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>AST validation passed: no prohibited modules detected.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-error font-mono">
                    Policy violations found ({scanResult.findings.length}):
                  </span>
                  {scanResult.findings.map((f, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-error/15 border border-error/40 text-error text-xs font-mono flex flex-col gap-0.5">
                      <div className="font-bold">
                        Line {f.line}: {f.symbol}
                      </div>
                      <div className="text-xs text-text-tertiary">{f.detail} ({f.rule})</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-bg-panel border border-border rounded-lg p-5 flex flex-col gap-3">
          <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">
            Registered Agent Tools ({(tools ?? []).length})
          </h2>

          {toolsLoading && <p className="text-xs text-text-tertiary font-mono">Loading tools...</p>}
          {toolsError && <ErrorState error={toolsError} compact />}

          <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px]">
            {(tools ?? []).map((tool) => (
              <div key={tool.name} className="bg-bg-elevated border border-border rounded-md p-3.5 text-xs flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-accent text-sm">{tool.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xs px-2 py-0.5 rounded border font-medium ${
                        tool.implemented ? 'bg-bg-base border-border text-ok' : 'bg-warn/10 border-warn/30 text-warn'
                      }`}
                    >
                      {tool.implemented ? 'implemented' : 'not implemented'}
                    </span>
                    <button
                      onClick={() => handleRunToolTest(tool.name)}
                      disabled={testingTool === tool.name}
                      className="font-mono text-xs px-2.5 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 font-semibold transition-colors disabled:opacity-50"
                    >
                      {testingTool === tool.name ? 'Testing...' : 'Test Tool'}
                    </button>
                  </div>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed">{tool.description}</p>
                <div className="pt-2 border-t border-border/60">
                  <span className="text-xs font-mono text-text-tertiary block mb-1">Parameters JSON Schema:</span>
                  <pre className="bg-bg-base p-2 rounded border border-border text-xs font-mono text-text-secondary overflow-x-auto">
                    {JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
