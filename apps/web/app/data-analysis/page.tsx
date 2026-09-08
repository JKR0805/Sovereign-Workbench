'use client';

import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { useApiResource } from '../../lib/useApiResource';
import { ErrorState } from '../../components/primitives/ErrorState';
import { LoadingState, EmptyState } from '../../components/primitives/LoadingState';
import type { ChunkRead } from '../../lib/types';

interface ParsedTable {
  headers: string[];
  rows: string[][];
  chunkId: string;
}

const SERIES_COLORS = ['#E0A32E', '#4DA3FF', '#35C08A', '#A78BFA', '#4DD4AC'];

/** Parses the markdown pipe-tables the backend's table-aware chunker emits
 * (see rag/parse.py::_parse_markdown_blocks). A chunk that is a table starts
 * with a header row and a `| --- |` separator row -- exactly what
 * BlockType.TABLE chunks contain, verbatim. */
function parseMarkdownTables(chunks: ChunkRead[]): ParsedTable[] {
  const tables: ParsedTable[] = [];
  for (const chunk of chunks) {
    const lines = chunk.text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    if (!lines[0].startsWith('|') || !/^\|?(\s*:?-{2,}:?\s*\|)+/.test(lines[1])) continue;

    const splitRow = (line: string) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

    const headers = splitRow(lines[0]);
    const rows = lines.slice(2).map(splitRow).filter((r) => r.length === headers.length);
    if (rows.length > 0) tables.push({ headers, rows, chunkId: chunk.id });
  }
  return tables;
}

function isNumericColumn(rows: string[][], colIndex: number): boolean {
  let numeric = 0;
  for (const row of rows) {
    if (row[colIndex] !== undefined && !Number.isNaN(parseFloat(row[colIndex]))) numeric++;
  }
  return numeric >= rows.length * 0.7;
}

export default function DataAnalysisPage() {
  const { data: documents, loading: docsLoading, error: docsError } = useApiResource(() => api.getDocuments(), []);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const indexedDocs = (documents ?? []).filter((d) => d.status === 'indexed');
  const activeDocId = selectedDocId ?? indexedDocs[0]?.id ?? null;

  const { data: chunks, loading: chunksLoading, error: chunksError } = useApiResource(
    () => (activeDocId ? api.getDocumentChunks(activeDocId) : Promise.resolve<ChunkRead[]>([])),
    [activeDocId]
  );

  const tables = useMemo(() => parseMarkdownTables(chunks ?? []), [chunks]);
  const table = tables[0] ?? null;

  const numericColumns = useMemo(() => {
    if (!table) return [];
    return table.headers
      .map((h, i) => i)
      .filter((i) => i > 0 && isNumericColumn(table.rows, i));
  }, [table]);

  const chartData = useMemo(() => {
    if (!table || numericColumns.length === 0) return [];
    return table.rows.map((row) => {
      const point: Record<string, string | number> = { label: row[0] };
      for (const col of numericColumns) {
        const parsed = parseFloat(row[col]);
        if (!Number.isNaN(parsed)) point[table.headers[col]] = parsed;
      }
      return point;
    });
  }, [table, numericColumns]);

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Data Analysis</h1>
          <p className="text-xs text-text-secondary">
            Charts parsed tables from your indexed documents -- real values, not simulated telemetry
          </p>
        </div>

        <select
          value={activeDocId ?? ''}
          onChange={(e) => setSelectedDocId(e.target.value)}
          disabled={indexedDocs.length === 0}
          className="bg-bg-panel border border-border rounded-md px-3 py-1.5 text-xs text-text-primary font-mono focus:border-accent outline-none disabled:opacity-50"
        >
          {indexedDocs.length === 0 && <option value="">No indexed documents</option>}
          {indexedDocs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.filename}
            </option>
          ))}
        </select>
      </div>

      {docsLoading && <LoadingState label="Loading documents..." />}
      {docsError && <ErrorState error={docsError} />}

      {!docsLoading && !docsError && indexedDocs.length === 0 && (
        <EmptyState
          label="No indexed documents"
          detail="Upload a document with a table (CSV, or markdown with a pipe table) in the Knowledge Center first."
        />
      )}

      {activeDocId && (
        <div className="bg-[#0B0E14] border border-border rounded-lg p-5 flex flex-col gap-4 shadow-xl">
          {chunksLoading && <LoadingState compact label="Loading table data..." />}
          {chunksError && <ErrorState error={chunksError} compact />}

          {!chunksLoading && !chunksError && !table && (
            <EmptyState
              label="No table found in this document"
              detail="This document has no markdown pipe-table or CSV-derived chunk to chart. Try a document that includes a data table."
            />
          )}

          {table && (
            <>
              {numericColumns.length > 0 ? (
                <>
                  <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
                    {numericColumns.map((col, i) => (
                      <span key={col} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                        <span className="text-text-secondary">{table.headers[col]}</span>
                      </span>
                    ))}
                  </div>

                  <div className="h-72 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid stroke="#232833" strokeDasharray="3 3" />
                        <XAxis dataKey="label" stroke="#5A6376" fontSize={10} tickLine={false} />
                        <YAxis stroke="#5A6376" fontSize={10} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#171B22',
                            borderColor: '#2E3542',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        />
                        {numericColumns.map((col, i) => (
                          <Line
                            key={col}
                            type="monotone"
                            dataKey={table.headers[col]}
                            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary">
                  <AlertTriangle className="w-4 h-4" />
                  No numeric columns detected in this table -- showing raw data only.
                </div>
              )}

              <div className="overflow-x-auto border-t border-border pt-3">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-text-tertiary">
                      {table.headers.map((h) => (
                        <th key={h} className="py-1.5 pr-4">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {table.rows.slice(0, 40).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="py-1 pr-4 text-text-secondary">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.rows.length > 40 && (
                  <p className="text-xs text-text-tertiary mt-2">
                    Showing 40 of {table.rows.length} rows from this chunk.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
