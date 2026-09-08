'use client';

import React, { useState, useEffect } from 'react';
import { WorkflowNode, WorkflowEdge } from '../../lib/types';
import { api } from '../../lib/api';
import {
  GitFork,
  Cpu,
  FileText,
  BarChart3,
  Wrench,
  UserCheck,
  CheckCircle,
  Save,
  Play,
  Trash2,
  Plus,
  ArrowRight,
  Sparkles,
  RotateCcw,
  Sliders,
  Layers,
  PencilRuler
} from 'lucide-react';

// Starter definitions for the design canvas below. This page is a workflow
// *designer*: it lets an operator sketch a pipeline and its node graph.
// There is no backend workflow engine yet (no model, table or endpoint), so
// nothing here executes -- see the "Design Preview" notice and the disabled
// Deploy button.
const STARTER_NODES: WorkflowNode[] = [
  { id: 'n-1', label: 'Document Trigger', type: 'trigger', subtext: 'New upload to Knowledge Center', x: 320, y: 30 },
  { id: 'n-2', label: 'Compliance Reader', type: 'document_reader', subtext: 'Extract clauses & obligations', x: 320, y: 150 },
  { id: 'n-3', label: 'Compliance Agent', type: 'llm_agent', subtext: 'Assess regulatory alignment', x: 320, y: 280 },
  { id: 'n-4', label: 'Human Review', type: 'human_review', subtext: 'Operator sign-off', x: 320, y: 410 },
  { id: 'n-5', label: 'Report Output', type: 'output', subtext: 'Emit summary artifact', x: 320, y: 530 },
];
const STARTER_EDGES: WorkflowEdge[] = [
  { id: 'e-1', source: 'n-1', target: 'n-2' },
  { id: 'e-2', source: 'n-2', target: 'n-3' },
  { id: 'e-3', source: 'n-3', target: 'n-4' },
  { id: 'e-4', source: 'n-4', target: 'n-5' },
];

interface PrebuiltTemplate {
  id: string;
  name: string;
  desc: string;
  model: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: 'compliance',
    name: 'Regulatory Compliance Analysis',
    desc: 'Sketches a pipeline for analyzing new documents for regulatory compliance.',
    model: 'general-reasoning',
    nodes: STARTER_NODES,
    edges: STARTER_EDGES,
  },
  {
    id: 'sensor-fault',
    name: 'Vibration & Bearing Fault Root Cause',
    desc: 'Diagnoses high-frequency accelerometer telemetry and cross-checks maintenance logs.',
    model: 'Llava 7B',
    nodes: [
      { id: 'v-1', label: 'Telemetry Ingestion', type: 'trigger', subtext: 'MQTT Vibration Stream', x: 320, y: 30 },
      { id: 'v-2', label: 'Signal FFT Processor', type: 'data_analyzer', subtext: 'Extract 1x/2x harmonics', x: 320, y: 140 },
      { id: 'v-3', label: 'Bearing Classifier', type: 'llm_agent', model: 'Llava 7B', subtext: 'Classify outer race defect', x: 200, y: 260 },
      { id: 'v-4', label: 'Maintenance Cross-Check', type: 'document_reader', subtext: 'Look up grease schedule', x: 440, y: 260 },
      { id: 'v-5', label: 'Work Order Dispatch', type: 'output', subtext: 'Trigger SAP PM notification', x: 320, y: 390 },
    ],
    edges: [
      { id: 've-1', source: 'v-1', target: 'v-2' },
      { id: 've-2', source: 'v-2', target: 'v-3' },
      { id: 've-3', source: 'v-2', target: 'v-4' },
      { id: 've-4', source: 'v-3', target: 'v-5' },
      { id: 've-5', source: 'v-4', target: 'v-5' },
    ],
  },
  {
    id: 'code-ast',
    name: 'Airgapped Code AST Security Scan',
    desc: 'Scans Python algorithms for disallowed socket imports before local container sandbox dispatch.',
    model: 'Qwen 2.5 Coder 7B',
    nodes: [
      { id: 'c-1', label: 'Code Submission', type: 'trigger', subtext: 'User Script Payload', x: 320, y: 30 },
      { id: 'c-2', label: 'AST Policy Guard', type: 'tool_executor', subtext: 'Scan forbidden syscalls', x: 320, y: 150 },
      { id: 'c-3', label: 'Static Analyzer Agent', type: 'llm_agent', model: 'Qwen 2.5 Coder 7B', subtext: 'Verify memory safety & complexity', x: 320, y: 280 },
      { id: 'c-4', label: 'Isolated Execution', type: 'output', subtext: 'Run in cgroups sandbox', x: 320, y: 410 },
    ],
    edges: [
      { id: 'ce-1', source: 'c-1', target: 'c-2' },
      { id: 'ce-2', source: 'c-2', target: 'c-3' },
      { id: 'ce-3', source: 'c-3', target: 'c-4' },
    ],
  }
];

const SERVICE_CAPABILITIES = new Set(['embedding', 'reranking']);

export default function WorkflowsPage() {
  const [nodes, setNodes] = useState<WorkflowNode[]>(STARTER_NODES);
  const [edges, setEdges] = useState<WorkflowEdge[]>(STARTER_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(STARTER_NODES[1].id);
  const [workflowName, setWorkflowName] = useState('Regulatory Compliance Analysis');
  const [description, setDescription] = useState(
    'Sketches a pipeline for analyzing new documents for regulatory compliance.'
  );
  const [assignedModel, setAssignedModel] = useState('general-reasoning');
  const [enableHumanReview, setEnableHumanReview] = useState(true);
  const [saveToKb, setSaveToKb] = useState(true);
  const [sendNotifications, setSendNotifications] = useState(false);
  const [isSavedLocally, setIsSavedLocally] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [fleetModels, setFleetModels] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api
      .getModels()
      .then((mList) => {
        const keys = (m: { capabilities: Record<string, number> }) => Object.keys(m.capabilities || {});
        setFleetModels(
          mList
            .filter((m) => {
              const caps = keys(m);
              return caps.length === 0 || !caps.every((c) => SERVICE_CAPABILITIES.has(c));
            })
            .map((m) => ({ id: m.id, name: m.display_name }))
        );
      })
      .catch(() => setFleetModels([]));
  }, []);

  // Left sidebar tab: 'nodes' or 'templates'
  const [leftTab, setLeftTab] = useState<'nodes' | 'templates'>('nodes');
  // Right sidebar tab: 'node' or 'workflow'
  const [rightTab, setRightTab] = useState<'node' | 'workflow'>('node');
  // Target node to connect
  const [connectTargetId, setConnectTargetId] = useState<string>('');

  // Load from localStorage if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sovereign_custom_workflow');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.nodes && parsed.edges) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
          setWorkflowName(parsed.name || 'Custom Agent Workflow');
          setDescription(parsed.desc || '');
          setAssignedModel(parsed.model || 'Llama 3.1 70B');
          setSelectedNodeId(parsed.nodes[0]?.id || '');
          setIsSavedLocally(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null;

  const nodePalette = [
    { type: 'llm_agent', label: 'LLM Agent', desc: 'Reasoning & planning', icon: Cpu, color: '#4DA3FF' },
    { type: 'document_reader', label: 'Document Reader', desc: 'Extract clauses & tables', icon: FileText, color: '#35C08A' },
    { type: 'data_analyzer', label: 'Data Analyzer', desc: 'Analyze sensor logs', icon: BarChart3, color: '#4DD4AC' },
    { type: 'tool_executor', label: 'Tool Executor', desc: 'Run sandbox AST / scripts', icon: Wrench, color: '#E0A32E' },
    { type: 'conditional', label: 'Conditional', desc: 'Branching logic', icon: GitFork, color: '#FACC15' },
    { type: 'human_review', label: 'Human Review', desc: 'Operator approval', icon: UserCheck, color: '#A78BFA' },
    { type: 'output', label: 'Output Step', desc: 'Emit result / alert', icon: CheckCircle, color: '#35C08A' },
  ];

  // Add new node from palette
  const handleAddNodeFromPalette = (paletteItem: (typeof nodePalette)[0]) => {
    const newId = `node-${Date.now()}`;
    const nextY = nodes.length > 0 ? Math.max(...nodes.map((n) => n.y)) + 90 : 80;
    const nextX = nodes.length % 2 === 0 ? 320 : 220;

    const newNode: WorkflowNode = {
      id: newId,
      label: paletteItem.label,
      type: paletteItem.type as WorkflowNode['type'],
      subtext: paletteItem.desc,
      model: assignedModel,
      x: nextX,
      y: nextY,
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newId);
    setRightTab('node');
    setIsSavedLocally(false);
  };

  // Update selected node property
  const handleUpdateNode = (fields: Partial<WorkflowNode>) => {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...n, ...fields } : n))
    );
    setIsSavedLocally(false);
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    const remaining = nodes.filter((n) => n.id !== nodeId);
    if (remaining.length > 0) {
      setSelectedNodeId(remaining[0].id);
    }
    setIsSavedLocally(false);
  };

  // Connect edge
  const handleAddEdge = () => {
    if (!selectedNode || !connectTargetId || selectedNode.id === connectTargetId) return;
    const exists = edges.some(
      (e) => e.source === selectedNode.id && e.target === connectTargetId
    );
    if (exists) return;

    const newEdge: WorkflowEdge = {
      id: `edge-${Date.now()}`,
      source: selectedNode.id,
      target: connectTargetId,
    };
    setEdges((prev) => [...prev, newEdge]);
    setConnectTargetId('');
    setIsSavedLocally(false);
  };

  // Disconnect edge
  const handleRemoveEdge = (edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setIsSavedLocally(false);
  };

  // Load a prebuilt template
  const handleSelectTemplate = (tpl: PrebuiltTemplate) => {
    setNodes(tpl.nodes);
    setEdges(tpl.edges);
    setWorkflowName(tpl.name);
    setDescription(tpl.desc);
    setAssignedModel(tpl.model);
    setSelectedNodeId(tpl.nodes[0]?.id || '');
    setIsSavedLocally(false);
  };

  // Save workflow to localStorage
  const handleSaveWorkflow = () => {
    try {
      localStorage.setItem(
        'sovereign_custom_workflow',
        JSON.stringify({
          name: workflowName,
          desc: description,
          model: assignedModel,
          nodes,
          edges,
          updatedAt: new Date().toISOString(),
        })
      );
      setIsSavedLocally(true);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch {
      alert('Could not persist to local storage.');
    }
  };

  // Reset to the starter design
  const handleResetToStarter = () => {
    try {
      localStorage.removeItem('sovereign_custom_workflow');
    } catch {
      // ignore
    }
    setNodes(STARTER_NODES);
    setEdges(STARTER_EDGES);
    setWorkflowName('Regulatory Compliance Analysis');
    setDescription('Sketches a pipeline for analyzing new documents for regulatory compliance.');
    setAssignedModel('general-reasoning');
    setSelectedNodeId(STARTER_NODES[1].id);
    setIsSavedLocally(false);
  };

  // Outgoing edges from selected node
  const outgoingEdges = edges.filter((e) => e.source === selectedNode?.id);
  const potentialTargets = nodes.filter((n) => n.id !== selectedNode?.id);

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      {/* Top Header Bar */}
      <div className="h-14 bg-bg-panel border-b border-border px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-accent" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-text-primary">{workflowName}</h1>
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-warn/10 text-warn border border-warn/30"
                title="This canvas designs a workflow's node graph. There is no execution engine behind it yet -- saving keeps your design locally; nothing here runs."
              >
                <PencilRuler className="w-3 h-3" />
                Design Preview -- Not Executable
              </span>
              {isSavedLocally && (
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-ok/15 text-ok border border-ok/30">
                  Saved Locally
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary">
              {nodes.length} Nodes · {edges.length} Directed Hops · Assigned: {assignedModel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveToast && (
            <span className="text-xs font-mono text-ok font-semibold animate-in fade-in">
              ✓ Saved to Local Storage
            </span>
          )}

          <button
            onClick={handleResetToStarter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-bg-elevated border border-border hover:border-border-strong text-text-secondary hover:text-text-primary text-xs font-mono transition-colors"
            title="Reset to the starter design"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            onClick={handleSaveWorkflow}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all active:scale-95"
            title="Save this design locally in your browser"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Design</span>
          </button>
        </div>
      </div>

      {/* Main 3-zone layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Palette: Nodes or Templates */}
        <div className="w-full lg:w-64 bg-bg-panel border-b lg:border-b-0 lg:border-r border-border p-3 flex flex-col gap-3 flex-shrink-0">
          <div className="flex border-b border-border pb-2 text-xs font-mono">
            <button
              onClick={() => setLeftTab('nodes')}
              className={`pb-1 px-1 font-bold transition-colors ${
                leftTab === 'nodes'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Add Nodes ({nodePalette.length})
            </button>
            <button
              onClick={() => setLeftTab('templates')}
              className={`pb-1 px-1 ml-4 font-bold transition-colors ${
                leftTab === 'templates'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Templates ({PREBUILT_TEMPLATES.length})
            </button>
          </div>

          {/* Tab 1: Node Palette */}
          {leftTab === 'nodes' && (
            <div className="flex flex-col gap-2 overflow-y-auto pr-1">
              <span className="text-xs text-text-tertiary">
                Click any step to append it to the pipeline:
              </span>
              {nodePalette.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.type}
                    onClick={() => handleAddNodeFromPalette(p)}
                    className="p-2.5 rounded-md bg-bg-elevated border border-border hover:border-accent text-left transition-all flex items-center gap-2.5 group hover:-translate-y-0.5"
                    title="Click to add to workflow canvas"
                  >
                    <div
                      className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${p.color}15`, color: p.color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-text-primary text-xs leading-tight truncate group-hover:text-accent">
                        {p.label}
                      </div>
                      <div className="text-xs text-text-tertiary leading-tight truncate">
                        {p.desc}
                      </div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-text-tertiary group-hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Tab 2: Prebuilt Industrial Templates */}
          {leftTab === 'templates' && (
            <div className="flex flex-col gap-2.5 overflow-y-auto pr-1">
              <span className="text-xs text-text-tertiary">
                Load preconfigured multi-agent pipelines:
              </span>
              {PREBUILT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`p-3 rounded-md border text-left transition-all ${
                    workflowName === tpl.name
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-bg-elevated border-border hover:border-accent text-text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs truncate">{tpl.name}</span>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                    {tpl.desc}
                  </p>
                  <div className="mt-2 text-xs font-mono text-text-tertiary">
                    {tpl.nodes.length} nodes · {tpl.model}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: Directed Flowchart SVG Canvas */}
        <div className="flex-1 bg-[#0A0C10] relative overflow-auto flex items-center justify-center p-6">
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#2E3542 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />

          {/* Canvas Floating Info Bar */}
          <div className="absolute top-4 left-4 bg-bg-panel/90 backdrop-blur-sm border border-border rounded-md px-3 py-1.5 text-xs font-mono flex items-center gap-3 text-text-secondary z-10">
            <span>Canvas: {nodes.length} Nodes</span>
            <span>·</span>
            <span>{edges.length} Edges</span>
            {selectedNode && (
              <>
                <span>·</span>
                <span className="text-accent font-semibold">
                  Selected: {selectedNode.label}
                </span>
              </>
            )}
          </div>

          <svg className="w-full h-full min-h-[540px] max-w-3xl" viewBox="80 0 520 620">
            <defs>
              <marker
                id="wfArrow"
                viewBox="0 0 10 10"
                refX="16"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#4DA3FF" />
              </marker>
            </defs>

            {/* Connecting Lines */}
            {edges.map((edge) => {
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
                  stroke="#3A4454"
                  strokeWidth="2.5"
                  markerEnd="url(#wfArrow)"
                  className="transition-all hover:stroke-accent cursor-pointer"
                >
                  <title>Click to inspect connection</title>
                </path>
              );
            })}

            {/* Render Nodes */}
            {nodes.map((n) => {
              const isSelected = selectedNode?.id === n.id;
              let badgeColor = '#4DA3FF';
              if (n.type === 'trigger' || n.type === 'output') badgeColor = '#35C08A';
              if (n.type === 'document_reader') badgeColor = '#4DD4AC';
              if (n.type === 'data_analyzer') badgeColor = '#4DA3FF';
              if (n.type === 'tool_executor') badgeColor = '#E0A32E';
              if (n.type === 'conditional') badgeColor = '#FACC15';
              if (n.type === 'human_review') badgeColor = '#A78BFA';

              return (
                <g
                  key={n.id}
                  onClick={() => {
                    setSelectedNodeId(n.id);
                    setRightTab('node');
                  }}
                  className="cursor-pointer group"
                >
                  <rect
                    x={n.x - 75}
                    y={n.y - 22}
                    width="150"
                    height="46"
                    rx="8"
                    fill={isSelected ? '#1A212E' : '#141820'}
                    stroke={isSelected ? '#4DA3FF' : '#28303E'}
                    strokeWidth={isSelected ? '2.5' : '1.5'}
                    className="group-hover:stroke-accent/70 transition-all filter drop-shadow-md"
                  />
                  <rect
                    x={n.x - 75}
                    y={n.y - 22}
                    width="5"
                    height="46"
                    rx="2.5"
                    fill={badgeColor}
                  />
                  <text
                    x={n.x - 58}
                    y={n.y - 3}
                    fill="#F1F4FA"
                    fontSize="11.5"
                    fontWeight="600"
                    fontFamily="Inter"
                  >
                    {n.label}
                  </text>
                  <text
                    x={n.x - 58}
                    y={n.y + 13}
                    fill="#8B94A6"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono"
                  >
                    {n.subtext && n.subtext.length > 20 ? n.subtext.slice(0, 19) + '...' : n.subtext}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right Panel: Node Inspector or Workflow Settings */}
        <div className="w-full lg:w-80 bg-bg-panel border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col justify-between flex-shrink-0 overflow-y-auto">
          <div className="flex flex-col gap-4">
            {/* Tab switch between Node Inspector & Workflow Settings */}
            <div className="flex border-b border-border pb-2 text-xs font-mono">
              <button
                onClick={() => setRightTab('node')}
                className={`pb-1 px-1 font-bold transition-colors ${
                  rightTab === 'node'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Node Inspector
              </button>
              <button
                onClick={() => setRightTab('workflow')}
                className={`pb-1 px-1 ml-4 font-bold transition-colors ${
                  rightTab === 'workflow'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Global Settings
              </button>
            </div>

            {/* RIGHT TAB 1: Selected Node Inspector */}
            {rightTab === 'node' && selectedNode && (
              <div className="flex flex-col gap-3.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">
                    Step Configuration
                  </span>
                  <button
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    className="text-text-tertiary hover:text-error transition-colors p-1 rounded hover:bg-bg-elevated"
                    title="Delete step from workflow"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Node Label */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-secondary font-medium">Step Name</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) => handleUpdateNode({ label: e.target.value })}
                    className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
                  />
                </div>

                {/* Node Type */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-secondary font-medium">Step Type</label>
                  <select
                    value={selectedNode.type}
                    onChange={(e) => handleUpdateNode({ type: e.target.value as any })}
                    className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
                  >
                    <option value="llm_agent">LLM Agent</option>
                    <option value="document_reader">Document Reader</option>
                    <option value="data_analyzer">Data Analyzer</option>
                    <option value="tool_executor">Tool Executor</option>
                    <option value="conditional">Conditional</option>
                    <option value="human_review">Human Review</option>
                    <option value="output">Output Step</option>
                  </select>
                </div>

                {/* Subtext / Role */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-secondary font-medium">Operational Role</label>
                  <input
                    type="text"
                    value={selectedNode.subtext || ''}
                    onChange={(e) => handleUpdateNode({ subtext: e.target.value })}
                    className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none"
                    placeholder="e.g. Parse clauses and verify limits"
                  />
                </div>

                {/* Model Override */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-secondary font-medium">Model Assignment</label>
                  <select
                    value={selectedNode.model || assignedModel}
                    onChange={(e) => handleUpdateNode({ model: e.target.value })}
                    className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
                  >
                    {fleetModels.map((fm) => (
                      <option key={fm.id} value={fm.name}>
                        {fm.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Outgoing Edge Connectors */}
                <div className="pt-2 border-t border-border flex flex-col gap-2">
                  <span className="text-xs font-bold text-text-primary uppercase font-mono">
                    Next Pipeline Steps ({outgoingEdges.length})
                  </span>

                  {outgoingEdges.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {outgoingEdges.map((edge) => {
                        const tgt = nodes.find((n) => n.id === edge.target);
                        return (
                          <div
                            key={edge.id}
                            className="flex items-center justify-between p-2 rounded bg-bg-elevated border border-border text-xs font-mono"
                          >
                            <span className="truncate text-text-secondary">
                              → {tgt?.label || edge.target}
                            </span>
                            <button
                              onClick={() => handleRemoveEdge(edge.id)}
                              className="text-text-tertiary hover:text-error text-xs font-bold ml-2"
                              title="Disconnect step"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Connection Dropdown */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <select
                      value={connectTargetId}
                      onChange={(e) => setConnectTargetId(e.target.value)}
                      className="flex-1 bg-bg-elevated border border-border rounded px-2 py-1 text-xs text-text-primary font-mono focus:border-accent outline-none"
                    >
                      <option value="">Connect to step...</option>
                      {potentialTargets.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddEdge}
                      disabled={!connectTargetId}
                      className="px-2.5 py-1 rounded bg-accent hover:bg-accent-hover text-white text-xs font-mono font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Link
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT TAB 2: Global Workflow Settings */}
            {rightTab === 'workflow' && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-150">
                <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">
                  Global Workflow Settings
                </h2>

                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-secondary font-medium">Pipeline Name</label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => {
                      setWorkflowName(e.target.value);
                      setIsSavedLocally(false);
                    }}
                    className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-secondary font-medium">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setIsSavedLocally(false);
                    }}
                    className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none resize-none leading-relaxed"
                  />
                </div>

                {/* Assigned Model */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-secondary font-medium">Default Orchestrator Model</label>
                  <select
                    value={assignedModel}
                    onChange={(e) => {
                      setAssignedModel(e.target.value);
                      setIsSavedLocally(false);
                    }}
                    className="bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
                  >
                    {fleetModels.map((fm) => (
                      <option key={fm.id} value={fm.name}>
                        {fm.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Toggles */}
                <div className="flex flex-col gap-3 pt-2 border-t border-border text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Enable Human Review</span>
                    <input
                      type="checkbox"
                      checked={enableHumanReview}
                      onChange={(e) => setEnableHumanReview(e.target.checked)}
                      className="w-4 h-4 rounded text-accent accent-accent"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Save to Knowledge Base</span>
                    <input
                      type="checkbox"
                      checked={saveToKb}
                      onChange={(e) => setSaveToKb(e.target.checked)}
                      className="w-4 h-4 rounded text-accent accent-accent"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Send Notifications</span>
                    <input
                      type="checkbox"
                      checked={sendNotifications}
                      onChange={(e) => setSendNotifications(e.target.checked)}
                      className="w-4 h-4 rounded text-accent accent-accent"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* No Deploy button: there is no workflow execution engine yet. */}
          <div className="pt-4 border-t border-border mt-4">
            <button
              onClick={handleSaveWorkflow}
              className="w-full py-2.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Design</span>
            </button>
            <p className="text-xs text-text-tertiary text-center mt-2">
              This is a design canvas only -- there is no backend workflow engine to deploy to yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
