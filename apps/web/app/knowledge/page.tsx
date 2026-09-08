'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import { LoadingState, EmptyState } from '../../components/primitives/LoadingState';
import type { KnowledgeSearchResponse } from '../../lib/types';
import { StatusDot } from '../../components/primitives/StatusDot';
import {
  UploadCloud,
  FileText,
  Search,
  Trash2,
  ExternalLink,
  FileSpreadsheet,
  FileCode,
  Network,
  Loader2,
} from 'lucide-react';

export default function KnowledgePage() {
  const { data: documents, loading, error, reload } = useApiResource(() => api.getDocuments(), []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setUploadError(null);
    try {
      await api.uploadDocument(file);
      reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteDocument(id);
    reload();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.searchKnowledge(searchQuery, { top_k: 5 });
      setSearchResults(res);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Document Analysis</h1>
          <p className="text-xs text-text-secondary">
            Upload and analyze your documents securely on local infrastructure
          </p>
        </div>

        <Link
          href="/knowledge/graph"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-bg-panel border border-border hover:border-accent text-xs font-mono text-text-secondary hover:text-accent transition-colors self-start sm:self-auto"
        >
          <Network className="w-3.5 h-3.5" />
          <span>View Knowledge Graph</span>
        </Link>
      </div>

      <div className="bg-bg-panel border-2 border-dashed border-border hover:border-accent/60 transition-colors rounded-lg p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
        <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-accent mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>
        <h2 className="text-sm font-semibold text-text-primary mb-1">Drop your files here or click to upload</h2>
        <p className="text-xs text-text-tertiary mb-4 max-w-sm">Supports PDF, TXT, MD, CSV, JSON, LOG</p>

        <label className="cursor-pointer px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all active:scale-95">
          <span>Choose File</span>
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            accept=".pdf,.txt,.csv,.json,.md,.log"
          />
        </label>

        {uploading && (
          <div className="mt-4 flex items-center gap-2 text-xs font-mono text-accent">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Uploading and ingesting...</span>
          </div>
        )}
        {uploadError && <p className="mt-3 text-xs font-mono text-error">{uploadError}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-bold text-text-primary uppercase font-mono tracking-wider">Uploaded Documents</h2>

        {loading && <LoadingState label="Loading documents..." />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {!loading && !error && (documents ?? []).length === 0 && (
          <EmptyState label="No documents yet" detail="Uploaded files will appear here once indexed." />
        )}

        {!loading && !error && (documents ?? []).length > 0 && (
          <div className="bg-bg-panel border border-border rounded-md overflow-hidden divide-y divide-border">
            {(documents ?? []).map((doc) => {
              const isPdf = doc.filename.endsWith('.pdf');
              const isCsv = doc.filename.endsWith('.csv');
              const Icon = isPdf ? FileText : isCsv ? FileSpreadsheet : FileCode;

              return (
                <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-bg-elevated/40 transition-colors gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0 ${
                        isPdf
                          ? 'bg-error/10 text-error border border-error/20'
                          : isCsv
                          ? 'bg-accent/10 text-accent border border-accent/20'
                          : 'bg-ok/10 text-ok border border-ok/20'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/knowledge/${doc.id}`}
                        className="text-xs font-semibold text-text-primary hover:text-accent truncate block font-mono"
                      >
                        {doc.filename}
                      </Link>
                      <div className="text-xs text-text-tertiary font-mono flex items-center gap-2">
                        <span>{(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                        {doc.page_count != null && (
                          <>
                            <span>·</span>
                            <span>{doc.page_count} pages</span>
                          </>
                        )}
                        {doc.parser && (
                          <>
                            <span>·</span>
                            <span className="text-ok">Parser: {doc.parser}</span>
                          </>
                        )}
                      </div>
                      {doc.error && <div className="text-xs font-mono text-error mt-0.5">{doc.error}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="px-2.5 py-1 rounded bg-bg-base border border-border">
                      <StatusDot status={doc.status} />
                    </div>
                    <Link
                      href={`/knowledge/${doc.id}`}
                      className="px-2.5 py-1 rounded bg-bg-elevated border border-border hover:border-accent text-accent text-xs font-mono transition-colors flex items-center gap-1"
                    >
                      <span>Inspect</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
                      title="Delete document and vector points"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-bg-panel border border-border rounded-md p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-1">RAG Semantic Search</h2>
          <p className="text-xs text-text-secondary">Query the local vector index and see numbered citations</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search indexed documents..."
              className="w-full bg-bg-elevated border border-border focus:border-accent text-text-primary text-xs rounded-md pl-9 pr-3 py-2 outline-none font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all disabled:opacity-50"
          >
            {searching ? 'Querying...' : 'Search'}
          </button>
        </form>

        {searchError && <ErrorState error={new Error(searchError)} compact />}

        {searchResults && (
          <div className="flex flex-col gap-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs font-mono text-text-tertiary bg-bg-base p-2.5 rounded border border-border">
              <span>
                Embed: <strong className="text-text-primary">{searchResults.timings.embed_ms?.toFixed(1) ?? '—'}ms</strong>
              </span>
              <span>
                Retrieve: <strong className="text-text-primary">{searchResults.timings.retrieve_ms?.toFixed(1) ?? '—'}ms</strong>
              </span>
              <span>
                Total: <strong className="text-ok">{searchResults.timings.total_ms?.toFixed(1) ?? '—'}ms</strong>
              </span>
            </div>

            {searchResults.chunks.length === 0 && (
              <p className="text-xs text-text-tertiary font-mono">No matching chunks found.</p>
            )}

            <div className="flex flex-col gap-2">
              {searchResults.chunks.map((chunk, cIdx) => (
                <div key={cIdx} className="bg-bg-elevated border border-border rounded p-3 text-xs flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-accent px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-xs">
                        {chunk.marker}
                      </span>
                      <span className="font-mono text-text-primary font-medium text-xs">{chunk.label}</span>
                    </div>
                    {chunk.score != null && (
                      <span className="font-mono text-xs text-ok">Score: {(chunk.score * 100).toFixed(1)}%</span>
                    )}
                  </div>
                  <p className="text-text-secondary leading-relaxed font-sans">{chunk.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
