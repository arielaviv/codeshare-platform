import { useState } from 'react';
import { Sparkles, X, ChevronDown, ChevronRight } from 'lucide-react';
import mr8Logo from '../../assets/mr8-logo.png';

export interface PreviewErrorInfo {
  message: string;
  stack?: string;
  file?: string;
  line?: number;
}

interface Props {
  error: PreviewErrorInfo;
  onFixWithAi: (error: PreviewErrorInfo) => void;
  onDismiss: () => void;
}

export function PreviewErrorOverlay({ error, onFixWithAi, onDismiss }: Props): JSX.Element {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const location = error.file
    ? `${shortPath(error.file)}${error.line ? `:${error.line}` : ''}`
    : null;
  const summary = extractSummary(error.message);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/92 dark:bg-[#0A0A0A]/94 backdrop-blur-sm px-6 py-8">
      <div className="max-w-[520px] w-full rounded-xl border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-edge dark:border-[#2A2A2A]">
          <img src={mr8Logo} alt="Mr8" width={24} height={24} className="rounded-md flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-ink dark:text-[#E8E8E8]">
              Something needs fixing
            </div>
            <div className="text-[11px] text-ink-tertiary dark:text-[#888] mt-0.5">
              {location ?? 'Preview ran into an error'}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-ink-tertiary dark:text-[#888] hover:text-ink dark:hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <pre className="text-[12px] leading-relaxed font-mono text-ink-secondary dark:text-[#D4D4D4] whitespace-pre-wrap break-words max-h-[160px] overflow-y-auto bg-surface-secondary dark:bg-[#0F0F0F] rounded-md px-3 py-2 border border-edge dark:border-[#2A2A2A]">
            {summary}
          </pre>

          {error.stack && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-ink-tertiary dark:text-[#888] hover:text-ink-secondary dark:hover:text-[#B4B4B4] transition-colors bg-transparent"
              >
                {detailsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {detailsOpen ? 'Hide details' : 'Show details'}
              </button>
              {detailsOpen && (
                <pre className="mt-2 text-[10.5px] leading-relaxed font-mono text-ink-tertiary dark:text-[#888] whitespace-pre-wrap break-words max-h-[180px] overflow-y-auto">
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F]">
          <button
            type="button"
            onClick={() => onFixWithAi(error)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-brand-orange text-white text-[12.5px] font-semibold hover:brightness-110 transition"
          >
            <Sparkles size={14} />
            Solve with AI
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 rounded-md border border-edge dark:border-[#2A2A2A] text-[12.5px] text-ink-secondary dark:text-[#A0A0A0] hover:bg-white dark:hover:bg-[#1A1A1A] transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function extractSummary(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= 600) return trimmed;
  return trimmed.slice(0, 600) + '…';
}

function shortPath(file: string): string {
  const cleaned = file.replace(/^file:\/\/\//, '').replace(/^\/+/, '');
  const parts = cleaned.split('/');
  if (parts.length <= 3) return cleaned;
  return parts.slice(-3).join('/');
}
