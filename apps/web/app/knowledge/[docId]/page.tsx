'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { ChunkRead } from '../../../lib/types';
import {
  ChevronLeft,
  FileText,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Layers,
  HelpCircle,
  Hash
} from 'lucide-react';

export default function DocumentInsightsPage() {
  const params = useParams();
  const docId = (params?.docId as string) || 'doc-refinery-safety';

  const [chunks, setChunks] = useState<ChunkRead[]>([]);
  const [activeTab, setActiveTab] = useState<'summary' | 'findings' | 'entities' | 'qa'>('summary');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [highlightedChunkId, setHighlightedChunkId] = useState<string | null>('chunk-rs-1');

  useEffect(() => {
    let active = true;
    const fetchDocChunks = async () => {
      try {
        const data = await api.getDocumentChunks(docId);
        if (active) setChunks(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchDocChunks();
    return () => {
      active = false;
    };
  }, [docId]);

  const docTitle = docId.includes('safety')
    ? 'Refinery_Safety_Manual.pdf'
    : docId.includes('spec')
    ? 'Equipment_Specifications.docx'
    : 'e102_report.md';

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      {/* Top Bar */}
      <div className="h-11 bg-bg-panel border-b border-border px-4 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <Link
            href="/knowledge"
            className="flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Documents</span>
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="text-text-primary font-semibold truncate max-w-xs">{docTitle}</span>
          <span className="text-text-tertiary">Page 12 of 48</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-bg-elevated border border-border px-2 py-0.5 rounded">
            <button
              onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
              className="p-1 hover:text-text-primary"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-text-secondary px-1">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}
              className="p-1 hover:text-text-primary"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Body matching Reference Image 2 Bottom Left */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Rendered Document View with Highlighted Bounding Box */}
        <div className="flex-1 bg-[#0D1017] p-6 overflow-y-auto flex items-center justify-center">
          <div
            className="w-full max-w-2xl bg-[#131720] border border-border rounded shadow-2xl p-8 transition-transform font-serif leading-relaxed text-text-primary select-text"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          >
            <div className="border-b border-border pb-4 mb-6 flex justify-between items-center text-xs font-mono text-text-tertiary">
              <span>REFINERY ENGINEERING & SAFETY PROTOCOL</span>
              <span>SECTION 4: EMERGENCY ACTIONS</span>
            </div>

            <h3 className="text-base font-bold font-sans text-white mb-4">
              4.2.3 Emergency Shutdown Procedure
            </h3>

            <p className="text-xs text-text-secondary mb-4">
              In regular operation, temperature monitoring at distillation column DC-101 is performed via redundant thermocouple sensors. If process conditions deviate beyond standard thresholds:
            </p>

            {/* Highlighted section in yellow box */}
            <div
              className={`p-3 rounded my-4 border transition-all ${
                highlightedChunkId
                  ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-100 font-medium'
                  : 'bg-bg-elevated border-border'
              }`}
            >
              <p className="text-xs leading-relaxed">
                In case of abnormal temperature or pressure conditions, the emergency shutdown system (ESD) shall be activated immediately. The ESD will isolate the distillation column and cut feed supply within 30 seconds.
              </p>
            </div>

            <p className="text-xs text-text-secondary mb-3">
              Following automatic isolation, the safety crew must verify nitrogen purge activation on the top vapor condenser tray. Catwalk areas above elevation 24m must be cleared within 2 minutes.
            </p>

            <div className="mt-8 pt-4 border-t border-border flex justify-between text-xs font-mono text-text-tertiary">
              <span>Standard: OISD-156</span>
              <span>Page 12 / 48</span>
            </div>
          </div>
        </div>

        {/* Right Side: AI Insights & Extracted Chunks */}
        <div className="w-full lg:w-96 bg-bg-panel border-t lg:border-t-0 lg:border-l border-border flex flex-col flex-shrink-0">
          {/* Tabs */}
          <div className="flex items-center border-b border-border text-xs font-medium">
            {(['summary', 'findings', 'entities', 'qa'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 capitalize transition-colors border-b-2 -mb-px text-center ${
                  activeTab === tab
                    ? 'border-accent text-accent font-semibold'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab === 'qa' ? 'Q&A' : tab === 'findings' ? 'Key Findings' : tab}
              </button>
            ))}
          </div>

          {/* Tab Content matching Reference Image 2 Bottom Left */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 text-xs">
            {activeTab === 'summary' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-accent font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>AI Summary</span>
                </div>
                <p className="text-text-secondary leading-relaxed">
                  This document outlines safety procedures for refinery operations, including emergency shutdown protocols, hazard classification, and personnel safety requirements.
                </p>

                <div className="border-t border-border pt-3">
                  <span className="font-semibold text-text-primary block mb-2">Key Points:</span>
                  <ul className="list-disc pl-4 space-y-1.5 text-text-secondary leading-normal">
                    <li>Emergency shutdown within 30 seconds</li>
                    <li>Regular safety inspections required</li>
                    <li>PPE mandatory in hazardous areas</li>
                    <li>Nitrogen purge automatic lockout</li>
                  </ul>
                </div>

                {/* Chunks List */}
                <div className="border-t border-border pt-3">
                  <span className="font-semibold text-text-primary block mb-2 font-mono text-xs uppercase">
                    Extracted Vector Chunks ({chunks.length})
                  </span>
                  <div className="flex flex-col gap-2">
                    {chunks.map((chk) => (
                      <div
                        key={chk.id}
                        onMouseEnter={() => setHighlightedChunkId(chk.id)}
                        className={`p-2.5 rounded border text-xs font-mono cursor-pointer transition-colors ${
                          highlightedChunkId === chk.id
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'bg-bg-elevated border-border text-text-secondary hover:border-border-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-text-primary font-semibold truncate">
                            {chk.section_path}
                          </span>
                          <span className="text-text-tertiary">{chk.token_count} tok</span>
                        </div>
                        <p className="font-sans line-clamp-2 text-text-secondary">
                          {chk.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'findings' && (
              <div className="flex flex-col gap-2">
                <div className="p-2.5 rounded bg-bg-elevated border border-border">
                  <span className="text-ok font-semibold block mb-1">✓ Compliance Verified</span>
                  <p className="text-text-secondary">
                    Isolation valves comply with ASME Section VIII and OISD-156 emergency standard.
                  </p>
                </div>
                <div className="p-2.5 rounded bg-bg-elevated border border-border">
                  <span className="text-warn font-semibold block mb-1">⚠ Thermal Threshold Note</span>
                  <p className="text-text-secondary">
                    Operating limit is 350°C. Temperature sensor alarms trigger at 340°C.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'entities' && (
              <div className="flex flex-col gap-2 font-mono">
                <div className="p-2 rounded bg-bg-elevated border border-border flex justify-between">
                  <span className="text-accent">Crude Distillation Unit (CDU-100)</span>
                  <span className="text-text-tertiary">Equipment</span>
                </div>
                <div className="p-2 rounded bg-bg-elevated border border-border flex justify-between">
                  <span className="text-ok">Emergency Shutdown System (ESD)</span>
                  <span className="text-text-tertiary">Safety Control</span>
                </div>
                <div className="p-2 rounded bg-bg-elevated border border-border flex justify-between">
                  <span className="text-modality-vision">Distillation Column (DC-101)</span>
                  <span className="text-text-tertiary">Process Unit</span>
                </div>
              </div>
            )}

            {activeTab === 'qa' && (
              <div className="flex flex-col gap-2">
                <div className="p-2.5 rounded bg-bg-elevated border border-border">
                  <span className="font-semibold text-text-primary block mb-1">
                    Q: What is the isolation time for the ESD?
                  </span>
                  <p className="text-accent">
                    A: Within 30 seconds of activation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
