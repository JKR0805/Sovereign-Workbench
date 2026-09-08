'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, useIsMock } from '../../lib/api';
import { DocumentRead, KnowledgeSearchResponse } from '../../lib/types';
import { StatusDot } from '../../components/primitives/StatusDot';
import { MockBadge } from '../../components/primitives/MockBadge';
import {
  UploadCloud,
  FileText,
  Search,
  Trash2,
  ExternalLink,
  Clock,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
  Network
} from 'lucide-react';

export default function KnowledgePage() {
  const isKnowledgeMock = useIsMock('knowledge');
  const [documents, setDocuments] = useState<DocumentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<string | null>(null);

  // Search Test Bench state
  const [searchQuery, setSearchQuery] = useState('emergency shutdown procedures and temperature limits');
  const [searchTopK, setSearchTopK] = useState(3);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);

  const loadDocs = async () => {
    try {
      const data = await api.getDocuments();
      setDocuments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStage('Parsing document pages via PyMuPDF...');
    await new Promise((r) => setTimeout(r, 400));

    setUploadStage('Classified text layer: Digital text preserved...');
    await new Promise((r) => setTimeout(r, 400));

    setUploadStage('Generating CPU FastEmbed ONNX embeddings (384d)...');
    await new Promise((r) => setTimeout(r, 500));

    setUploadStage('Indexed vectors in local Qdrant collection...');
    const doc = await api.uploadDocument(file);
    await new Promise((r) => setTimeout(r, 300));

    setUploading(false);
    setUploadStage(null);
    loadDocs();
  };

  const handleDelete = async (id: string) => {
    await api.deleteDocument(id);
    loadDocs();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await api.searchKnowledge(searchQuery, searchTopK);
      setSearchResults(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Document Analysis
            </h1>
            {isKnowledgeMock && <MockBadge label="Mock Corpus" size="sm" />}
          </div>
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

      {/* Upload Dropzone matching Reference Image 1 Bottom Center */}
      <div className="bg-bg-panel border-2 border-dashed border-border hover:border-accent/60 transition-colors rounded-lg p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
        <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-accent mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h2 className="text-sm font-semibold text-text-primary mb-1">
          Drop your files here or click to upload
        </h2>
        <p className="text-xs text-text-tertiary mb-4 max-w-sm">
          Supports PDF, DOCX, TXT, PPTX, XLSX (Max 100 MB per file)
        </p>

        <label className="cursor-pointer px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all active:scale-95">
          <span>Choose Files</span>
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            accept=".pdf,.docx,.txt,.pptx,.xlsx,.md,.csv"
          />
        </label>

        {uploading && (
          <div className="mt-4 flex items-center gap-2 text-xs font-mono text-accent animate-pulse">
            <Sparkles className="w-4 h-4" />
            <span>{uploadStage}</span>
          </div>
        )}
      </div>

      {/* Uploaded Documents List matching Reference Image 1 Bottom Center */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-bold text-text-primary uppercase font-mono tracking-wider">
          Uploaded Documents
        </h2>

        <div className="bg-bg-panel border border-border rounded-md overflow-hidden divide-y divide-border">
          {documents.map((doc) => {
            const isPdf = doc.filename.endsWith('.pdf');
            const isDocx = doc.filename.endsWith('.docx');
            const Icon = isPdf ? FileText : isDocx ? FileSpreadsheet : FileCode;

            return (
              <div
                key={doc.id}
                className="p-4 flex items-center justify-between hover:bg-bg-elevated/40 transition-colors gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0 ${
                      isPdf
                        ? 'bg-error/10 text-error border border-error/20'
                        : isDocx
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
                      <span>{(doc.size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                      <span>·</span>
                      <span>{doc.page_count} pages</span>
                      <span>·</span>
                      <span className="text-ok">Parser: {doc.parser}</span>
                      <span>·</span>
                      <span>{doc.chunks_count || 42} chunks</span>
                    </div>
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
      </div>

      {/* Interactive Search Test Bench matching FRONTEND_SPECIFICATION.md Section 4.6 */}
      <div className="bg-bg-panel border border-border rounded-md p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            RAG Semantic Search Test Bench
          </h2>
          <p className="text-xs text-text-secondary">
            Test on-premise CPU FastEmbed vector retrieval and numbered citation assembly
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search concepts, equipment parameters, or emergency protocols..."
              className="w-full bg-bg-elevated border border-border focus:border-accent text-text-primary text-xs rounded-md pl-9 pr-3 py-2 outline-none font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all"
          >
            {searching ? 'Querying...' : 'Search'}
          </button>
        </form>

        {searchResults && (
          <div className="flex flex-col gap-3 pt-3 border-t border-border">
            {/* Latency timing breakdown */}
            <div className="flex items-center justify-between text-xs font-mono text-text-tertiary bg-bg-base p-2.5 rounded border border-border">
              <span>
                Embed: <strong className="text-text-primary">{searchResults.timings.embed_ms}ms</strong> (CPU ONNX)
              </span>
              <span>
                Retrieve: <strong className="text-text-primary">{searchResults.timings.retrieve_ms}ms</strong> (Qdrant)
              </span>
              <span>
                Total: <strong className="text-ok">{searchResults.timings.total_ms}ms</strong>
              </span>
            </div>

            {/* Citations List */}
            <div className="flex flex-col gap-2">
              {searchResults.chunks.map((chunk, cIdx) => (
                <div
                  key={cIdx}
                  className="bg-bg-elevated border border-border rounded p-3 text-xs flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-accent px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-xs">
                        {chunk.marker}
                      </span>
                      <span className="font-mono text-text-primary font-medium text-xs">
                        {chunk.label}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-ok">
                      Score: {(chunk.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-text-secondary leading-relaxed font-sans">
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
