/**
 * Wide Research result card. Shows summary + collapsible key facts +
 * collapsible sources list.
 */
import { useState } from 'react';
import type { ResearchBrief } from '../../types/deck';

interface Props {
  brief: ResearchBrief;
}

export default function ResearchBriefCard({ brief }: Props): JSX.Element {
  const [factsOpen, setFactsOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <div className="my-3 rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F]">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Research brief · "{brief.query}"
        </div>
        <p className="text-[14px] leading-relaxed text-ink dark:text-[#E8E8E8]">
          {brief.summary}
        </p>
      </div>

      {/* Key facts */}
      {brief.keyFacts && brief.keyFacts.length > 0 && (
        <div className="border-b border-edge dark:border-[#2A2A2A]">
          <button
            type="button"
            onClick={() => setFactsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[12px] font-medium text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <span>Key facts ({brief.keyFacts.length})</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-ink-tertiary transition-transform ${factsOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {factsOpen && (
            <ul className="px-4 pb-3 space-y-1.5 list-disc list-inside marker:text-ink-tertiary">
              {brief.keyFacts.map((f, i) => (
                <li key={i} className="text-[13px] text-ink-secondary dark:text-[#D4D4D4] leading-relaxed">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sources */}
      {brief.sources && brief.sources.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[12px] font-medium text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <span>Sources ({brief.sources.length})</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-ink-tertiary transition-transform ${sourcesOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {sourcesOpen && (
            <ol className="px-4 pb-3 space-y-2">
              {brief.sources.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12px]">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surface-tertiary dark:bg-[#2A2A2A] text-ink-secondary dark:text-[#A0A0A0] text-[10px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-orange hover:underline font-medium block truncate"
                    >
                      {s.title || s.url}
                    </a>
                    <div className="text-ink-tertiary dark:text-[#666] text-[11px] truncate">
                      {s.url}
                    </div>
                    {s.snippet && (
                      <div className="text-ink-secondary dark:text-[#A0A0A0] text-[12px] mt-1 line-clamp-2">
                        {s.snippet}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
