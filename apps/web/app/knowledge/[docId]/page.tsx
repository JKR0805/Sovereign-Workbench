'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useApiResource } from '../../../lib/useApiResource';
import { ErrorState } from '../../../components/primitives/ErrorState';
import { LoadingState, EmptyState } from '../../../components/primitives/LoadingState';
import { StatusDot } from '../../../components/primitives/StatusDot';
import { ChevronLeft, Hash } from 'lucide-react';

export default function DocumentInsightsPage() {
  const params = useParams();
  const docId = (params?.docId as string) || '';

  const { data: doc, loading: docLoading, error: docError } = useApiResource(() => api.getDocument(docId), [docId]);
  const { data: chunks, loading: chunksLoading, error: chunksError } = useApiResource(
    () => api.getDocumentChunks(docId),
    [docId]
  );
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  const selectedChunk = (chunks ?? []).find((c) => c.id === selectedChunkId) ?? (chunks ?? [])[0] ?? null;

  if (docLoading) return <LoadingState label="Loading document..." className="h-full" />;
  if (docError || !doc) {
    return (
      <div className="p-6">
        <ErrorState error={docError ?? new Error('Document not found')} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      <div className="h-11 bg-bg-panel border-b border-border px-4 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <Link href="/knowledge" className="flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span>Documents</span>
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="text-text-primary font-semibold truncate max-w-xs">{doc.filename}</span>
          <StatusDot status={doc.status} size="sm" />
          {doc.page_count != null && <span className="text-text-tertiary">{doc.page_count} pages</span>}
        </div>
        <div className="flex items-center gap-3 text-text-tertiary">
          {doc.parser && <span>parser: {doc.parser}</span>}
          <span>{(doc.size_bytes / 1024).toFixed(0)} KB</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: selected chunk's real text */}
        <div className="flex-1 bg-[#0D1017] p-6 overflow-y-auto flex items-start justify-center">
          <div className="w-full max-w-2xl bg-[#131720] border border-border rounded shadow-2xl p-8 leading-relaxed text-text-primary select-text">
            {doc.error && (
              <div className="border-b border-error/30 pb-3 mb-4 text-xs font-mono text-error">{doc.error}</div>
            )}
            {chunksLoading && <LoadingState compact label="Loading chunk text..." />}
            {chunksError && <ErrorState error={chunksError} compact />}
            {!chunksLoading && !chunksError && !selectedChunk && (
              <EmptyState label="No chunks" detail="This document has no indexed chunks to display." />
            )}
            {selectedChunk && (
              <>
                <div className="border-b border-border pb-4 mb-6 flex justify-between items-center text-xs font-mono text-text-tertiary">
                  <span>{selectedChunk.section_path ?? doc.filename}</span>
                  <span>
                    {selectedChunk.page_from != null
                      ? selectedChunk.page_from === selectedChunk.page_to
                        ? `p. ${selectedChunk.page_from}`
                        : `pp. ${selectedChunk.page_from}-${selectedChunk.page_to}`
                      : `chunk #${selectedChunk.ordinal}`}
                  </span>
                </div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap font-sans">{selectedChunk.text}</p>
                <div className="mt-6 pt-4 border-t border-border flex justify-between text-xs font-mono text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Hash className="w-3 h-3" /> {selectedChunk.token_count} tokens (estimate)
                  </span>
                  <span>chunk {selectedChunk.ordinal + 1} of {(chunks ?? []).length}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: real chunk list */}
        <div className="w-full lg:w-96 bg-bg-panel border-t lg:border-t-0 lg:border-l border-border flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-border text-xs font-mono font-bold text-text-primary uppercase tracking-wider">
            Indexed Chunks ({(chunks ?? []).length})
          </div>
          <div className="flex-1 p-3 flex flex-col gap-2">
            {(chunks ?? []).map((chk) => (
              <button
                key={chk.id}
                onClick={() => setSelectedChunkId(chk.id)}
                className={`p-2.5 rounded border text-xs font-mono text-left transition-colors ${
                  (selectedChunk?.id ?? (chunks ?? [])[0]?.id) === chk.id
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-bg-elevated border-border text-text-secondary hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text-primary font-semibold truncate">{chk.section_path ?? `#${chk.ordinal}`}</span>
                  <span className="text-text-tertiary">{chk.token_count} tok</span>
                </div>
                <p className="font-sans line-clamp-2 text-text-secondary">{chk.text}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
