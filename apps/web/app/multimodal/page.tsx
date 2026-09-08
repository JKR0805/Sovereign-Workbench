'use client';

import React, { useCallback, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { InferenceGraph } from '../../components/inference/InferenceGraph';
import { MarkdownRenderer } from '../../components/primitives/MarkdownRenderer';
import type { RunAttachment } from '../../lib/types';
import { UploadCloud, RotateCcw, Loader2, AlertTriangle, Send } from 'lucide-react';

interface QaTurn {
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
  isStreaming?: boolean;
  isError?: boolean;
}

export default function MultimodalAnalysisPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [dataBase64, setDataBase64] = useState<string | null>(null);
  const [mime, setMime] = useState<string>('image/png');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [question, setQuestion] = useState('Describe this image in detail, including any equipment, labels, or anomalies.');
  const [isResponding, setIsResponding] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [inferenceKey, setInferenceKey] = useState(0);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImage(dataUrl);
      setDataBase64(dataUrl.split(';base64,')[1] || dataUrl);
    };
    reader.readAsDataURL(file);
    setTurns([]);
    setConversationId(null);
  };

  const handleReset = () => {
    setUploadedImage(null);
    setDataBase64(null);
    setUploadedFileName(null);
    setTurns([]);
    setConversationId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const ask = useCallback(
    async (text: string) => {
      if (!dataBase64 || isResponding) return;

      let convId = conversationId;
      if (!convId) {
        try {
          const created = await api.createConversation(`Image: ${uploadedFileName ?? 'analysis'}`);
          convId = created.id;
          setConversationId(convId);
        } catch {
          convId = null;
        }
      }

      setTurns((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: '', isStreaming: true },
      ]);
      setPendingPrompt(text);
      setInferenceKey((k) => k + 1);
      setIsResponding(true);
    },
    [dataBase64, isResponding, conversationId, uploadedFileName]
  );

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    void ask(question.trim());
    setQuestion('');
  };

  const handleToken = useCallback((token: string) => {
    setTurns((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = { ...last, content: last.content + token };
      }
      return updated;
    });
  }, []);

  const handleModelSelected = useCallback((_id: string, name: string) => {
    setTurns((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = { ...last, modelUsed: name };
      }
      return updated;
    });
  }, []);

  const handleComplete = useCallback(
    (result: { selectedModelName: string; replyText: string }) => {
      setTurns((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || result.replyText,
            modelUsed: result.selectedModelName,
            isStreaming: false,
          };
        }
        return updated;
      });
      setIsResponding(false);
      setPendingPrompt(null);
    },
    []
  );

  const handleFailed = useCallback((error: { message: string }) => {
    setTurns((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: `Run failed: ${error.message}`, isStreaming: false, isError: true };
      }
      return updated;
    });
    setIsResponding(false);
    setPendingPrompt(null);
  }, []);

  const attachments: RunAttachment[] =
    dataBase64 && uploadedFileName
      ? [{ filename: uploadedFileName, mime, size_bytes: 0, data_base64: dataBase64, kind: 'image' }]
      : [];

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Multimodal Analysis</h1>
          <p className="text-xs text-text-secondary">
            Ask the local vision model about an image -- routed automatically through the same pipeline as chat
          </p>
        </div>

        <div className="flex items-center gap-2">
          {uploadedImage && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded bg-bg-panel hover:bg-bg-elevated border border-border text-text-secondary text-xs font-semibold shadow transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all flex items-center gap-1.5"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{uploadedImage ? 'Replace Image' : 'Upload Image'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#090C12] border border-border rounded-lg overflow-hidden relative flex items-center justify-center p-4 min-h-[440px]">
          {uploadedImage ? (
            <img
              src={uploadedImage}
              alt={uploadedFileName || 'Uploaded image'}
              className="max-w-full max-h-[400px] object-contain rounded shadow-lg border border-border/50"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-text-tertiary">
              <UploadCloud className="w-10 h-10" />
              <span className="text-sm font-mono">Upload an image to begin</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 max-h-[560px]">
          <div className="bg-bg-panel border border-border rounded-md p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">Analysis</h2>

            {!dataBase64 && <p className="text-xs text-text-tertiary font-mono">Upload an image to ask questions about it.</p>}

            {turns.map((t, idx) => (
              <div key={idx} className={`flex flex-col gap-1 ${t.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-xs font-mono text-text-tertiary">{t.role === 'user' ? 'You' : t.modelUsed ?? 'Model'}</span>
                <div
                  className={`p-2.5 rounded-md text-xs max-w-full ${
                    t.role === 'user'
                      ? 'bg-accent/15 border border-accent/30 text-text-primary'
                      : t.isError
                      ? 'bg-error/5 border border-error/30 text-text-primary'
                      : 'bg-bg-elevated border border-border text-text-primary'
                  }`}
                >
                  {t.isError && (
                    <div className="flex items-center gap-1 text-error mb-1">
                      <AlertTriangle className="w-3 h-3" /> Error
                    </div>
                  )}
                  {t.content ? (
                    <MarkdownRenderer content={t.content} />
                  ) : t.isStreaming ? (
                    <span className="flex items-center gap-1 text-text-tertiary italic">
                      <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAsk} className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!dataBase64 || isResponding}
              placeholder="Ask about this image..."
              className="flex-1 bg-bg-elevated border border-border focus:border-accent rounded-md px-3 py-2 text-xs text-text-primary outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!dataBase64 || isResponding || !question.trim()}
              className="p-2 rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-40 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {isResponding && pendingPrompt && (
        <InferenceGraph
          key={inferenceKey}
          prompt={pendingPrompt}
          attachments={attachments}
          conversationId={conversationId ?? undefined}
          onToken={handleToken}
          onModelSelected={handleModelSelected}
          onComplete={handleComplete}
          onFailed={handleFailed}
        />
      )}
    </div>
  );
}
