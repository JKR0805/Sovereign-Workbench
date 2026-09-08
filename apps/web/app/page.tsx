'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HexLogo } from '../components/primitives/HexLogo';
import { MockBadge } from '../components/primitives/MockBadge';
import { useShellStore } from '../stores/shellStore';
import { api, useIsMock } from '../lib/api';
import { MOCK_SAMPLE_PROMPTS } from '../lib/mockData';
import {
  MessageSquare,
  FileText,
  Image as ImageIcon,
  BarChart3,
  Wrench,
  Paperclip,
  Globe,
  Send,
  Sparkles,
  CheckCircle2,
  Copy,
  RotateCcw,
  X,
  FileSpreadsheet,
  FileCode,
  ChevronDown
} from 'lucide-react';
import { InferenceGraph } from '../components/inference/InferenceGraph';

interface AttachedFileItem {
  name: string;
  info: string;
  sizeBytes?: number;
  isMockSample?: boolean;
  file?: File;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  tokens?: number;
  latency?: string;
  modelUsed?: string;
  attachedFile?: AttachedFileItem;
  isMock?: boolean;
}

export default function WorkbenchPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isGlobalMock = useIsMock('global');

  const { activeModelName, activeModelId, setActiveModel } = useShellStore();
  const [prompt, setPrompt] = useState('');
  const [provisionalDecision, setProvisionalDecision] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFileItem | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [localSearchEnabled, setLocalSearchEnabled] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Debounced provisional routing evaluation
  useEffect(() => {
    if (!prompt.trim() && !attachedFile) {
      setProvisionalDecision(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSimulating(true);
      try {
        const sim = await api.simulateRouting({
          prompt,
          attachments: attachedFile
            ? [
                {
                  filename: attachedFile.name,
                  mime: attachedFile.name.endsWith('.pdf')
                    ? 'application/pdf'
                    : attachedFile.name.endsWith('.csv')
                    ? 'text/csv'
                    : 'text/markdown',
                  size_bytes: attachedFile.sizeBytes || 1048576,
                  scanned_page_count: attachedFile.name.includes('scan') ? 1 : 0,
                },
              ]
            : [],
        });
        setProvisionalDecision(sim);
      } catch (err) {
        console.error('Provisional simulation error', err);
      } finally {
        setIsSimulating(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [prompt, attachedFile]);

  const handleRealFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMb = file.size / (1024 * 1024);
    const sizeStr = sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;

    setAttachedFile({
      name: file.name,
      info: `${sizeStr} · Real File`,
      sizeBytes: file.size,
      isMockSample: false,
      file,
    });
    setShowAttachMenu(false);
    // Reset file input value so re-selecting same file triggers change
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const sizeMb = file.size / (1024 * 1024);
    const sizeStr = sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;

    setAttachedFile({
      name: file.name,
      info: `${sizeStr} · Real File`,
      sizeBytes: file.size,
      isMockSample: false,
      file,
    });
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() && !attachedFile) return;

    const userText = prompt.trim() || `Analyze document: ${attachedFile?.name}`;
    const newMsg: ChatMessage = {
      role: 'user',
      content: userText,
      attachedFile: attachedFile || undefined,
    };
    setMessages((prev) => [...prev, newMsg]);
    setPendingPrompt(userText);
    setPrompt('');
    setIsResponding(true);
  };

  const handleInferenceComplete = (result: {
    selectedModel: string;
    modelScore: number;
    intent: string;
    toolUsed: string;
    citations: string[];
    replyText: string;
  }) => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: result.replyText,
        sources: result.citations,
        tokens: 432,
        latency: '2.4s',
        modelUsed: result.selectedModel,
        isMock: isGlobalMock || true,
      },
    ]);
    setIsResponding(false);
    setPendingPrompt(null);
  };

  const handleSelectStarter = (sample: (typeof MOCK_SAMPLE_PROMPTS)[0]) => {
    setPrompt(sample.prompt);
    setAttachedFile({
      name: sample.docName,
      info: `${sample.docInfo} · Sample Mock`,
      isMockSample: true,
    });
  };

  const handleActionCard = (type: string) => {
    switch (type) {
      case 'chat':
        setPrompt('How can I optimize the thermal efficiency of distillation column DC-101?');
        break;
      case 'docs':
        router.push('/knowledge');
        break;
      case 'images':
        router.push('/multimodal');
        break;
      case 'data':
        router.push('/data-analysis');
        break;
      case 'tools':
        router.push('/workflows');
        break;
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'xlsx') return <FileSpreadsheet className="w-4 h-4 text-[#4DD4AC]" />;
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return <ImageIcon className="w-4 h-4 text-[#A78BFA]" />;
    if (ext === 'py' || ext === 'json' || ext === 'yaml') return <FileCode className="w-4 h-4 text-[#E0A32E]" />;
    return <FileText className="w-4 h-4 text-accent" />;
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="flex flex-col h-[calc(100vh-3.5rem-1.75rem)] overflow-hidden bg-bg-base relative"
    >
      {/* Hidden File Input for Real Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRealFileSelect}
        className="hidden"
        accept=".pdf,.docx,.txt,.csv,.xlsx,.json,.md,.png,.jpg"
      />

      {/* Drag overlay indicator */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent/15 border-2 border-dashed border-accent z-50 flex items-center justify-center backdrop-blur-xs pointer-events-none">
          <div className="bg-bg-panel p-5 rounded-lg border border-accent flex flex-col items-center gap-2 shadow-2xl">
            <Paperclip className="w-8 h-8 text-accent animate-bounce" />
            <span className="text-sm font-mono font-bold text-text-primary">
              Drop file here to attach to prompt
            </span>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center">
        {messages.length === 0 && !isResponding && (
          <div className="flex flex-col items-center text-center max-w-2xl my-auto animate-in fade-in duration-300">
            {/* Logo */}
            <div className="mb-4">
              <HexLogo size={56} />
            </div>

            {/* Heading */}
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary mb-2 tracking-tight">
              Where knowledge meets absolute sovereignty
            </h1>

            {/* Subtitle */}
            <p className="text-xs text-text-secondary mb-8 max-w-lg leading-relaxed">
              Airgapped, localized intelligence for high-consequence enterprise, defense, and industrial operations.
            </p>

            {/* 5 Capability Action Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full mb-8">
              <button
                onClick={() => handleActionCard('chat')}
                className="flex flex-col items-center text-center p-4 rounded-md bg-bg-panel border border-border hover:border-accent transition-all group hover:-translate-y-0.5"
              >
                <div className="w-9 h-9 rounded-lg bg-bg-elevated border border-border flex items-center justify-center mb-2.5 text-accent group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-semibold text-text-primary mb-1">Chat</h2>
                <p className="text-xs text-text-tertiary leading-snug">
                  Get answers, generate content, and solve problems
                </p>
              </button>

              <button
                onClick={() => handleActionCard('docs')}
                className="flex flex-col items-center text-center p-4 rounded-md bg-bg-panel border border-border hover:border-accent transition-all group hover:-translate-y-0.5"
              >
                <div className="w-9 h-9 rounded-lg bg-bg-elevated border border-border flex items-center justify-center mb-2.5 text-ok group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-semibold text-text-primary mb-1">Analyze Documents</h2>
                <p className="text-xs text-text-tertiary leading-snug">
                  Upload and analyze PDFs, reports, and more
                </p>
              </button>

              <button
                onClick={() => handleActionCard('images')}
                className="flex flex-col items-center text-center p-4 rounded-md bg-bg-panel border border-border hover:border-accent transition-all group hover:-translate-y-0.5"
              >
                <div className="w-9 h-9 rounded-lg bg-bg-elevated border border-border flex items-center justify-center mb-2.5 text-modality-vision group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-semibold text-text-primary mb-1">Analyze Images</h2>
                <p className="text-xs text-text-tertiary leading-snug">
                  Understand diagrams, charts, and photos
                </p>
              </button>

              <button
                onClick={() => handleActionCard('data')}
                className="flex flex-col items-center text-center p-4 rounded-md bg-bg-panel border border-border hover:border-accent transition-all group hover:-translate-y-0.5"
              >
                <div className="w-9 h-9 rounded-lg bg-bg-elevated border border-border flex items-center justify-center mb-2.5 text-modality-coding group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-semibold text-text-primary mb-1">Data Analysis</h2>
                <p className="text-xs text-text-tertiary leading-snug">
                  Work with structured data and generate insights
                </p>
              </button>

              <button
                onClick={() => handleActionCard('tools')}
                className="col-span-2 sm:col-span-1 flex flex-col items-center text-center p-4 rounded-md bg-bg-panel border border-border hover:border-accent transition-all group hover:-translate-y-0.5"
              >
                <div className="w-9 h-9 rounded-lg bg-bg-elevated border border-border flex items-center justify-center mb-2.5 text-warn group-hover:scale-110 transition-transform">
                  <Wrench className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-semibold text-text-primary mb-1">Use Tools</h2>
                <p className="text-xs text-text-tertiary leading-snug">
                  Access specialized tools and agents
                </p>
              </button>
            </div>

            {/* Starter Sample Cards matching FRONTEND_SPECIFICATION.md Section 4.1 */}
            <div className="w-full max-w-2xl mb-8 text-left">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
                  Sample Tasks & Preloaded Corpus
                </div>
                <MockBadge label="Sample Tasks" size="sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {MOCK_SAMPLE_PROMPTS.map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectStarter(sample)}
                    className="p-3 rounded bg-bg-panel border border-border hover:border-accent text-left transition-all group"
                  >
                    <div className="text-xs font-medium text-text-primary mb-1.5 group-hover:text-accent line-clamp-1">
                      {sample.title}
                    </div>
                    <div className="flex gap-1.5 mb-1.5">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#232833] text-text-secondary border border-border">
                        {sample.badge1}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#232833] text-text-secondary border border-border">
                        {sample.badge2}
                      </span>
                    </div>
                    <div className="text-xs text-text-tertiary line-clamp-2">
                      {sample.prompt}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Render Conversation Messages */}
        <div className="w-full max-w-3xl flex flex-col gap-6">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-2 ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary px-1">
                {msg.role === 'user' ? (
                  <span>Operator</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span className="font-semibold text-text-primary">
                      {msg.modelUsed || 'Qwen 2.5 VL 72B'}
                    </span>
                    {msg.isMock && <MockBadge label="Simulated Inference" size="sm" />}
                  </div>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`p-4 rounded-lg max-w-2xl text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent/15 border border-accent/40 text-text-primary'
                    : 'bg-bg-panel border border-border text-text-primary shadow-md'
                }`}
              >
                {/* User attached file badge if present */}
                {msg.attachedFile && (
                  <div className="mb-2.5 pb-2 border-b border-border/50 flex items-center justify-between gap-2 font-mono text-xs">
                    <div className="flex items-center gap-1.5 text-accent">
                      {getFileIcon(msg.attachedFile.name)}
                      <span className="font-semibold">{msg.attachedFile.name}</span>
                      <span className="text-text-tertiary">({msg.attachedFile.info})</span>
                    </div>
                    {msg.attachedFile.isMockSample ? (
                      <MockBadge label="Mock Doc" size="sm" />
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-ok/15 text-ok border border-ok/30">
                        Local File
                      </span>
                    )}
                  </div>
                )}

                <div className="whitespace-pre-line font-sans">{msg.content}</div>

                {/* Grounded Citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2 text-xs font-mono">
                    <span className="text-text-tertiary flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-ok" />
                      Grounded in:
                    </span>
                    {msg.sources.map((s, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-text-secondary"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Assistant Message Footer */}
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-3 text-xs font-mono text-text-tertiary px-1">
                  <span>{msg.tokens} tokens</span>
                  <span>·</span>
                  <span>{msg.latency}</span>
                  <div className="flex items-center gap-1.5 ml-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      className="p-1 hover:text-text-primary transition-colors"
                      title="Copy Response"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const lastUser = messages.filter((m) => m.role === 'user').pop();
                        if (lastUser) {
                          setPendingPrompt(lastUser.content);
                          setIsResponding(true);
                        }
                      }}
                      className="p-1 hover:text-text-primary transition-colors"
                      title="Regenerate Response"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Inference Visualization DAG (Shown while responding) */}
          {isResponding && pendingPrompt && (
            <div className="w-full my-2">
              <InferenceGraph
                prompt={pendingPrompt}
                attachmentName={attachedFile?.name}
                onComplete={handleInferenceComplete}
              />
            </div>
          )}
        </div>
      </div>

      {/* Composer Input Area */}
      <div className="w-full max-w-3xl mx-auto px-4 pb-4 flex flex-col gap-2 relative">
        {/* Provisional Routing Hint */}
        {provisionalDecision && (
          <div className="px-3 py-1.5 rounded-t-md bg-bg-panel/80 border border-b-0 border-border text-xs font-mono flex items-center justify-between text-text-secondary animate-in fade-in duration-150">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>
                Routing to:{' '}
                <strong className="text-text-primary">
                  {provisionalDecision.decision.selected}
                </strong>{' '}
                (Score: {provisionalDecision.decision.score})
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <MockBadge label="Simulated Decision" size="sm" />
              <span className="text-text-tertiary">
                ~{provisionalDecision.task.estimated_input_tokens} tokens
              </span>
            </div>
          </div>
        )}

        {/* Attached file chip */}
        {attachedFile && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-panel border border-border rounded-md text-xs font-mono animate-in fade-in duration-150 shadow-sm">
            <div className="flex items-center gap-2 truncate">
              {getFileIcon(attachedFile.name)}
              <span className="text-accent font-semibold truncate">{attachedFile.name}</span>
              <span className="text-text-tertiary">({attachedFile.info})</span>
              {attachedFile.isMockSample ? (
                <MockBadge label="Sample Document" size="sm" />
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-ok/15 text-ok border border-ok/30">
                  Local Upload
                </span>
              )}
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              className="p-1 text-text-tertiary hover:text-error hover:bg-bg-elevated rounded transition-colors"
              title="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Attachment Options Popover Menu */}
        {showAttachMenu && (
          <div className="absolute bottom-20 left-4 bg-bg-elevated border border-border rounded-lg p-2 shadow-2xl z-50 flex flex-col gap-1 w-72 text-xs font-mono animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="px-2.5 py-1 text-text-tertiary uppercase font-bold text-[11px] border-b border-border mb-1">
              Select Attachment Source
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded hover:bg-bg-panel text-text-primary text-left transition-colors group"
            >
              <Paperclip className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
              <div>
                <div className="font-semibold">Upload from Device...</div>
                <div className="text-[11px] text-text-tertiary">PDF, DOCX, CSV, PNG, TXT</div>
              </div>
            </button>

            <div className="border-t border-border my-1" />
            <div className="px-2.5 py-1 text-text-tertiary uppercase font-bold text-[11px]">
              Or Preloaded Sample Docs:
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachedFile({
                  name: 'Refinery_Safety_Manual.pdf',
                  info: '2.4 MB · Digital PDF',
                  isMockSample: true,
                });
                setShowAttachMenu(false);
              }}
              className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-bg-panel text-text-secondary hover:text-text-primary text-left transition-colors"
            >
              <span className="truncate">Refinery_Safety_Manual.pdf</span>
              <MockBadge label="Mock" size="sm" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachedFile({
                  name: 'Crude_Assay_Telemetrics.csv',
                  info: '840 KB · Tabular Data',
                  isMockSample: true,
                });
                setShowAttachMenu(false);
              }}
              className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-bg-panel text-text-secondary hover:text-text-primary text-left transition-colors"
            >
              <span className="truncate">Crude_Assay_Telemetrics.csv</span>
              <MockBadge label="Mock" size="sm" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachedFile({
                  name: 'Piping_PID_Diagram.png',
                  info: '3.1 MB · Engineering Drawing',
                  isMockSample: true,
                });
                setShowAttachMenu(false);
              }}
              className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-bg-panel text-text-secondary hover:text-text-primary text-left transition-colors"
            >
              <span className="truncate">Piping_PID_Diagram.png</span>
              <MockBadge label="Mock" size="sm" />
            </button>
          </div>
        )}

        {/* Composer Input Box */}
        <form
          onSubmit={handleSend}
          className="bg-bg-panel border border-border focus-within:border-accent rounded-lg p-3.5 transition-colors shadow-lg flex flex-col gap-3"
        >
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              attachedFile
                ? `Ask questions about ${attachedFile.name}... (Enter to submit)`
                : 'Type your message here... (Enter to submit, Shift+Enter for newline)'
            }
            className="w-full bg-transparent text-sm sm:text-base text-text-primary placeholder-text-tertiary resize-none focus:outline-none leading-relaxed"
          />

          <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
            {/* Attachment & Tool buttons */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors border font-mono ${
                    attachedFile
                      ? 'bg-accent/15 text-accent border-accent/40 font-semibold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated border-transparent hover:border-border'
                  }`}
                  title="Attach Document or Image"
                >
                  <Paperclip className="w-4 h-4" />
                  <span>{attachedFile ? 'Attached' : 'Attach'}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => router.push('/workflows')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors border border-transparent hover:border-border font-mono"
                title="Tools & Workflow Orchestrator"
              >
                <Wrench className="w-4 h-4" />
                <span>Workflows</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSearchEnabled(!localSearchEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors border font-mono ${
                  localSearchEnabled
                    ? 'bg-ok/10 text-ok border-ok/30 font-medium'
                    : 'text-text-tertiary hover:text-text-secondary border-transparent'
                }`}
                title="Search Grounded Local Documents"
              >
                <Globe className="w-4 h-4" />
                <span>Local Vector RAG</span>
              </button>
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!prompt.trim() && !attachedFile}
              className="p-2 rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Footer statement */}
        <p className="text-center text-xs text-text-tertiary font-mono">
          Your data stays within your infrastructure. Always.
        </p>
      </div>
    </div>
  );
}
