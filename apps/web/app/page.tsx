'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { HexLogo } from '../components/primitives/HexLogo';
import { api } from '../lib/api';
import type { ChunkRead, MessageCitation, RunAttachment } from '../lib/types';
import {
  MessageSquare,
  FileText,
  Image as ImageIcon,
  BarChart3,
  Wrench,
  Paperclip,
  Send,
  Sparkles,
  CheckCircle2,
  Copy,
  RotateCcw,
  X,
  FileSpreadsheet,
  FileCode,
  AlertTriangle,
  Loader2,
  Eye,
  Shield,
  ExternalLink,
  Download,
  Search,
  File,
  Layers,
  BookmarkPlus,
  Check,
} from 'lucide-react';
import { InferenceGraph } from '../components/inference/InferenceGraph';
import { MarkdownRenderer } from '../components/primitives/MarkdownRenderer';
import { useAuthStore } from '../stores/authStore';

const ACTIVE_CONVERSATION_KEY = 'vajra_active_conversation_id';

interface AttachedFileItem {
  name: string;
  info: string;
  sizeBytes: number;
  mime: string;
  file?: File;
  previewUrl?: string;
  dataBase64?: string;
  textPreview?: string;
  documentId?: string;
  uploading: boolean;
  uploadError?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: MessageCitation[];
  promptTokens?: number | null;
  completionTokens?: number | null;
  latency?: string;
  modelUsed?: string;
  attachedFile?: {
    name: string;
    info: string;
    previewUrl?: string;
    textPreview?: string;
    documentId?: string;
    mime?: string;
  };
  isStreaming?: boolean;
  isError?: boolean;
}

function isImageFile(file: File | { name: string; mime?: string; type?: string }): boolean {
  if ('type' in file && file.type && file.type.startsWith('image/')) return true;
  if ('mime' in file && file.mime && file.mime.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext || '');
}

function isPdfFile(file: File | { name: string; mime?: string; type?: string }): boolean {
  if ('type' in file && file.type === 'application/pdf') return true;
  if ('mime' in file && file.mime === 'application/pdf') return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'pdf';
}

function isTextFile(file: File | { name: string; mime?: string; type?: string }): boolean {
  if ('type' in file && file.type && (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('javascript') || file.type.includes('python'))) return true;
  if ('mime' in file && file.mime && (file.mime.startsWith('text/') || file.mime.includes('json') || file.mime.includes('javascript') || file.mime.includes('python'))) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['txt', 'md', 'markdown', 'json', 'csv', 'py', 'ts', 'tsx', 'js', 'jsx', 'html', 'css', 'sql', 'log', 'yaml', 'yml', 'env', 'xml', 'sh', 'toml', 'ini'].includes(ext || '');
}

function isAudioOrVideoFile(file: File | { name: string; mime?: string; type?: string }): 'audio' | 'video' | null {
  const type = ('type' in file ? file.type : '') || ('mime' in file ? file.mime : '') || '';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext || '')) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext || '')) return 'video';
  return null;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function DocumentChunksViewer({ documentId }: { documentId: string }) {
  const [chunks, setChunks] = useState<ChunkRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getDocumentChunks(documentId)
      .then((data) => {
        if (active) {
          setChunks(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load extracted chunks');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-3 text-text-tertiary">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="text-xs font-mono">Retrieving vectorized document chunks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-error/10 border border-error/30 text-error text-xs font-mono">
        Failed to load chunks: {error}
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="p-8 text-center text-xs font-mono text-text-tertiary">
        No chunks have been generated for this document yet.
      </div>
    );
  }

  const filtered = query
    ? chunks.filter(
        (c) =>
          c.text.toLowerCase().includes(query.toLowerCase()) ||
          (c.section_path && c.section_path.toLowerCase().includes(query.toLowerCase()))
      )
    : chunks;

  const totalTokens = chunks.reduce((acc, c) => acc + (c.token_count || 0), 0);

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/40 text-xs font-mono text-text-secondary">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent font-semibold">
            {chunks.length} Chunks
          </span>
          <span className="text-text-tertiary">·</span>
          <span>~{totalTokens.toLocaleString()} tokens indexed</span>
        </div>
        {chunks.length > 2 && (
          <div className="relative w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter chunks..."
              className="w-full pl-8 pr-2.5 py-1 text-xs bg-bg-surface border border-border/70 rounded focus:border-accent focus:outline-none text-text-primary"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 max-h-[52vh] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-xs font-mono text-text-tertiary">
            No chunks match &quot;{query}&quot;
          </div>
        ) : (
          filtered.map((chunk) => (
            <div
              key={chunk.id || chunk.ordinal}
              className="p-3 rounded-lg bg-bg-surface border border-border/60 flex flex-col gap-2 transition-colors hover:border-border"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-text-tertiary">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-accent">#{chunk.ordinal + 1}</span>
                  {chunk.section_path && (
                    <span className="truncate max-w-[200px] text-text-secondary" title={chunk.section_path}>
                      {chunk.section_path}
                    </span>
                  )}
                  {chunk.page_from != null && (
                    <span>
                      p.{chunk.page_from}
                      {chunk.page_to != null && chunk.page_to !== chunk.page_from ? `-${chunk.page_to}` : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span>{chunk.token_count} tok</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(chunk.text);
                      alert('Chunk text copied to clipboard!');
                    }}
                    className="p-1 hover:text-text-primary transition-colors"
                    title="Copy Chunk"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-xs font-mono text-text-primary whitespace-pre-wrap leading-relaxed bg-[#05070A] p-2.5 rounded border border-border/40 selection:bg-accent/30">
                {chunk.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function WorkbenchPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useAuthStore();

  const [prompt, setPrompt] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFileItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<RunAttachment[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationOwner, setConversationOwner] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [inferenceKey, setInferenceKey] = useState(0);

  // Rich File Preview Modal (images, code/text, and vector documents)
  const [filePreviewModal, setFilePreviewModal] = useState<{
    isOpen: boolean;
    name: string;
    info: string;
    previewUrl?: string;
    textPreview?: string;
    documentId?: string;
    mime?: string;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<'preview' | 'chunks'>('preview');
  const [imageLoadError, setImageLoadError] = useState(false);
  const [promotedDocIds, setPromotedDocIds] = useState<Set<string>>(new Set());

  const handlePromoteDocument = useCallback(async (docId: string) => {
    try {
      await api.promoteDocument(docId);
      setPromotedDocIds((prev) => new Set([...prev, docId]));
    } catch (err) {
      console.error('Failed to promote document:', err);
    }
  }, []);

  const clearAttachment = useCallback(() => {
    if (attachedFile?.previewUrl && attachedFile.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(attachedFile.previewUrl);
    }
    setAttachedFile(null);
  }, [attachedFile]);

  const loadConversation = useCallback(async (id: string) => {
    setConversationLoadError(null);
    try {
      const detail = await api.getConversation(id);
      setConversationId(detail.id);
      setConversationOwner(detail.username || null);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ACTIVE_CONVERSATION_KEY, detail.id);
        const url = new URL(window.location.href);
        url.searchParams.set('c', detail.id);
        window.history.replaceState({}, '', url.toString());
      }
      setMessages(
        detail.messages.map((m) => {
          let attachedFile: ChatMessage['attachedFile'];
          if (m.attachments && m.attachments.length > 0) {
            const att = m.attachments[0] as Record<string, unknown>;
            const fname = String(att.filename || 'attachment');
            const mime = String(att.mime || 'application/octet-stream');
            const docId = (att.document_id as string) || undefined;
            let pUrl = (att.previewUrl as string) || undefined;
            if (!pUrl && att.data_base64 && (mime.startsWith('image/') || att.kind === 'image')) {
              pUrl = String(att.data_base64).startsWith('data:')
                ? String(att.data_base64)
                : `data:${mime};base64,${att.data_base64}`;
            }
            if (!pUrl && docId) {
              pUrl = `/api/knowledge/documents/${encodeURIComponent(docId)}/raw`;
            }
            attachedFile = {
              name: fname,
              info: `${mime} · ${att.kind || 'file'}`,
              previewUrl: pUrl,
              documentId: docId,
              mime: mime,
            };
          }
          return {
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
            sources: m.citations,
            promptTokens: m.prompt_tokens,
            completionTokens: m.completion_tokens,
            latency: m.duration_ms != null ? `${(m.duration_ms / 1000).toFixed(1)}s` : undefined,
            modelUsed: m.model_id ?? undefined,
            isError: m.status === 'failed',
            attachedFile,
          };
        })
      );
    } catch {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(ACTIVE_CONVERSATION_KEY);
      }
    }
  }, []);

  const resetChat = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ACTIVE_CONVERSATION_KEY);
      window.history.replaceState({}, '', '/');
    }
    setMessages([]);
    setConversationId(null);
    setConversationOwner(null);
    setConversationLoadError(null);
    setPrompt('');
    setPendingPrompt(null);
    setPendingAttachments([]);
    setIsResponding(false);
    clearAttachment();
  }, [clearAttachment]);

  // Hydrate conversation from URL query parameter or prior session, and listen for events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('c');
    const storedId = sessionStorage.getItem(ACTIVE_CONVERSATION_KEY);
    const targetId = paramId || storedId;

    if (targetId) {
      loadConversation(targetId);
    }

    const handleNewChatEvent = () => resetChat();
    const handleLoadConvEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ conversationId: string }>;
      if (customEvent.detail?.conversationId) {
        loadConversation(customEvent.detail.conversationId);
      }
    };

    window.addEventListener('vajra_new_chat', handleNewChatEvent);
    window.addEventListener('vajra_load_conversation', handleLoadConvEvent);

    return () => {
      window.removeEventListener('vajra_new_chat', handleNewChatEvent);
      window.removeEventListener('vajra_load_conversation', handleLoadConvEvent);
    };
  }, [loadConversation, resetChat]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;
    setConversationLoadError(null);
    try {
      const created = await api.createConversation({});
      setConversationId(created.id);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(ACTIVE_CONVERSATION_KEY, created.id);
        const url = new URL(window.location.href);
        url.searchParams.set('c', created.id);
        window.history.replaceState({}, '', url.toString());
        window.dispatchEvent(new CustomEvent('vajra_conversation_updated'));
      }
      return created.id;
    } catch (err) {
      setConversationLoadError(
        err instanceof Error ? err.message : 'Could not create a conversation.'
      );
      throw err;
    }
  }, [conversationId]);

  const handleFile = async (file: File) => {
    const isImg = isImageFile(file);
    const isTxt = isTextFile(file);
    const isPdf = isPdfFile(file);
    const localBlobUrl = URL.createObjectURL(file);

    const item: AttachedFileItem = {
      name: file.name,
      info: `${formatSize(file.size)} · ${file.type || file.name.split('.').pop() || 'file'}`,
      sizeBytes: file.size,
      mime: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
      file,
      previewUrl: localBlobUrl,
      uploading: !isImg,
    };
    setAttachedFile(item);

    // Always read base64 in background as resilient fallback
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const b64 = dataUrl.split(';base64,')[1] || dataUrl;
      setAttachedFile((prev) =>
        prev && prev.file === file
          ? {
              ...prev,
              previewUrl: isImg ? dataUrl : prev.previewUrl,
              dataBase64: b64,
            }
          : prev
      );
    };
    reader.readAsDataURL(file);

    if (isTxt) {
      const textReader = new FileReader();
      textReader.onload = (ev) => {
        const content = ev.target?.result as string;
        setAttachedFile((prev) =>
          prev && prev.file === file ? { ...prev, textPreview: content } : prev
        );
      };
      textReader.readAsText(file.slice(0, 131072)); // Read up to 128KB for text preview
    }

    // Upload as session attachment (canonical = false, session-scoped)
    try {
      const doc = await api.uploadDocument(file, undefined, false);
      setAttachedFile((prev) =>
        prev && prev.file === file ? { ...prev, uploading: false, documentId: doc.id, uploadError: undefined } : prev
      );
    } catch (err) {
      setAttachedFile((prev) =>
        prev && prev.file === file
          ? { ...prev, uploading: false, uploadError: err instanceof Error ? err.message : 'Upload failed' }
          : prev
      );
    }
  };

  const handleRealFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const sendPrompt = async (text: string, attachedForThisTurn: AttachedFileItem | null) => {
    const attachments: RunAttachment[] = attachedForThisTurn
      ? attachedForThisTurn.documentId
        ? [
            {
              filename: attachedForThisTurn.name,
              mime: attachedForThisTurn.mime,
              size_bytes: attachedForThisTurn.sizeBytes,
              document_id: attachedForThisTurn.documentId,
              data_base64: attachedForThisTurn.dataBase64,
              kind: isImageFile(attachedForThisTurn) ? 'image' : 'document',
            },
          ]
        : attachedForThisTurn.dataBase64
        ? [
            {
              filename: attachedForThisTurn.name,
              mime: attachedForThisTurn.mime,
              size_bytes: attachedForThisTurn.sizeBytes,
              data_base64: attachedForThisTurn.dataBase64,
              document_id: attachedForThisTurn.documentId,
              kind: isImageFile(attachedForThisTurn) ? 'image' : 'document',
            },
          ]
        : []
      : [];

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: text,
        attachedFile: attachedForThisTurn
          ? {
              name: attachedForThisTurn.name,
              info: attachedForThisTurn.info,
              previewUrl: attachedForThisTurn.previewUrl,
              textPreview: attachedForThisTurn.textPreview,
              documentId: attachedForThisTurn.documentId,
              mime: attachedForThisTurn.mime,
            }
          : undefined,
      },
      { role: 'assistant', content: '', modelUsed: 'Routing...', isStreaming: true },
    ]);

    let convId: string | null = null;
    try {
      convId = await ensureConversation();
    } catch {
      convId = null;
    }

    setPendingPrompt(text);
    setPendingAttachments(attachments);
    setConversationId(convId);
    setInferenceKey((k) => k + 1);
    setIsResponding(true);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() && !attachedFile) return;
    if (attachedFile?.uploading) return;

    const text = prompt.trim() || `Analyze the attached file: ${attachedFile?.name}`;
    const currentAttachment = attachedFile;
    setPrompt('');
    clearAttachment();
    await sendPrompt(text, currentAttachment);
  };

  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser || isResponding) return;
    // Drop the trailing assistant turn (if any) and re-run the last prompt
    // as a fresh turn, rather than silently doing nothing.
    setMessages((prev) => {
      const trimmed = [...prev];
      if (trimmed[trimmed.length - 1]?.role === 'assistant') trimmed.pop();
      return trimmed;
    });
    void sendPrompt(lastUser.content, null);
  };

  const handleToken = useCallback((token: string) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = { ...last, content: last.content + token };
      }
      return updated;
    });
  }, []);

  const handleModelSelected = useCallback((modelId: string, modelName: string) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = { ...last, modelUsed: modelName || modelId };
      }
      return updated;
    });
  }, []);

  const handleInferenceComplete = useCallback(
    (result: {
      selectedModelName: string;
      citations: MessageCitation[];
      replyText: string;
      promptTokens: number | null;
      completionTokens: number | null;
      durationMs: number;
    }) => {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || result.replyText,
            sources: result.citations,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            latency: `${(result.durationMs / 1000).toFixed(1)}s`,
            modelUsed: result.selectedModelName,
            isStreaming: false,
          };
        }
        return updated;
      });
      setIsResponding(false);
      setPendingPrompt(null);
      setPendingAttachments([]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vajra_conversation_updated'));
      }
    },
    []
  );

  const handleInferenceFailed = useCallback((error: { message: string; code?: string }) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last,
          content: last.content || `The run failed: ${error.message}`,
          isStreaming: false,
          isError: true,
        };
      }
      return updated;
    });
    setIsResponding(false);
    setPendingPrompt(null);
    setPendingAttachments([]);
  }, []);

  const handleActionCard = (type: string) => {
    switch (type) {
      case 'chat':
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
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRealFileSelect}
        className="hidden"
        accept=".pdf,.txt,.csv,.json,.md,.log,.png,.jpg,.jpeg,.gif,.webp"
      />

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

      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center">
        {messages.length === 0 && !isResponding && (
          <div className="flex flex-col items-center text-center max-w-2xl my-auto animate-in fade-in duration-300">
            <div className="mb-4">
              <HexLogo size={56} />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary mb-2 tracking-tight">
              Where knowledge meets absolute sovereignty
            </h1>
            <p className="text-xs text-text-secondary mb-8 max-w-lg leading-relaxed">
              Airgapped, localized intelligence for high-consequence enterprise, defense, and industrial operations.
            </p>

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
          </div>
        )}

        <div className="w-full max-w-3xl flex flex-col gap-6">
          {/* Admin Oversight Banner */}
          {currentUser?.role === 'admin' && conversationOwner && conversationOwner !== currentUser.username && (
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs font-mono text-amber-200 shadow-md animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Admin Oversight Mode:</strong> Viewing conversation created by{' '}
                  <span className="text-amber-300 font-bold bg-amber-900/60 px-1.5 py-0.5 rounded border border-amber-700/50">
                    @{conversationOwner}
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={resetChat}
                className="px-2.5 py-1 rounded bg-amber-900/70 hover:bg-amber-800 text-amber-100 text-xs border border-amber-700/70 transition-colors shrink-0"
              >
                + Switch to My Chat
              </button>
            </div>
          )}

          {conversationLoadError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-warn/30 bg-warn/10 text-xs font-mono text-warn">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Chat history isn&apos;t being saved: {conversationLoadError}
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary px-1">
                {msg.role === 'user' ? (
                  <span>Operator</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span className="font-semibold text-text-primary">{msg.modelUsed || 'Assistant'}</span>
                  </div>
                )}
              </div>

              <div
                className={`p-4 rounded-lg max-w-2xl text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent/15 border border-accent/40 text-text-primary'
                    : msg.isError
                    ? 'bg-error/5 border border-error/40 text-text-primary shadow-md'
                    : 'bg-bg-panel border border-border text-text-primary shadow-md'
                }`}
              >
                {msg.attachedFile && (
                  <div className="mb-2.5 pb-2 border-b border-border/50 flex flex-col gap-2 font-mono text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-accent">
                        {getFileIcon(msg.attachedFile.name)}
                        <span className="font-semibold">{msg.attachedFile.name}</span>
                        <span className="text-text-tertiary">({msg.attachedFile.info})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {msg.attachedFile.documentId && !isImageFile(msg.attachedFile) && (
                          <button
                            type="button"
                            disabled={promotedDocIds.has(msg.attachedFile.documentId)}
                            onClick={() => handlePromoteDocument(msg.attachedFile!.documentId!)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
                              promotedDocIds.has(msg.attachedFile.documentId)
                                ? 'bg-ok/10 text-ok border-ok/40 cursor-default'
                                : 'bg-bg-surface hover:bg-bg-elevated border-border/60 text-accent hover:text-accent-hover cursor-pointer'
                            }`}
                            title={
                              promotedDocIds.has(msg.attachedFile.documentId)
                                ? 'Document is in permanent Knowledge Base'
                                : 'Promote this document to the permanent Knowledge Base for all chats'
                            }
                          >
                            {promotedDocIds.has(msg.attachedFile.documentId) ? (
                              <>
                                <Check className="w-3 h-3 text-ok" />
                                <span>In Knowledge Base</span>
                              </>
                            ) : (
                              <>
                                <BookmarkPlus className="w-3 h-3 text-accent" />
                                <span>Add to KB</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewTab('preview');
                            setImageLoadError(false);
                            setFilePreviewModal({
                              isOpen: true,
                              name: msg.attachedFile!.name,
                              info: msg.attachedFile!.info,
                              previewUrl: msg.attachedFile!.previewUrl,
                              textPreview: msg.attachedFile!.textPreview,
                              documentId: msg.attachedFile!.documentId,
                              mime: msg.attachedFile!.mime,
                            });
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-surface hover:bg-bg-elevated border border-border/60 text-text-secondary hover:text-text-primary text-[11px] transition-colors"
                        >
                          <Eye className="w-3 h-3 text-accent" />
                          <span>Preview File</span>
                        </button>
                      </div>
                    </div>
                    {msg.attachedFile.previewUrl && isImageFile(msg.attachedFile) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewTab('preview');
                          setImageLoadError(false);
                          setFilePreviewModal({
                            isOpen: true,
                            name: msg.attachedFile!.name,
                            info: msg.attachedFile!.info,
                            previewUrl: msg.attachedFile!.previewUrl,
                            mime: msg.attachedFile!.mime,
                          });
                        }}
                        className="mt-1 rounded-md overflow-hidden border border-border/60 hover:border-accent/60 transition-colors w-fit cursor-pointer"
                        title="Click to expand full image"
                      >
                        <img
                          src={msg.attachedFile.previewUrl}
                          alt={msg.attachedFile.name}
                          className="max-h-36 max-w-56 object-contain bg-bg-base"
                        />
                      </button>
                    )}
                  </div>
                )}

                {msg.role === 'assistant' ? (
                  <div className="font-sans">
                    {msg.isError && (
                      <div className="flex items-center gap-1.5 text-error mb-2 text-xs font-mono">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Run failed
                      </div>
                    )}
                    {msg.content ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : msg.isStreaming ? (
                      <span className="text-text-tertiary italic text-xs flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating response...
                      </span>
                    ) : null}
                    {msg.isStreaming && msg.content && (
                      <span className="inline-block w-2 h-4 bg-accent/80 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-line font-sans">{msg.content}</div>
                )}

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
                        title={s.chunk_id}
                      >
                        {s.marker} {s.doc_title ?? s.document_id}
                        {s.section_path ? ` > ${s.section_path}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'assistant' && !msg.isStreaming && (
                <div className="flex items-center gap-3 text-xs font-mono text-text-tertiary px-1">
                  {msg.completionTokens != null && <span>{msg.completionTokens} tokens</span>}
                  {msg.completionTokens != null && msg.latency && <span>·</span>}
                  {msg.latency && <span>{msg.latency}</span>}
                  <div className="flex items-center gap-1.5 ml-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      className="p-1 hover:text-text-primary transition-colors"
                      title="Copy Response"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {idx === messages.length - 1 && (
                      <button
                        onClick={handleRegenerate}
                        className="p-1 hover:text-text-primary transition-colors"
                        title="Regenerate Response"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isResponding && pendingPrompt && (
            <div className="w-full my-2">
              <InferenceGraph
                key={inferenceKey}
                prompt={pendingPrompt}
                attachments={pendingAttachments}
                conversationId={conversationId ?? undefined}
                onToken={handleToken}
                onModelSelected={handleModelSelected}
                onComplete={handleInferenceComplete}
                onFailed={handleInferenceFailed}
              />
            </div>
          )}
        </div>
      </div>

      {/* Composer Input Area */}
      <div className="w-full max-w-3xl mx-auto px-4 pb-4 flex flex-col gap-2 relative">
        {attachedFile && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-panel border border-border rounded-md text-xs font-mono animate-in fade-in duration-150 shadow-sm">
            <div className="flex items-center gap-2.5 truncate">
              {attachedFile.previewUrl && isImageFile(attachedFile) ? (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTab('preview');
                    setImageLoadError(false);
                    setFilePreviewModal({
                      isOpen: true,
                      name: attachedFile.name,
                      info: attachedFile.info,
                      previewUrl: attachedFile.previewUrl,
                      textPreview: attachedFile.textPreview,
                      documentId: attachedFile.documentId,
                      mime: attachedFile.mime,
                    });
                  }}
                  className="relative group shrink-0 cursor-pointer"
                  title="Click to preview image"
                >
                  <img
                    src={attachedFile.previewUrl}
                    alt={attachedFile.name}
                    className="w-9 h-9 rounded object-cover border border-border/80 group-hover:border-accent transition-colors"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded transition-opacity">
                    <Eye className="w-3.5 h-3.5 text-white" />
                  </div>
                </button>
              ) : (
                <div className="w-9 h-9 rounded bg-bg-surface border border-border/60 flex items-center justify-center shrink-0">
                  {getFileIcon(attachedFile.name)}
                </div>
              )}

              <div className="flex flex-col truncate">
                <span className="text-accent font-semibold truncate">{attachedFile.name}</span>
                <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                  <span>{attachedFile.info}</span>
                  {attachedFile.uploading && (
                    <span className="flex items-center gap-1 text-text-tertiary">
                      · <Loader2 className="w-3 h-3 animate-spin" /> indexing...
                    </span>
                  )}
                  {attachedFile.documentId && (
                    <span className="text-ok font-semibold">· Session Ready</span>
                  )}
                  {attachedFile.uploadError && (
                    <span className="text-error font-semibold flex items-center gap-1">
                      · {attachedFile.uploadError}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (attachedFile.file) handleFile(attachedFile.file);
                        }}
                        className="underline text-accent hover:text-accent-hover ml-1 cursor-pointer font-normal"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {(attachedFile.previewUrl || attachedFile.textPreview || attachedFile.documentId) && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTab('preview');
                    setImageLoadError(false);
                    setFilePreviewModal({
                      isOpen: true,
                      name: attachedFile.name,
                      info: attachedFile.info,
                      previewUrl: attachedFile.previewUrl,
                      textPreview: attachedFile.textPreview,
                      documentId: attachedFile.documentId,
                      mime: attachedFile.mime,
                    });
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-bg-surface hover:bg-bg-elevated border border-border/70 text-text-secondary hover:text-text-primary text-[11px] transition-colors"
                  title="Preview attached file"
                >
                  <Eye className="w-3.5 h-3.5 text-accent" />
                  <span>Preview</span>
                </button>
              )}
              <button
                type="button"
                onClick={clearAttachment}
                className="p-1 text-text-tertiary hover:text-error hover:bg-bg-elevated rounded transition-colors"
                title="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Rich File Preview Modal */}
        {filePreviewModal?.isOpen && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-6 md:p-8 animate-in fade-in duration-200"
            onClick={() => setFilePreviewModal(null)}
          >
            <div
              className="bg-bg-panel border border-border rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-surface shrink-0">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="p-1.5 rounded bg-bg-elevated border border-border/70 text-accent shrink-0">
                    {getFileIcon(filePreviewModal.name)}
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="font-semibold text-sm text-text-primary truncate">
                      {filePreviewModal.name}
                    </span>
                    <span className="text-[11px] font-mono text-text-tertiary">
                      {filePreviewModal.info}
                      {filePreviewModal.documentId && (
                        <span className="text-ok ml-2">· RAG Vector Indexed</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Tabs if document has both viewer and chunks available */}
                  {filePreviewModal.documentId && (
                    <div className="flex items-center bg-bg-base border border-border/70 rounded-md p-0.5 text-xs font-mono mr-2">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('preview')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          previewTab === 'preview'
                            ? 'bg-accent text-white font-medium shadow-xs'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Viewer
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('chunks')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                          previewTab === 'chunks'
                            ? 'bg-accent text-white font-medium shadow-xs'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <Layers className="w-3 h-3" />
                        <span>Chunks</span>
                      </button>
                    </div>
                  )}

                  {filePreviewModal.documentId && !isImageFile({ name: filePreviewModal.name, mime: filePreviewModal.mime }) && (
                    <button
                      type="button"
                      disabled={promotedDocIds.has(filePreviewModal.documentId)}
                      onClick={() => handlePromoteDocument(filePreviewModal.documentId!)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                        promotedDocIds.has(filePreviewModal.documentId)
                          ? 'bg-ok/15 text-ok border-ok/40 cursor-default'
                          : 'bg-accent/15 hover:bg-accent/25 border-accent/40 text-accent cursor-pointer'
                      }`}
                      title={
                        promotedDocIds.has(filePreviewModal.documentId)
                          ? 'Document is in permanent Knowledge Base'
                          : 'Promote this document to the permanent Knowledge Base for all chats'
                      }
                    >
                      {promotedDocIds.has(filePreviewModal.documentId) ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-ok" />
                          <span>In Knowledge Base</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3.5 h-3.5 text-accent" />
                          <span>Add to Knowledge Base</span>
                        </>
                      )}
                    </button>
                  )}

                  {filePreviewModal.previewUrl && (
                    <>
                      <a
                        href={filePreviewModal.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-bg-surface hover:bg-bg-elevated border border-border/70 text-text-secondary hover:text-text-primary text-xs font-mono transition-colors"
                        title="Open in new browser tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-accent" />
                        <span className="hidden sm:inline">Open Tab</span>
                      </a>
                      <a
                        href={filePreviewModal.previewUrl}
                        download={filePreviewModal.name}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent text-xs font-mono transition-colors"
                        title="Download file"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Download</span>
                      </a>
                    </>
                  )}

                  <button
                    onClick={() => setFilePreviewModal(null)}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors ml-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-auto p-4 md:p-6 bg-[#0B0E14] flex flex-col items-center justify-center min-h-[420px]">
                {previewTab === 'chunks' && filePreviewModal.documentId ? (
                  <DocumentChunksViewer documentId={filePreviewModal.documentId} />
                ) : isPdfFile({ name: filePreviewModal.name, mime: filePreviewModal.mime }) ? (
                  <div className="w-full h-[76vh] flex flex-col rounded-lg overflow-hidden border border-border shadow-2xl bg-white">
                    {filePreviewModal.previewUrl ? (
                      <iframe
                        src={filePreviewModal.previewUrl}
                        title={filePreviewModal.name}
                        className="w-full h-full border-0"
                      />
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-bg-panel text-text-secondary text-xs font-mono gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-accent" />
                        <span>Preparing PDF viewer...</span>
                      </div>
                    )}
                  </div>
                ) : isImageFile({ name: filePreviewModal.name, mime: filePreviewModal.mime }) ? (
                  filePreviewModal.previewUrl && !imageLoadError ? (
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={filePreviewModal.previewUrl}
                        alt={filePreviewModal.name}
                        onError={() => setImageLoadError(true)}
                        className="max-h-[72vh] max-w-full object-contain rounded-lg border border-border/50 shadow-2xl bg-[#05070A]"
                      />
                      <span className="text-xs font-mono text-text-tertiary">
                        Full resolution preview
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 gap-3 text-center">
                      <div className="p-4 rounded-2xl bg-bg-surface border border-border/70 text-accent">
                        <ImageIcon className="w-10 h-10 text-accent/80" />
                      </div>
                      <span className="font-semibold text-sm text-text-primary">{filePreviewModal.name}</span>
                      <span className="text-xs text-text-tertiary font-mono">{filePreviewModal.info}</span>
                      <p className="text-xs text-text-secondary max-w-sm mt-1">
                        {imageLoadError
                          ? 'Image preview could not be loaded directly.'
                          : 'Image asset attached to this turn.'}
                      </p>
                      {filePreviewModal.previewUrl && (
                        <a
                          href={filePreviewModal.previewUrl}
                          download={filePreviewModal.name}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors shadow-sm mt-2"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Image</span>
                        </a>
                      )}
                    </div>
                  )
                ) : isAudioOrVideoFile({ name: filePreviewModal.name, mime: filePreviewModal.mime }) === 'video' ? (
                  <div className="flex flex-col items-center justify-center p-2 w-full">
                    <video
                      controls
                      autoPlay={false}
                      src={filePreviewModal.previewUrl}
                      className="max-h-[72vh] max-w-full rounded-lg border border-border/60 bg-black shadow-2xl"
                    />
                  </div>
                ) : isAudioOrVideoFile({ name: filePreviewModal.name, mime: filePreviewModal.mime }) === 'audio' ? (
                  <div className="flex flex-col items-center justify-center p-12 w-full">
                    <audio controls src={filePreviewModal.previewUrl} className="w-full max-w-md" />
                  </div>
                ) : filePreviewModal.textPreview ? (
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-mono text-text-tertiary pb-2 border-b border-border/40">
                      <span>Previewing content ({filePreviewModal.textPreview.split('\n').length} lines)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(filePreviewModal.textPreview || '');
                          alert('Copied file content to clipboard!');
                        }}
                        className="flex items-center gap-1 text-accent hover:underline"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy All</span>
                      </button>
                    </div>
                    <pre className="text-xs font-mono p-4 rounded-lg bg-[#05070A] border border-border/60 text-emerald-300 overflow-x-auto max-h-[68vh] whitespace-pre-wrap leading-relaxed">
                      {filePreviewModal.textPreview}
                    </pre>
                  </div>
                ) : filePreviewModal.documentId ? (
                  <div className="w-full flex flex-col gap-4">
                    <div className="p-4 rounded-xl bg-bg-surface border border-border/70 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-accent">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-text-primary">{filePreviewModal.name}</h4>
                          <p className="text-xs text-text-tertiary font-mono">
                            {filePreviewModal.info} · Vector indexed for RAG retrieval
                          </p>
                        </div>
                      </div>
                      <a
                        href={`/knowledge/${filePreviewModal.documentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors shadow-sm"
                      >
                        <span>Knowledge Hub</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <DocumentChunksViewer documentId={filePreviewModal.documentId} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
                    <div className="p-5 rounded-2xl bg-bg-surface border border-border/80 text-accent shadow-md">
                      <File className="w-12 h-12 text-accent/80" />
                    </div>
                    <div className="flex flex-col gap-1 max-w-md">
                      <h3 className="text-base font-semibold text-text-primary">{filePreviewModal.name}</h3>
                      <p className="text-xs font-mono text-text-tertiary">{filePreviewModal.info}</p>
                      <p className="text-xs text-text-secondary mt-1">
                        Binary asset attached to this conversation turn.
                      </p>
                    </div>
                    {filePreviewModal.previewUrl && (
                      <div className="flex items-center gap-3 mt-2">
                        <a
                          href={filePreviewModal.previewUrl}
                          download={filePreviewModal.name}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 text-xs font-medium transition-colors shadow-md"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download File</span>
                        </a>
                        <a
                          href={filePreviewModal.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-surface border border-border hover:bg-bg-elevated text-xs font-medium text-text-primary transition-colors shadow-sm"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open in New Window</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors border font-mono ${
                  attachedFile
                    ? 'bg-accent/15 text-accent border-accent/40 font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated border-transparent hover:border-border'
                }`}
                title="Attach Document or Image"
              >
                <Paperclip className="w-4 h-4" />
                <span>{attachedFile ? 'Attached' : 'Attach'}</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/workflows')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors border border-transparent hover:border-border font-mono"
                title="Tools & Workflow Orchestrator"
              >
                <Wrench className="w-4 h-4" />
                <span>Workflows</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={(!prompt.trim() && !attachedFile) || attachedFile?.uploading}
              className="p-2 rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-text-tertiary font-mono">
          Your data stays within your infrastructure. Always.
        </p>
      </div>
    </div>
  );
}
