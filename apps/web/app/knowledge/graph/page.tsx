'use client';

import React, { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useApiResource } from '../../../lib/useApiResource';
import { ErrorState } from '../../../components/primitives/ErrorState';
import { LoadingState, EmptyState } from '../../../components/primitives/LoadingState';
import type { GraphEntity } from '../../../lib/types';
import { Network, List, ZoomIn, ZoomOut, Maximize2, Info } from 'lucide-react';

interface PositionedEntity extends GraphEntity {
  x: number;
  y: number;
}

const WIDTH = 900;
const HEIGHT = 620;

/** A small deterministic force-directed layout (Fruchterman-Reingold-style):
 * nodes repel each other, edges pull connected nodes together, run for a
 * fixed number of iterations and settle. No coordinates are hand-authored --
 * every position is computed from the real edge structure the backend
 * returned. */
function layoutGraph(
  nodes: GraphEntity[],
  edges: { source: string; target: string; weight: number }[]
): PositionedEntity[] {
  const n = nodes.length;
  if (n === 0) return [];

  const positions = new Map<string, { x: number; y: number }>();
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const radius = Math.min(WIDTH, HEIGHT) / 2.6;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions.set(node.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  });

  const k = Math.sqrt((WIDTH * HEIGHT) / Math.max(n, 1)) * 0.6;
  const iterations = 120;

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = (1 - iter / iterations) * k * 0.5;
    const displacement = new Map<string, { x: number; y: number }>();
    nodes.forEach((node) => displacement.set(node.id, { x: 0, y: 0 }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        const da = displacement.get(nodes[i].id)!;
        const db = displacement.get(nodes[j].id)!;
        da.x += dx;
        da.y += dy;
        db.x -= dx;
        db.y -= dy;
      }
    }

    for (const edge of edges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const da = displacement.get(edge.source)!;
      const db = displacement.get(edge.target)!;
      da.x -= fx;
      da.y -= fy;
      db.x += fx;
      db.y += fy;
    }

    for (const node of nodes) {
      const pos = positions.get(node.id)!;
      const disp = displacement.get(node.id)!;
      const dist = Math.sqrt(disp.x * disp.x + disp.y * disp.y) || 0.01;
      const clamped = Math.min(dist, temperature);
      pos.x += (disp.x / dist) * clamped;
      pos.y += (disp.y / dist) * clamped;
      pos.x = Math.max(40, Math.min(WIDTH - 40, pos.x));
      pos.y = Math.max(40, Math.min(HEIGHT - 40, pos.y));
    }
  }

  return nodes.map((node) => ({ ...node, ...positions.get(node.id)! }));
}

const KIND_COLOR: Record<string, string> = {
  document: '#35C08A',
  term: '#4DA3FF',
};

export default function KnowledgeGraphPage() {
  const { data: graph, loading, error, reload } = useApiResource(() => api.getKnowledgeGraph(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);

  const positioned = useMemo(() => {
    if (!graph) return [];
    return layoutGraph(graph.nodes, graph.edges);
  }, [graph]);

  const filtered = positioned.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()));
  const selected = positioned.find((n) => n.id === selectedId) ?? null;
  const byId = new Map(positioned.map((n) => [n.id, n]));

  if (loading) return <LoadingState label="Building knowledge graph..." className="h-full" />;
  if (error) {
    return (
      <div className="p-6">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem-1.75rem)] flex flex-col overflow-hidden bg-bg-base">
      <div className="bg-bg-panel border-b border-border p-4 flex flex-col gap-3 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-text-primary">Knowledge Graph</h1>
            <p className="text-xs text-text-secondary flex items-center gap-1.5">
              <Info className="w-3 h-3 flex-shrink-0" />
              {graph?.method ?? 'Heuristic term co-occurrence over indexed documents -- not named-entity recognition.'}
            </p>
          </div>

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
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter nodes..."
          className="w-full max-w-md bg-bg-elevated border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:border-accent outline-none font-mono"
        />
      </div>

      <div className="flex-1 relative overflow-hidden flex">
        {!graph || graph.nodes.length === 0 ? (
          <EmptyState
            label="No graph yet"
            detail="Upload and index documents in the Knowledge Center to populate this graph."
            className="flex-1"
          />
        ) : viewMode === 'graph' ? (
          <div className="flex-1 h-full relative overflow-hidden bg-[#0A0C10] flex items-center justify-center">
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(#2E3542 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />

            <svg
              className="w-full h-full cursor-grab active:cursor-grabbing"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
            >
              {graph.edges.map((edge) => {
                const s = byId.get(edge.source);
                const t = byId.get(edge.target);
                if (!s || !t) return null;
                return (
                  <line
                    key={edge.id}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke="#232833"
                    strokeWidth={Math.min(1 + edge.weight * 0.4, 4)}
                    className="transition-colors"
                  />
                );
              })}

              {filtered.map((ent) => {
                const isSelected = selected?.id === ent.id;
                const isDoc = ent.kind === 'document';
                const r = isDoc ? 22 + Math.min(ent.weight, 20) * 0.4 : 10 + Math.min(ent.weight, 20) * 0.6;
                const color = KIND_COLOR[ent.kind] ?? '#8B94A6';

                return (
                  <g key={ent.id} onClick={() => setSelectedId(ent.id)} className="cursor-pointer group">
                    {isSelected && (
                      <circle cx={ent.x} cy={ent.y} r={r + 8} fill="none" stroke="#4DA3FF" strokeWidth="2" strokeDasharray="4 4" />
                    )}
                    <circle
                      cx={ent.x}
                      cy={ent.y}
                      r={r}
                      fill="#171B22"
                      stroke={color}
                      strokeWidth={isDoc ? '3' : '2'}
                      className="group-hover:opacity-90 transition-opacity"
                    />
                    <circle cx={ent.x} cy={ent.y} r={r * 0.3} fill={color} />
                    <text x={ent.x} y={ent.y + r + 14} textAnchor="middle" fill="#E6EAF2" fontSize="10" fontWeight="600">
                      {ent.label.length > 20 ? ent.label.slice(0, 19) + '...' : ent.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="absolute top-4 right-4 bg-bg-panel/90 backdrop-blur-sm border border-border rounded-md p-3.5 text-xs font-mono flex flex-col gap-2 shadow-xl">
              <span className="text-xs text-text-tertiary uppercase font-bold mb-0.5">Node Kind</span>
              {Object.entries(KIND_COLOR).map(([kind, color]) => (
                <div key={kind} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-text-secondary capitalize">{kind}</span>
                </div>
              ))}
            </div>

            {selected && (
              <div className="absolute bottom-4 left-4 max-w-sm bg-bg-panel/95 backdrop-blur-md border border-accent/40 rounded-lg p-4 shadow-2xl animate-in fade-in duration-150">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: KIND_COLOR[selected.kind] }} />
                    <span className="text-sm font-bold text-text-primary">{selected.label}</span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-bg-elevated border border-border text-accent capitalize">
                    {selected.kind}
                  </span>
                </div>
                <div className="text-xs font-mono text-text-secondary">
                  Occurrences: <span className="text-text-primary">{selected.weight}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="bg-bg-panel border border-border rounded-md overflow-hidden divide-y divide-border">
              {filtered.map((ent) => (
                <div key={ent.id} className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: KIND_COLOR[ent.kind] }} />
                    <span className="font-semibold text-text-primary">{ent.label}</span>
                  </div>
                  <span className="font-mono text-text-tertiary">
                    {ent.kind} · {ent.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="h-10 bg-bg-panel border-t border-border px-4 flex items-center justify-between text-xs font-mono text-text-secondary flex-shrink-0">
        <div className="flex items-center gap-6">
          <span>
            <strong className="text-text-primary">{graph?.nodes.length ?? 0}</strong> Nodes
          </span>
          <span>
            <strong className="text-text-primary">{graph?.edges.length ?? 0}</strong> Edges
          </span>
          <span>
            <strong className="text-text-primary">{graph?.documents_indexed ?? 0}</strong> Document Sources
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setZoomLevel(Math.max(50, zoomLevel - 15))} className="p-1 rounded hover:bg-bg-elevated hover:text-text-primary">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span>{zoomLevel}%</span>
          <button onClick={() => setZoomLevel(Math.min(200, zoomLevel + 15))} className="p-1 rounded hover:bg-bg-elevated hover:text-text-primary">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setZoomLevel(100)} className="p-1 rounded hover:bg-bg-elevated hover:text-text-primary ml-1" title="Reset Fit">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
