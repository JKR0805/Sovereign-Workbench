'use client';

import React, { useState } from 'react';
import {
  MOCK_GRAPH_ENTITIES,
  MOCK_GRAPH_RELATIONSHIPS
} from '../../../lib/mockData';
import { GraphEntity } from '../../../lib/types';
import { MockBadge } from '../../../components/primitives/MockBadge';
import {
  Search,
  Plus,
  Network,
  List,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  Info,
  Layers
} from 'lucide-react';

export default function KnowledgeGraphPage() {
  const [entities, setEntities] = useState<GraphEntity[]>(MOCK_GRAPH_ENTITIES);
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(MOCK_GRAPH_ENTITIES[0]);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');
  const [zoomLevel, setZoomLevel] = useState(100);

  const filteredEntities = entities.filter((e) => {
    const matchesSearch = e.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'All Types' || e.type === selectedType;
    return matchesSearch && matchesType;
  });

  const legendTypes = [
    { type: 'Equipment', color: '#4DA3FF' },
    { type: 'Document', color: '#35C08A' },
    { type: 'Process', color: '#A78BFA' },
    { type: 'Person/Team', color: '#818CF8' },
    { type: 'Sensor', color: '#4DD4AC' },
    { type: 'Event', color: '#E0A32E' },
    { type: 'Parameter', color: '#FACC15' },
  ];

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      {/* Header & Filter Bar matching Reference Image 2 Top Left */}
      <div className="bg-bg-panel border-b border-border p-4 flex flex-col gap-3 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-text-primary">
                Knowledge Graph
              </h1>
              <MockBadge label="Mock Topology" size="sm" />
            </div>
            <p className="text-xs text-text-secondary">
              Explore relationships across your documents, assets, processes and people
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-bg-elevated border border-border rounded-md p-0.5">
              <button
                onClick={() => setViewMode('graph')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'graph' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>Graph View</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'list' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List View</span>
              </button>
            </div>

            <button
              onClick={() => alert('Add Entity modal: Specify Entity Name, Type, and Target Relationships.')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Graph</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entities, documents, or concepts..."
              className="w-full bg-bg-elevated border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-xs text-text-secondary focus:border-accent outline-none font-mono"
            >
              <option value="All Types">Entity Type: All Types</option>
              {legendTypes.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.type}
                </option>
              ))}
            </select>

            <select className="bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-xs text-text-secondary focus:border-accent outline-none font-mono">
              <option>Relationship: All Relationships</option>
              <option>describes</option>
              <option>part of</option>
              <option>governs</option>
              <option>connected to</option>
              <option>monitors</option>
            </select>

            <select className="bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-xs text-text-secondary focus:border-accent outline-none font-mono">
              <option>Time Range: Last 1 Year</option>
              <option>Last 30 Days</option>
              <option>All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 relative overflow-hidden flex">
        {viewMode === 'graph' ? (
          /* Interactive SVG Graph Canvas */
          <div className="flex-1 h-full relative overflow-hidden bg-[#0A0C10] flex items-center justify-center">
            {/* Background Grid Pattern */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(#2E3542 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            {/* SVG Rendered Graph matching Reference Image 2 Top Left */}
            <svg
              className="w-full h-full cursor-grab active:cursor-grabbing"
              viewBox="100 50 650 450"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#2E3542" />
                </marker>
              </defs>

              {/* Edges */}
              {MOCK_GRAPH_RELATIONSHIPS.map((rel) => {
                const s = entities.find((e) => e.id === rel.source);
                const t = entities.find((e) => e.id === rel.target);
                if (!s || !t) return null;

                const midX = (s.x + t.x) / 2;
                const midY = (s.y + t.y) / 2;

                return (
                  <g key={rel.id} className="group">
                    <line
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke="#232833"
                      strokeWidth="1.5"
                      markerEnd="url(#arrow)"
                      className="group-hover:stroke-accent transition-colors"
                    />
                    {/* Relationship label */}
                    <rect
                      x={midX - 24}
                      y={midY - 8}
                      width="48"
                      height="16"
                      rx="3"
                      fill="#11141A"
                      stroke="#232833"
                    />
                    <text
                      x={midX}
                      y={midY + 3.5}
                      textAnchor="middle"
                      fill="#8B94A6"
                      fontSize="9"
                      fontFamily="JetBrains Mono"
                    >
                      {rel.label}
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {filteredEntities.map((ent) => {
                const isSelected = selectedEntity?.id === ent.id;
                const isCenter = ent.id === 'cdu';

                return (
                  <g
                    key={ent.id}
                    onClick={() => setSelectedEntity(ent)}
                    className="cursor-pointer group"
                  >
                    {/* Glow outline for selected node */}
                    {isSelected && (
                      <circle
                        cx={ent.x}
                        cy={ent.y}
                        r={isCenter ? 36 : 28}
                        fill="none"
                        stroke="#4DA3FF"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        className="animate-spin"
                        style={{ transformOrigin: `${ent.x}px ${ent.y}px` }}
                      />
                    )}

                    {/* Node circle */}
                    <circle
                      cx={ent.x}
                      cy={ent.y}
                      r={isCenter ? 28 : 20}
                      fill="#171B22"
                      stroke={ent.color}
                      strokeWidth={isCenter ? '3' : '2'}
                      className="group-hover:scale-110 transition-transform"
                    />

                    {/* Inner color dot */}
                    <circle cx={ent.x} cy={ent.y} r={isCenter ? 8 : 5} fill={ent.color} />

                    {/* Node Label Box */}
                    <rect
                      x={ent.x - 65}
                      y={ent.y + (isCenter ? 32 : 24)}
                      width="130"
                      height="26"
                      rx="4"
                      fill="#11141A"
                      stroke={isSelected ? '#4DA3FF' : '#232833'}
                      strokeWidth="1"
                    />
                    <text
                      x={ent.x}
                      y={ent.y + (isCenter ? 44 : 36)}
                      textAnchor="middle"
                      fill="#E6EAF2"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="Inter"
                    >
                      {ent.label.length > 18 ? ent.label.slice(0, 18) + '...' : ent.label}
                    </text>
                    <text
                      x={ent.x}
                      y={ent.y + (isCenter ? 54 : 46)}
                      textAnchor="middle"
                      fill="#8B94A6"
                      fontSize="8"
                      fontFamily="JetBrains Mono"
                    >
                      {ent.type}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Right overlay: Legend matching Reference Image 2 */}
            <div className="absolute top-4 right-4 bg-bg-panel/90 backdrop-blur-sm border border-border rounded-md p-3.5 text-xs font-mono flex flex-col gap-2 shadow-xl">
              <span className="text-xs text-text-tertiary uppercase font-bold mb-0.5">
                Entity Types
              </span>
              {legendTypes.map((t) => (
                <div key={t.type} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-text-secondary">{t.type}</span>
                </div>
              ))}
            </div>

            {/* Selected Entity Details Drawer (Bottom Left) */}
            {selectedEntity && (
              <div className="absolute bottom-4 left-4 max-w-sm bg-bg-panel/95 backdrop-blur-md border border-accent/40 rounded-lg p-4 shadow-2xl animate-in fade-in duration-150">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedEntity.color }}
                    />
                    <span className="text-sm font-bold text-text-primary">
                      {selectedEntity.label}
                    </span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-bg-elevated border border-border text-accent">
                    {selectedEntity.type}
                  </span>
                </div>

                {selectedEntity.details && (
                  <div className="flex flex-col gap-1 text-xs font-mono text-text-secondary">
                    {Object.entries(selectedEntity.details).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-text-tertiary">{k}:</span>
                        <span className="text-text-primary">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* List View */
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="bg-bg-panel border border-border rounded-md overflow-hidden divide-y divide-border">
              {filteredEntities.map((ent) => (
                <div key={ent.id} className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ent.color }} />
                    <span className="font-semibold text-text-primary">{ent.label}</span>
                  </div>
                  <span className="font-mono text-text-tertiary">{ent.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Stats Bar matching Reference Image 2 Top Left */}
      <div className="h-10 bg-bg-panel border-t border-border px-4 flex items-center justify-between text-xs font-mono text-text-secondary flex-shrink-0">
        <div className="flex items-center gap-6">
          <span>
            <strong className="text-text-primary">42</strong> Entities
          </span>
          <span>
            <strong className="text-text-primary">118</strong> Relationships
          </span>
          <span>
            <strong className="text-text-primary">6</strong> Document Sources
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomLevel(Math.max(50, zoomLevel - 15))}
            className="p-1 rounded hover:bg-bg-elevated hover:text-text-primary"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span>{zoomLevel}%</span>
          <button
            onClick={() => setZoomLevel(Math.min(200, zoomLevel + 15))}
            className="p-1 rounded hover:bg-bg-elevated hover:text-text-primary"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(100)}
            className="p-1 rounded hover:bg-bg-elevated hover:text-text-primary ml-1"
            title="Reset Fit"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
