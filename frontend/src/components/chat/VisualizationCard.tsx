/**
 * Inline visualization result card. PNG image, optional collapsible Python
 * source, Download PNG.
 */
import { useState } from 'react';
import { getStaticBase } from '../../lib/apiBase';

interface Props {
  imageUrl?: string; // undefined while generating
  chartKind?: string;
  code?: string;
  status: 'running' | 'done' | 'error';
  failReason?: string;
  title?: string;
}

export default function VisualizationCard({
  imageUrl,
  chartKind,
  code,
  status,
  failReason,
  title,
}: Props): JSX.Element {
  const [codeOpen, setCodeOpen] = useState(false);
  const fullUrl = imageUrl
    ? imageUrl.startsWith('http') || imageUrl.startsWith('data:')
      ? imageUrl
      : `${getStaticBase()}${imageUrl}`
    : undefined;

  return (
    <div className="my-3 rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden max-w-[720px]">
      <div className="px-4 py-3 border-b border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F] flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-orange">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <span className="text-sm font-semibold text-ink dark:text-[#E8E8E8] flex-1 truncate">
          {title ?? 'Visualization'}
        </span>
        {chartKind && chartKind !== 'unknown' && (
          <span className="text-[10px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] flex-shrink-0">
            {chartKind}
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-[#0A0A0A] flex items-center justify-center min-h-[240px]">
        {fullUrl ? (
          <img src={fullUrl} alt="Generated chart" className="max-w-full max-h-[480px] object-contain" />
        ) : status === 'error' ? (
          <div className="text-status-error text-sm text-center px-6 py-12">
            {failReason ?? 'Generation failed.'}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-ink-tertiary dark:text-[#666] py-12">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin text-brand-orange">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <div className="text-sm">Mr8 is rendering the chart…</div>
          </div>
        )}
      </div>

      {code && (
        <div className="border-t border-edge dark:border-[#2A2A2A]">
          <button
            type="button"
            onClick={() => setCodeOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-[12px] font-medium text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <span>Generated Python</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-ink-tertiary transition-transform ${codeOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {codeOpen && (
            <pre className="px-4 pb-3 text-[11px] font-mono text-ink-secondary dark:text-[#A0A0A0] overflow-x-auto max-h-72 overflow-y-auto">
              {code}
            </pre>
          )}
        </div>
      )}

      {fullUrl && (
        <div className="border-t border-edge dark:border-[#2A2A2A] px-4 py-2 flex justify-end">
          <a
            href={fullUrl}
            download
            className="text-[11px] text-ink-secondary dark:text-[#A0A0A0] hover:text-brand-orange transition-colors"
          >
            Download PNG →
          </a>
        </div>
      )}
    </div>
  );
}
