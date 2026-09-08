'use client';

import React, { useState, useRef } from 'react';
import {
  Scan,
  FileText,
  GitBranch,
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Image as ImageIcon
} from 'lucide-react';
import { MockBadge } from '../../components/primitives/MockBadge';

export default function MultimodalAnalysisPage() {
  const [activeTool, setActiveTool] = useState<'object' | 'ocr' | 'diagram' | 'safety'>('object');
  const [selectedDetection, setSelectedDetection] = useState<string | null>('hotspot');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tools = [
    { id: 'object', label: 'Object Detection', icon: Scan },
    { id: 'ocr', label: 'OCR (Text Extraction)', icon: FileText },
    { id: 'diagram', label: 'Diagram Understanding', icon: GitBranch },
    { id: 'safety', label: 'Safety Analysis', icon: ShieldCheck },
  ];

  const detections = [
    {
      id: 'column',
      label: 'Distillation Column',
      confidence: 98,
      color: '#35C08A',
      status: 'Normal',
      coords: { x: '35%', y: '10%', width: '30%', height: '80%' },
    },
    {
      id: 'hotspot',
      label: 'Hotspot (142°C)',
      confidence: 96,
      color: '#E5484D',
      status: 'Warning Threshold',
      coords: { x: '45%', y: '18%', width: '15%', height: '14%' },
    },
    {
      id: 'valve',
      label: 'Control Valve',
      confidence: 94,
      color: '#4DA3FF',
      status: 'Normal',
      coords: { x: '42%', y: '68%', width: '16%', height: '12%' },
    },
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReset = () => {
    setUploadedImage(null);
    setUploadedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Header matching Reference Image 2 Center Right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Multimodal Analysis
            </h1>
            {!uploadedImage ? (
              <MockBadge label="Mock Vision Pipeline" size="sm" />
            ) : (
              <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-accent/20 text-accent border border-accent/40">
                Uploaded Image
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            Analyze images, diagrams and technical drawings using local open vision weights
          </p>
        </div>

        <div className="flex items-center gap-2">
          {uploadedImage && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded bg-bg-panel hover:bg-bg-elevated border border-border text-text-secondary text-xs font-semibold shadow transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sample CAD</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all flex items-center gap-1.5"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{uploadedImage ? 'Replace Image' : 'Upload Inspection Image'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Visual Inspection Canvas & Results Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Interactive Industrial Inspection Canvas matching Reference Image 2 */}
        <div className="lg:col-span-2 bg-[#090C12] border border-border rounded-lg overflow-hidden relative flex items-center justify-center p-4 min-h-[440px]">
          {/* SVG Industrial Plant Inspection Graphic */}
          <div className="relative w-full h-[400px] flex items-center justify-center">
            {/* Background Image: Uploaded or Refinery graphic representation */}
            {uploadedImage ? (
              <div className="w-full h-full flex items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedImage}
                  alt={uploadedFileName || 'Uploaded inspection'}
                  className="max-w-full max-h-[380px] object-contain rounded shadow-lg border border-border/50"
                />
              </div>
            ) : (
              <svg
                className="w-full h-full object-contain"
                viewBox="0 0 600 400"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Sky and distant structure silhouettes */}
                <rect width="600" height="400" fill="#0A0D14" />
                
                {/* Left secondary stack */}
                <rect x="80" y="80" width="40" height="320" rx="3" fill="#171C26" stroke="#252D3D" />
                <line x1="80" y1="140" x2="120" y2="140" stroke="#323C50" strokeWidth="2" />
                <line x1="80" y1="200" x2="120" y2="200" stroke="#323C50" strokeWidth="2" />
                <line x1="80" y1="280" x2="120" y2="280" stroke="#323C50" strokeWidth="2" />

                {/* Center Main Distillation Tower Column */}
                <rect x="230" y="40" width="90" height="360" rx="4" fill="#1A212E" stroke="#2D374B" strokeWidth="2" />
                {/* Trays */}
                {[70, 100, 130, 160, 190, 220, 250, 280, 310, 340].map((y) => (
                  <line key={y} x1="230" y1={y} x2="320" y2={y} stroke="#2D374B" strokeWidth="2" />
                ))}
                {/* Top condenser cap */}
                <path d="M 230 40 Q 275 15, 320 40 Z" fill="#252D3D" stroke="#3E4C66" />

                {/* Right secondary equipment & pipes */}
                <rect x="420" y="160" width="70" height="240" rx="4" fill="#141923" stroke="#252D3D" />
                <path d="M 320 180 L 420 180" stroke="#323C50" strokeWidth="6" />
                <path d="M 320 280 L 420 280" stroke="#323C50" strokeWidth="5" />
              </svg>
            )}

            {/* Bounding Box 1: Distillation Column (Green) */}
            <div
              onClick={() => setSelectedDetection('column')}
              className={`absolute cursor-pointer border-2 transition-all ${
                selectedDetection === 'column' ? 'border-[#35C08A] bg-[#35C08A]/15 ring-2 ring-[#35C08A]/50' : 'border-[#35C08A]/80 bg-[#35C08A]/10'
              }`}
              style={{ left: '36%', top: '8%', width: '19%', height: '88%' }}
            >
              <span className="absolute -top-6 left-0 bg-[#35C08A] text-black text-xs font-bold px-1.5 py-0.5 rounded-t font-mono">
                Distillation Column
              </span>
            </div>

            {/* Bounding Box 2: Hotspot 142°C (Red) */}
            <div
              onClick={() => setSelectedDetection('hotspot')}
              className={`absolute cursor-pointer border-2 transition-all ${
                selectedDetection === 'hotspot' ? 'border-[#E5484D] bg-[#E5484D]/25 animate-pulse ring-2 ring-[#E5484D]/60' : 'border-[#E5484D]/90 bg-[#E5484D]/15'
              }`}
              style={{ left: '38%', top: '16%', width: '15%', height: '14%' }}
            >
              <span className="absolute -top-6 left-0 bg-[#E5484D] text-white text-xs font-bold px-1.5 py-0.5 rounded-t font-mono shadow">
                Hotspot: 142°C
              </span>
            </div>

            {/* Bounding Box 3: Control Valve (Blue) */}
            <div
              onClick={() => setSelectedDetection('valve')}
              className={`absolute cursor-pointer border-2 transition-all ${
                selectedDetection === 'valve' ? 'border-[#4DA3FF] bg-[#4DA3FF]/20 ring-2 ring-[#4DA3FF]/50' : 'border-[#4DA3FF]/80 bg-[#4DA3FF]/10'
              }`}
              style={{ left: '38%', top: '65%', width: '15%', height: '12%' }}
            >
              <span className="absolute -top-6 left-0 bg-[#4DA3FF] text-white text-xs font-bold px-1.5 py-0.5 rounded-t font-mono">
                Valve: Normal
              </span>
            </div>
          </div>
        </div>

        {/* Right: Inspection Tools & Confidence Results matching Reference Image 2 */}
        <div className="flex flex-col gap-4">
          {/* Tool Selector Buttons matching Reference Image 2 */}
          <div className="grid grid-cols-2 gap-2">
            {tools.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTool(t.id as any)}
                  className={`p-2.5 rounded border text-sm font-semibold flex items-center gap-2 transition-all ${
                    activeTool === t.id
                      ? 'bg-accent/15 border-accent text-accent shadow-sm'
                      : 'bg-bg-panel border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Analysis Results Card matching Reference Image 2 Center Right */}
          <div className="bg-bg-panel border border-border rounded-md p-4 flex flex-col gap-3">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">
              Analysis Results
            </h2>

            <div className="flex flex-col gap-2.5">
              {detections.map((det) => (
                <div
                  key={det.id}
                  onClick={() => setSelectedDetection(det.id)}
                  className={`p-3 rounded border text-xs cursor-pointer transition-all flex items-center justify-between ${
                    selectedDetection === det.id
                      ? 'bg-bg-elevated border-accent'
                      : 'bg-bg-base border-border hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: det.color }} />
                    <div>
                      <div className="font-semibold text-text-primary text-sm">{det.label}</div>
                      <div className="text-xs font-mono text-text-tertiary">{det.status}</div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-text-primary">
                    {det.confidence}%
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-3 text-xs font-mono text-text-tertiary">
              Model: <strong className="text-text-secondary">Qwen2-VL 72B</strong> (Local Vision Passthrough)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
