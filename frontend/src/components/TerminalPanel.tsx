import { useEffect, useRef } from 'react';
import mr8Logo from '../assets/mr8-logo.png';

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]|\[[\d;]*[a-zA-Z]/g, '');
}

interface TerminalPanelProps {
  logs: string;
}

export default function TerminalPanel({ logs }: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-[#0F0F0F]">
      <div className="flex items-center gap-1 px-2 py-1 bg-[#1A1A1A] border-t border-[#2A2A2A] flex-shrink-0">
        <button className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-brand-orange bg-[#2A2A2A] rounded font-semibold">
          <img src={mr8Logo} alt="" width={14} height={14} className="rounded-sm" />
          Mr8
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[#666] hover:text-[#A0A0A0] rounded transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Terminal
        </button>
        <button className="px-1.5 py-1 text-[11px] text-[#666] hover:text-[#A0A0A0] transition-colors">+</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed subtle-scrollbar">
        {logs ? (
          <>
            <div className="text-[#4ADE80]">~/project</div>
            {stripAnsi(logs).split('\n').filter(l => l.trim() && !l.match(/^[|/\\-]$/)).map((line, i) => (
              <div key={i} className={line.startsWith('>') || line.startsWith('❯') ? 'text-[#E8E8E8]' : 'text-[#A0A0A0]'}>
                {line}
              </div>
            ))}
          </>
        ) : (
          <div className="text-[#4ADE80]">~/project</div>
        )}
      </div>
    </div>
  );
}
