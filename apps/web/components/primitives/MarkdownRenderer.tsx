'use client';

import React, { useState, useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border/80 bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-border/50">
        <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all duration-200 hover:bg-white/10 text-text-tertiary hover:text-text-primary"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-ok">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="px-4 py-3 overflow-x-auto text-xs leading-relaxed">
        <code className="font-mono text-[#e6edf3]">{code}</code>
      </pre>
    </div>
  );
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex to match: bold, italic, inline code, links
  const inlineRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Inline code
      const code = match[1].slice(1, -1);
      nodes.push(
        <code key={match.index} className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border text-accent font-mono text-[0.85em]">
          {code}
        </code>
      );
    } else if (match[2]) {
      // Bold
      nodes.push(<strong key={match.index} className="font-bold text-text-primary">{match[2].slice(2, -2)}</strong>);
    } else if (match[3]) {
      // Italic with *
      nodes.push(<em key={match.index} className="italic text-text-secondary">{match[3].slice(1, -1)}</em>);
    } else if (match[4]) {
      // Italic with _
      nodes.push(<em key={match.index} className="italic text-text-secondary">{match[4].slice(1, -1)}</em>);
    } else if (match[5]) {
      // Link
      nodes.push(
        <a key={match.index} href={match[7]} className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors" target="_blank" rel="noopener noreferrer">
          {match[6]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/**
 * Pure React Markdown renderer — zero external dependencies.
 * Handles code blocks, headers, lists, blockquotes, tables, bold, italic, inline code, and links.
 * Tolerant of unclosed code blocks during active streaming.
 */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const rendered = useMemo(() => {
    if (!content) return null;

    const elements: React.ReactNode[] = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      if (line.trimStart().startsWith('```')) {
        const lang = line.trimStart().slice(3).trim();
        const codeLines: string[] = [];
        i++;
        let closed = false;
        while (i < lines.length) {
          if (lines[i].trimStart().startsWith('```')) {
            closed = true;
            i++;
            break;
          }
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <CodeBlock key={`code-${elements.length}`} language={lang} code={codeLines.join('\n')} />
        );
        continue;
      }

      // Table detection
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-|:\s]+$/.test(lines[i + 1])) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].includes('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          const parseRow = (row: string) =>
            row.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - (row.endsWith('|') ? 1 : 0));
          const headers = parseRow(tableLines[0]);
          const bodyRows = tableLines.slice(2).map(parseRow);

          elements.push(
            <div key={`table-${elements.length}`} className="my-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-bg-elevated border-b border-border">
                    {headers.map((h, idx) => (
                      <th key={idx} className="px-3 py-2 text-left font-bold text-text-primary whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-border/50 last:border-b-0 hover:bg-bg-elevated/50 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 text-text-secondary whitespace-nowrap">{parseInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={`h3-${elements.length}`} className="text-sm font-bold text-text-primary mt-4 mb-1.5 tracking-tight">
            {parseInline(line.slice(4))}
          </h3>
        );
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={`h2-${elements.length}`} className="text-base font-bold text-text-primary mt-5 mb-2 tracking-tight">
            {parseInline(line.slice(3))}
          </h2>
        );
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${elements.length}`} className="text-lg font-bold text-text-primary mt-5 mb-2 pb-1.5 border-b border-border/60 tracking-tight">
            {parseInline(line.slice(2))}
          </h1>
        );
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <blockquote key={`bq-${elements.length}`} className="my-2 pl-4 border-l-3 border-accent/60 text-text-secondary italic text-sm leading-relaxed">
            {quoteLines.map((ql, qIdx) => (
              <p key={qIdx}>{parseInline(ql)}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // Unordered list
      if (/^(\s*)([-*+])\s/.test(line)) {
        const listItems: { indent: number; text: string }[] = [];
        while (i < lines.length && /^(\s*)([-*+])\s/.test(lines[i])) {
          const itemMatch = lines[i].match(/^(\s*)([-*+])\s(.*)$/);
          if (itemMatch) {
            listItems.push({ indent: itemMatch[1].length, text: itemMatch[3] });
          }
          i++;
        }
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-2 space-y-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-text-secondary" style={{ paddingLeft: `${item.indent * 0.75 + 0.25}rem` }}>
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent/70 flex-shrink-0" />
                <span className="leading-relaxed">{parseInline(item.text)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Ordered list
      if (/^\s*\d+[.)]\s/.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
          const itemMatch = lines[i].match(/^\s*\d+[.)]\s(.*)$/);
          if (itemMatch) listItems.push(itemMatch[1]);
          i++;
        }
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-2 space-y-1 list-decimal list-inside">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-text-secondary leading-relaxed marker:text-accent/80 marker:font-mono">
                {parseInline(item)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
        elements.push(<hr key={`hr-${elements.length}`} className="my-4 border-border/60" />);
        i++;
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Normal paragraph
      elements.push(
        <p key={`p-${elements.length}`} className="text-text-primary leading-relaxed my-1">
          {parseInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  }, [content]);

  return (
    <div className={`markdown-renderer font-sans text-xs sm:text-sm ${className}`}>
      {rendered}
    </div>
  );
}
