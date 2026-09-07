'use client';

import React, { useState } from 'react';
import {
  MOCK_WORKFLOW_NODES,
  MOCK_WORKFLOW_EDGES
} from '../../lib/mockData';
import { WorkflowNode } from '../../lib/types';
import {
  GitFork,
  Cpu,
  FileText,
  BarChart3,
  Wrench,
  HelpCircle,
  UserCheck,
  CheckCircle,
  Save,
  Play,
  Settings2,
  Plus
} from 'lucide-react';

export default function WorkflowsPage() {
  const [nodes, setNodes] = useState<WorkflowNode[]>(MOCK_WORKFLOW_NODES);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(MOCK_WORKFLOW_NODES[1]);
  const [workflowName, setWorkflowName] = useState('Regulatory Compliance Analysis');
  const [description, setDescription] = useState(
    'Analyzes new documents for regulatory compliance using multi-agent pipeline.'
  );
  const [assignedModel, setAssignedModel] = useState('Llama 3.1 70B');
  const [enableHumanReview, setEnableHumanReview] = useState(true);
  const [saveToKb, setSaveToKb] = useState(true);
  const [sendNotifications, setSendNotifications] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);

  const nodePalette = [
    { type: 'llm_agent', label: 'LLM Agent', desc: 'Reasoning & planning', icon: Cpu, color: '#4DA3FF' },
    { type: 'document_reader', label: 'Document Reader', desc: 'Extract information', icon: FileText, color: '#35C08A' },
    { type: 'data_analyzer', label: 'Data Analyzer', desc: 'Analyze structured data', icon: BarChart3, color: '#4DD4AC' },
    { type: 'tool_executor', label: 'Tool Executor', desc: 'Run tools & APIs', icon: Wrench, color: '#E0A32E' },
    { type: 'conditional', label: 'Conditional', desc: 'Logic & branching', icon: GitFork, color: '#FACC15' },
    { type: 'human_review', label: 'Human Review', desc: 'Approval step', icon: UserCheck, color: '#A78BFA' },
    { type: 'output', label: 'Output', desc: 'Generate final output', icon: CheckCircle, color: '#35C08A' },
  ];

  const handleDeploy = () => {
    setIsDeploying(true);
    setTimeout(() => {
      setIsDeploying(false);
      setDeployed(true);
      setTimeout(() => setDeployed(false), 2500);
    }, 600);
  };

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      {/* Top Bar */}
      <div className="h-12 bg-bg-panel border-b border-border px-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-sm font-bold text-text-primary">Agent Workflow Builder</h1>
          <p className="text-[11px] text-text-tertiary">
            Create and orchestrate multi-step agent workflows for complex industrial tasks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Workflow configuration saved locally.')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-bg-elevated border border-border hover:border-border-strong text-text-secondary hover:text-text-primary text-xs font-mono transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Main 3-zone layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Palette: Nodes & Templates */}
        <div className="w-full lg:w-56 bg-bg-panel border-b lg:border-b-0 lg:border-r border-border p-3 flex flex-col gap-3 flex-shrink-0">
          <div className="flex border-b border-border pb-2 text-xs font-mono">
            <span className="text-accent font-bold">Nodes</span>
            <span className="text-text-tertiary ml-4 hover:text-text-secondary cursor-pointer">Templates</span>
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto">
            {nodePalette.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.type}
                  className="p-2.5 rounded-md bg-bg-elevated border border-border hover:border-accent cursor-grab active:cursor-grabbing text-xs transition-colors flex items-center gap-2.5"
                  title="Drag or click to place in workflow"
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${p.color}15`, color: p.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-text-primary leading-tight truncate">
                      {p.label}
                    </div>
                    <div className="text-[10px] text-text-tertiary leading-tight truncate">
                      {p.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Directed Flowchart Canvas matching Reference Image 2 Top Right */}
        <div className="flex-1 bg-[#0A0C10] relative overflow-hidden flex items-center justify-center p-6">
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#2E3542 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          <svg className="w-full h-full max-w-2xl" viewBox="100 10 500 520">
            <defs>
              <marker
                id="wfArrow"
                viewBox="0 0 10 10"
                refX="16"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2E3542" />
              </marker>
            </defs>

            {/* Connecting Lines */}
            {MOCK_WORKFLOW_EDGES.map((edge) => {
              const s = nodes.find((n) => n.id === edge.source);
              const t = nodes.find((n) => n.id === edge.target);
              if (!s || !t) return null;

              const sy = s.y + 24;
              const ty = t.y - 20;

              return (
                <path
                  key={edge.id}
                  d={`M ${s.x} ${sy} C ${s.x} ${(sy + ty) / 2}, ${t.x} ${(sy + ty) / 2}, ${t.x} ${ty}`}
                  fill="none"
                  stroke="#2E3542"
                  strokeWidth="2"
                  markerEnd="url(#wfArrow)"
                />
              );
            })}

            {/* Render Nodes matching Reference Image 2 */}
            {nodes.map((n) => {
              const isSelected = selectedNode?.id === n.id;
              let badgeColor = '#4DA3FF';
              if (n.type === 'trigger' || n.type === 'output') badgeColor = '#35C08A';
              if (n.type === 'document_reader') badgeColor = '#4DD4AC';
              if (n.type === 'data_analyzer') badgeColor = '#4DA3FF';
              if (n.type === 'tool_executor') badgeColor = '#E0A32E';

              return (
                <g
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className="cursor-pointer group"
                >
                  <rect
                    x={n.x - 70}
                    y={n.y - 20}
                    width="140"
                    height="42"
                    rx="6"
                    fill="#171B22"
                    stroke={isSelected ? '#4DA3FF' : '#232833'}
                    strokeWidth={isSelected ? '2' : '1'}
                    className="group-hover:stroke-border-strong transition-all"
                  />
                  <rect
                    x={n.x - 70}
                    y={n.y - 20}
                    width="4"
                    height="42"
                    rx="2"
                    fill={badgeColor}
                  />
                  <text
                    x={n.x - 56}
                    y={n.y - 4}
                    fill="#E6EAF2"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="Inter"
                  >
                    {n.label}
                  </text>
                  <text
                    x={n.x - 56}
                    y={n.y + 12}
                    fill="#8B94A6"
                    fontSize="8.5"
                    fontFamily="JetBrains Mono"
                  >
                    {n.subtext && n.subtext.length > 20 ? n.subtext.slice(0, 19) + '...' : n.subtext}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right Panel: Workflow Settings matching Reference Image 2 Top Right */}
        <div className="w-full lg:w-72 bg-bg-panel border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col justify-between flex-shrink-0 overflow-y-auto">
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">
              Workflow Settings
            </h2>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Name</label>
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none resize-none leading-relaxed"
              />
            </div>

            {/* Assigned Model */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Assigned Model</label>
              <select
                value={assignedModel}
                onChange={(e) => setAssignedModel(e.target.value)}
                className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
              >
                <option value="Llama 3.1 70B">Llama 3.1 70B</option>
                <option value="Qwen2-VL 72B">Qwen2-VL 72B</option>
                <option value="General Reasoning (Qwen 3 8B)">General Reasoning (Qwen 3 8B)</option>
              </select>
            </div>

            {/* Toggles matching Reference Image 2 */}
            <div className="flex flex-col gap-3 pt-2 border-t border-border text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Enable Human Review</span>
                <input
                  type="checkbox"
                  checked={enableHumanReview}
                  onChange={(e) => setEnableHumanReview(e.target.checked)}
                  className="w-4 h-4 rounded text-accent"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Save to Knowledge Base</span>
                <input
                  type="checkbox"
                  checked={saveToKb}
                  onChange={(e) => setSaveToKb(e.target.checked)}
                  className="w-4 h-4 rounded text-accent"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Send Notifications</span>
                <input
                  type="checkbox"
                  checked={sendNotifications}
                  onChange={(e) => setSendNotifications(e.target.checked)}
                  className="w-4 h-4 rounded text-accent"
                />
              </div>
            </div>
          </div>

          {/* Deploy Button matching Reference Image 2 */}
          <div className="pt-4 border-t border-border mt-4">
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="w-full py-2.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isDeploying ? 'Deploying...' : deployed ? '✓ Deployed Successfully' : 'Deploy Workflow'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
