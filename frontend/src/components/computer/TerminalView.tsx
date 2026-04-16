/**
 * Monospaced terminal view for WebContainer-sourced entries
 * (npm install, npm run dev). Renders the accumulated log lines
 * with a status pill and auto-scrolls to bottom as lines append.
 */
import { useEffect, useRef } from 'react';
import type { TimelineEntry } from './types';

interface Props {
  entry: TimelineEntry;
}

export function TerminalView({ entry }: Props): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entry.terminalLines]);

  const statusDot =
    entry.status === 'success'
      ? 'bg-brand-green'
      : entry.status === 'error'
        ? 'bg-status-error'
        : 'bg-brand-orange animate-pulse';

  const lines = entry.terminalLines ?? [];

  return (
    <div className="h-full flex flex-col bg-[#0E0E10] text-[#E8E8E8]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1F1F1F] bg-[#141416] flex-shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
        <span className="text-[12px] font-mono text-[#D4D4D4] truncate">
          {entry.terminalTitle ?? 'Terminal'}
        </span>
        <span className="ml-auto text-[10px] text-[#666] uppercase tracking-wider">
          {entry.status === 'running' ? 'running' : entry.status}
        </span>
      </div>
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.55] whitespace-pre-wrap break-words"
      >
        {lines.length === 0 ? (
          <span className="text-[#666] italic">Waiting for output…</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="text-[#D4D4D4]">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
