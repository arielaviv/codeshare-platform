import { useState } from 'react';

interface Props {
  tool: string;
  input: unknown;
  result?: unknown;
  status: 'running' | 'done' | 'error';
}

interface ToolPresentation {
  icon: string;
  label: string;
  summary: string;
}

function summarizeInput(tool: string, input: unknown): ToolPresentation {
  const obj = (input ?? {}) as Record<string, unknown>;
  if (tool === 'write_file') {
    const path = String(obj.path ?? '?');
    const content = typeof obj.content === 'string' ? obj.content : '';
    const sizeKb = (content.length / 1024).toFixed(1);
    return { icon: '📄', label: path, summary: `${sizeKb} KB` };
  }
  if (tool === 'delete_file') {
    return { icon: '🗑', label: String(obj.path ?? '?'), summary: 'deleted' };
  }
  if (tool === 'browser' || tool.startsWith('browser:')) {
    const action = String(obj.action ?? tool.split(':')[1] ?? 'browser');
    if (action === 'navigate') {
      return { icon: '🌐', label: String(obj.url ?? ''), summary: 'navigate' };
    }
    if (action === 'search') {
      return { icon: '🔎', label: `"${String(obj.query ?? '')}"`, summary: 'search' };
    }
    if (action === 'click') {
      return { icon: '🖱', label: String(obj.selector ?? ''), summary: 'click' };
    }
    if (action === 'extract') {
      return { icon: '📋', label: String(obj.selector ?? 'body'), summary: 'extract' };
    }
    if (action === 'screenshot') {
      return { icon: '📸', label: 'page', summary: 'screenshot' };
    }
    return { icon: '🌐', label: action, summary: 'browser' };
  }
  if (tool === 'python_execution') {
    const code = typeof obj.code === 'string' ? obj.code : '';
    const firstLine = code.split('\n').find((l) => l.trim()) ?? '';
    return { icon: '🐍', label: firstLine.slice(0, 60) || 'script', summary: 'python' };
  }
  if (tool === 'fetch_unsplash_image') {
    return {
      icon: '🖼',
      label: String(obj.query ?? ''),
      summary: `images${obj.count ? ` × ${obj.count}` : ''}`,
    };
  }
  if (tool === 'award_prize') {
    return {
      icon: '🎁',
      label: String(obj.reason ?? 'prize'),
      summary: 'award',
    };
  }
  return { icon: '⚙', label: tool, summary: 'tool' };
}

export default function ToolCallCard({ tool, input, result, status }: Props) {
  const [open, setOpen] = useState(false);
  const { icon, label, summary } = summarizeInput(tool, input);

  const statusDot =
    status === 'running'
      ? 'bg-brand-orange animate-pulse'
      : status === 'error'
        ? 'bg-status-error'
        : 'bg-status-live';

  return (
    <div className="my-1.5 rounded-lg border border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#141414] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
        <span className="text-sm flex-shrink-0" aria-hidden>
          {icon}
        </span>
        <span className="text-xs font-mono text-ink dark:text-[#E8E8E8] flex-1 truncate">
          {label}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] flex-shrink-0">
          {summary}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`flex-shrink-0 text-ink-tertiary dark:text-[#666] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#0F0F0F]">
          <pre className="text-[11px] font-mono text-ink-secondary dark:text-[#A0A0A0] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
            {JSON.stringify({ input, ...(result !== undefined && { result }) }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
