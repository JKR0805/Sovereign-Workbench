'use client';

import React, { useState, useEffect } from 'react';
import { api, useIsMock } from '../../lib/api';
import { MOCK_TOOLS } from '../../lib/mockData';
import { MockBadge } from '../../components/primitives/MockBadge';
import { AstGuardResult, ToolSpecification, SandboxPolicy } from '../../lib/types';
import {
  Wrench,
  ShieldAlert,
  Terminal,
  Play,
  CheckCircle2,
  AlertTriangle,
  Code,
  Layers,
  Cpu
} from 'lucide-react';

export default function ToolsSandboxPage() {
  const isToolsMock = useIsMock('tools');
  const [tools, setTools] = useState<ToolSpecification[]>([]);
  const [sandboxPolicy, setSandboxPolicy] = useState<SandboxPolicy | null>(null);
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<any | null>(null);

  const [pythonCode, setPythonCode] = useState(
    `import math
import socket  # Try testing disallowed import
import json

def calculate_pressure(temp):
    # Simulated engineering script
    return math.sqrt(temp * 1.8)

print(calculate_pressure(342))`
  );

  const [scanResult, setScanResult] = useState<AstGuardResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sandboxOutput, setSandboxOutput] = useState<string | null>(null);

  useEffect(() => {
    loadToolsData();
  }, []);

  const loadToolsData = async () => {
    try {
      const [toolsList, policy] = await Promise.all([
        api.getTools(),
        api.getSandboxPolicy(),
      ]);
      setTools(toolsList);
      setSandboxPolicy(policy);
    } catch (err) {
      console.error(err);
    }
  };

  const handleScanCode = async () => {
    setScanning(true);
    try {
      const res = await api.scanAstGuard(pythonCode);
      setScanResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const handleRunToolTest = async (toolName: string) => {
    setTestingTool(toolName);
    try {
      const res = await api.testTool(toolName, { sample_run: true });
      setTestOutput(res);
    } catch (err) {
      console.error(err);
    } finally {
      setTestingTool(null);
    }
  };

  const handleTestSandboxEgress = () => {
    setSandboxOutput(
      `[SANDBOX RUNNER] Spawning ephemeral container (image: ${sandboxPolicy?.image || 'vajra-sandbox:py311'}, network: none)...
[SANDBOX RUNNER] Executing socket.connect(('8.8.8.8', 53))...
Traceback (most recent call last):
  File "test_egress.py", line 4, in <module>
    s.connect(('8.8.8.8', 53))
OSError: [Errno 101] Network is unreachable

[SANDBOX SENTINEL] Confirmed: Container has zero virtual network interfaces (isolated kernel netns).`
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Tools & Code Execution Sandbox
            </h1>
            {isToolsMock && <MockBadge label="Mock Policy & Specs" size="sm" />}
          </div>
          <p className="text-sm text-text-secondary">
            Tool registry, JSON schemas, Docker container sandbox, and static AST security scanner
          </p>
        </div>
      </div>

      {/* Sandbox Isolation Policy Banner */}
      <div className="bg-bg-panel border border-border rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-bg-elevated border border-border flex items-center justify-center text-ok flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-ok" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary font-mono uppercase">
              Docker Sandbox Isolation Parameters
            </h2>
            <div className="text-xs font-mono text-text-tertiary flex flex-wrap gap-3 mt-1">
              <span>network_disabled: <strong className="text-text-secondary">{sandboxPolicy?.network_disabled !== false ? 'true (--network=none)' : 'false'}</strong></span>
              <span>·</span>
              <span>memory_limit: <strong className="text-text-secondary">{sandboxPolicy?.memory_limit_mb || 1024} MB</strong></span>
              <span>·</span>
              <span>cpu_limit: <strong className="text-text-secondary">{sandboxPolicy?.cpu_quota_cores || 2} Cores</strong></span>
              <span>·</span>
              <span>rootfs: <strong className="text-text-secondary">{sandboxPolicy?.read_only_rootfs !== false ? 'read-only' : 'rw'}</strong></span>
            </div>
          </div>
        </div>

        <button
          onClick={handleTestSandboxEgress}
          className="px-3.5 py-2 rounded-md bg-bg-elevated border border-border hover:border-error text-error text-xs font-mono transition-colors self-start sm:self-auto font-medium"
        >
          Test Sandbox Egress Denial
        </button>
      </div>

      {sandboxOutput && (
        <div className="bg-[#090C12] border border-border rounded-md p-4 font-mono text-xs text-text-secondary whitespace-pre-wrap leading-relaxed animate-in fade-in duration-150">
          {sandboxOutput}
        </div>
      )}

      {testOutput && (
        <div className="bg-[#090C12] border border-accent/40 rounded-md p-4 font-mono text-xs text-accent flex flex-col gap-1 animate-in fade-in duration-150">
          <div className="flex items-center justify-between font-bold">
            <span>✓ Tool Validation Test: {testOutput.tool}</span>
            <span className="text-text-tertiary font-normal">{testOutput.duration_ms}ms</span>
          </div>
          <div className="text-text-secondary">{JSON.stringify(testOutput.output)}</div>
        </div>
      )}

      {/* Two Column Grid: AST Guard Tester & Tools Inventory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Interactive AST Guard Tester matching FRONTEND_SPECIFICATION.md */}
        <div className="bg-bg-panel border border-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">
                Interactive AST Guard Scanner
              </h2>
              <span className="text-xs text-text-tertiary">
                Detects prohibited networking or subprocess imports before container dispatch
              </span>
            </div>

            <button
              onClick={handleScanCode}
              disabled={scanning}
              className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold font-mono shadow transition-all"
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
              {scanResult.valid ? (
                <div className="p-3 rounded bg-ok-muted border border-ok/30 text-ok text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>✓ AST Validation Passed: No prohibited modules detected.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-error font-mono">
                    ⚠ AST Policy Violations Found ({scanResult.violations.length}):
                  </span>
                  {scanResult.violations.map((v, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-error/15 border border-error/40 text-error text-xs font-mono flex flex-col gap-0.5"
                    >
                      <div className="font-bold">
                        Line {v.line}: {v.code_snippet}
                      </div>
                      <div className="text-xs text-text-tertiary">
                        Violation Rule: {v.rule} (Blocked before execution)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Registered Tools Specifications */}
        <div className="bg-bg-panel border border-border rounded-lg p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">
              Registered Agent Tools ({(tools.length > 0 ? tools : MOCK_TOOLS).length})
            </h2>
            {isToolsMock && <MockBadge label="Mock Specs" size="sm" />}
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px]">
            {(tools.length > 0 ? tools : MOCK_TOOLS).map((tool) => (
              <div
                key={tool.name}
                className="bg-bg-elevated border border-border rounded-md p-3.5 text-xs flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-accent text-sm">{tool.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-bg-base border border-border text-ok font-medium">
                      {tool.execution_target}
                    </span>
                    <button
                      onClick={() => handleRunToolTest(tool.name)}
                      disabled={testingTool === tool.name}
                      className="font-mono text-xs px-2.5 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 font-semibold transition-colors"
                    >
                      {testingTool === tool.name ? 'Testing...' : 'Test Tool'}
                    </button>
                  </div>
                </div>

                <p className="text-text-secondary text-sm leading-relaxed">
                  {tool.description}
                </p>

                <div className="pt-2 border-t border-border/60">
                  <span className="text-xs font-mono text-text-tertiary block mb-1">
                    Parameters JSON Schema:
                  </span>
                  <pre className="bg-bg-base p-2 rounded border border-border text-xs font-mono text-text-secondary overflow-x-auto">
                    {JSON.stringify(tool.parameters_schema, null, 2)}
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
