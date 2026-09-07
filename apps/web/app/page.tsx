'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HexLogo } from '../components/primitives/HexLogo';
import { useShellStore } from '../stores/shellStore';
import { api } from '../lib/api';
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
  RotateCcw
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  tokens?: number;
  latency?: string;
}

export default function WorkbenchPage() {
  const router = useRouter();
  const { activeModelName, activeModelId } = useShellStore();
  const [prompt, setPrompt] = useState('');
  const [provisionalDecision, setProvisionalDecision] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; info: string } | null>(null);
  const [localSearchEnabled, setLocalSearchEnabled] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);

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
                  mime: attachedFile.name.endsWith('.pdf') ? 'application/pdf' : 'text/markdown',
                  size_bytes: 1048576,
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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() && !attachedFile) return;

    const userText = prompt.trim() || `Analyze ${attachedFile?.name}`;
    const newMsg: ChatMessage = { role: 'user', content: userText };
    setMessages((prev) => [...prev, newMsg]);
    setPrompt('');
    setIsResponding(true);

    // Simulate grounded agent response
    setTimeout(() => {
      let reply = '';
      let sources: string[] = [];

      if (userText.toLowerCase().includes('wall thickness') || userText.toLowerCase().includes('e102')) {
        reply = `Based on the refinery inspection manual and e102_report.md:

1. Measured Wall Thickness:
   • Measured: 6.8 mm across all tube passes.
   • ASME Section VIII retirement threshold: 5.0 mm minimum.
   • Safety Margin: +1.8 mm (+36% above minimum allowable threshold).

2. Protocol Determination:
   • The equipment complies with active operational integrity requirements.
   • Recommend routine non-destructive examination scheduled in 12 months.`;
        sources = ['Refinery_Safety_Manual.pdf (p.12)', 'Safety_Protocol_2024.pdf (p.8)'];
      } else if (userText.toLowerCase().includes('temperature') || userText.toLowerCase().includes('350')) {
        reply = `Based on the refinery safety manual, if the distillation column temperature exceeds 350°C, you should:

1. Immediately activate the Emergency Shutdown System (ESD).
2. Isolate the distillation column within 30 seconds.
3. Cut feed supply to pre-heaters and furnaces.
4. Notify the control room and safety emergency response team.
5. Follow the incident reporting protocol (Section 7.3).`;
        sources = ['Refinery_Safety_Manual.pdf (p.12)', 'Safety_Protocol_2024.pdf (p.8)'];
      } else {
        reply = `Task processed locally on sovereign infrastructure using ${activeModelName}.

All context, vector embeddings, and generation were computed within your airgapped network boundary with zero external egress. Source citations and telemetry were verified against local SQLite & Qdrant indices.`;
        sources = ['Local Knowledge Base'];
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply,
          sources,
          tokens: 432,
          latency: '1.8s',
        },
      ]);
      setIsResponding(false);
    }, 900);
  };

  const handleSelectStarter = (sample: (typeof MOCK_SAMPLE_PROMPTS)[0]) => {
    setPrompt(sample.prompt);
    setAttachedFile({ name: sample.docName, info: sample.docInfo });
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

  return (
    <div className="min-h-full flex flex-col justify-between p-4 sm:p-6 max-w-5xl mx-auto">
      {/* If no conversation yet: Hero Screen matching Reference Image 1 */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-6">
          {/* Hexagon Logo */}
          <div className="mb-4">
            <HexLogo size={56} />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary mb-1">
            Good evening, Admin
          </h1>
          <p className="text-sm text-text-secondary mb-8">
            How can I help you today?
          </p>

          {/* 5 Quick Action Cards matching Reference Image 1 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full max-w-4xl mb-10">
            <button
              onClick={() => handleActionCard('chat')}
              className="flex flex-col items-center text-center p-4 rounded-md bg-bg-panel border border-border hover:border-accent transition-all group hover:-translate-y-0.5"
            >
              <div className="w-9 h-9 rounded-lg bg-bg-elevated border border-border flex items-center justify-center mb-2.5 text-accent group-hover:scale-110 transition-transform">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h2 className="text-xs font-semibold text-text-primary mb-1">Chat</h2>
              <p className="text-[11px] text-text-tertiary leading-snug">
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
              <h2 className="text-xs font-semibold text-text-primary mb-1">Analyze Documents</h2>
              <p className="text-[11px] text-text-tertiary leading-snug">
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
              <h2 className="text-xs font-semibold text-text-primary mb-1">Analyze Images</h2>
              <p className="text-[11px] text-text-tertiary leading-snug">
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
              <h2 className="text-xs font-semibold text-text-primary mb-1">Data Analysis</h2>
              <p className="text-[11px] text-text-tertiary leading-snug">
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
              <h2 className="text-xs font-semibold text-text-primary mb-1">Use Tools</h2>
              <p className="text-[11px] text-text-tertiary leading-snug">
                Access specialized tools and agents
              </p>
            </button>
          </div>

          {/* Starter Sample Cards matching FRONTEND_SPECIFICATION.md Section 4.1 */}
          <div className="w-full max-w-2xl mb-8 text-left">
            <div className="text-[11px] font-mono text-text-tertiary uppercase tracking-wider mb-2">
              Sample Tasks & Preloaded Corpus
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
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#232833] text-text-secondary border border-border">
                      {sample.badge1}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#232833] text-text-secondary border border-border">
                      {sample.badge2}
                    </span>
                  </div>
                  <div className="text-[10px] text-text-tertiary truncate">
                    📎 {sample.docName}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Conversation Feed matching Reference Image 2 Bottom Right */
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto mb-6 max-w-3xl w-full mx-auto">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-semibold text-text-primary">Chat with Your Data</span>
            <button
              onClick={() => setMessages([])}
              className="text-[11px] font-mono text-text-tertiary hover:text-text-secondary flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Clear Chat
            </button>
          </div>

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-1.5 ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-xl bg-accent/15 border border-accent/30 rounded-lg px-4 py-2.5 text-xs text-text-primary leading-relaxed">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full max-w-2xl bg-bg-panel border border-border rounded-lg p-4 text-xs text-text-primary leading-relaxed shadow-sm">
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <HexLogo size={18} />
                      <span className="font-semibold text-[11px] text-text-primary">
                        {activeModelName}
                      </span>
                    </div>
                    {msg.latency && (
                      <span className="font-mono text-[10px] text-text-tertiary">
                        Tokens: {msg.tokens} | Latency: {msg.latency}
                      </span>
                    )}
                  </div>

                  <div className="whitespace-pre-line text-text-secondary mb-3">
                    {msg.content}
                  </div>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="pt-2 border-t border-border flex flex-wrap items-center gap-2 text-[11px] font-mono text-text-tertiary">
                      <span className="text-text-secondary font-semibold">Sources:</span>
                      {msg.sources.map((src, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 rounded bg-bg-elevated border border-border text-accent hover:underline cursor-pointer"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isResponding && (
            <div className="flex items-center gap-2 text-xs text-accent font-mono animate-pulse">
              <Sparkles className="w-4 h-4" /> Generating grounded response with local open weights...
            </div>
          )}
        </div>
      )}

      {/* Composer Section (720px width centered) */}
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-2">
        {/* Provisional Routing Strip */}
        {provisionalDecision && (
          <div className="bg-[#171B22] border border-accent/40 rounded px-3 py-1.5 flex items-center justify-between text-[11px] font-mono animate-in fade-in duration-200">
            <div className="flex items-center gap-2 truncate">
              <span className="text-accent font-bold">⚡ PROVISIONAL ROUTING:</span>
              <span className="text-text-secondary truncate">
                {provisionalDecision.task.intent} → Selected:{' '}
                <strong className="text-text-primary">
                  {provisionalDecision.decision.selected}
                </strong>{' '}
                (Score: {provisionalDecision.decision.score})
              </span>
            </div>
            <span className="text-text-tertiary flex-shrink-0">
              ~{provisionalDecision.task.estimated_input_tokens} tokens
            </span>
          </div>
        )}

        {/* Attached file chip */}
        {attachedFile && (
          <div className="flex items-center gap-2 px-3 py-1 bg-bg-panel border border-border rounded text-xs font-mono">
            <span className="text-accent">📎 {attachedFile.name}</span>
            <span className="text-text-tertiary">({attachedFile.info})</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="ml-auto text-text-tertiary hover:text-error"
            >
              ×
            </button>
          </div>
        )}

        {/* Composer Input Box matching Reference Image 1 */}
        <form
          onSubmit={handleSend}
          className="bg-bg-panel border border-border focus-within:border-accent rounded-lg p-3 transition-colors shadow-lg flex flex-col gap-3"
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
            placeholder="Type your message here... (Enter to submit, Shift+Enter for newline)"
            className="w-full bg-transparent text-xs text-text-primary placeholder-text-tertiary resize-none focus:outline-none leading-relaxed"
          />

          <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
            {/* Attachment & Tool buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setAttachedFile({ name: 'Refinery_Safety_Manual.pdf', info: '2.4 MB, digital' })
                }
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors border border-transparent hover:border-border"
                title="Attach Document"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Attach</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/workflows')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors border border-transparent hover:border-border"
                title="Tools & Agents"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Tools</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSearchEnabled(!localSearchEnabled)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors border ${
                  localSearchEnabled
                    ? 'bg-ok/10 text-ok border-ok/30'
                    : 'text-text-tertiary hover:text-text-secondary border-transparent'
                }`}
                title="Search Grounded Local Documents"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Web Search (Local)</span>
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
        <p className="text-center text-[11px] text-text-tertiary font-mono">
          Your data stays within your infrastructure. Always.
        </p>
      </div>
    </div>
  );
}
