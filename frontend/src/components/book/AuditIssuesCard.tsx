/**
 * AuditIssuesCard — renders the Continuity Auditor's flagged issues in a
 * collapsible panel. Each row expandable, shows description + suggestedFix
 * + resolved status. Counter in header updates as the Line Editor resolves.
 *
 * Empty state (zero issues) renders as a reassuring success line rather
 * than hiding — tells the user the auditor ran and found nothing.
 */
import { useState } from 'react';
import type { AuditIssue } from '../../services/bookPolishStream';

interface Props {
  bookTitle: string;
  issues: AuditIssue[];
}

const KIND_LABEL: Record<AuditIssue['kind'], string> = {
  character: 'Character',
  timeline: 'Timeline',
  setting: 'Setting',
  name: 'Name',
  tone: 'Tone',
  continuity: 'Continuity',
};

const KIND_ICON: Record<AuditIssue['kind'], JSX.Element> = {
  character: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  timeline: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  setting: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  name: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
      <circle cx="11" cy="7" r="4" />
    </svg>
  ),
  tone: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  continuity: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
};

function formatRange(range: number[]): string {
  if (range.length === 0) return '—';
  if (range.length === 1) return `Chapter ${range[0]}`;
  const sorted = [...range].sort((a, b) => a - b);
  return 'Chapters ' + sorted.join(', ');
}

export default function AuditIssuesCard({ bookTitle, issues }: Props): JSX.Element {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const resolvedCount = issues.filter((i) => i.resolved).length;
  const total = issues.length;

  if (total === 0) {
    return (
      <div className="animate-fade-slide-up my-3 max-w-2xl">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10 px-4 py-3 flex items-center gap-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">
              Continuity audit · clean
            </div>
            <div className="text-[13px] text-ink dark:text-[#E8E8E8] leading-snug">
              No continuity issues found in <em>{bookTitle}</em>. Ready to polish.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-slide-up my-3 max-w-2xl">
      <div className="rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F]">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-amber-600 dark:text-amber-400">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary dark:text-[#888]">
              Continuity audit
            </div>
            <div className="text-[13px] text-ink dark:text-[#E8E8E8]">
              {resolvedCount} of {total} resolved
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-24 rounded-full bg-surface-tertiary dark:bg-[#1A1A1A] overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: total > 0 ? `${(resolvedCount / total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>
        <div className="divide-y divide-edge dark:divide-[#2A2A2A]">
          {issues.map((issue, i) => {
            const expanded = expandedId === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : i)}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 hover:bg-surface-secondary dark:hover:bg-[#0F0F0F] transition-colors"
                >
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                    issue.resolved
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  }`}>
                    {issue.resolved ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      KIND_ICON[issue.kind]
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary dark:text-[#888]">
                        {KIND_LABEL[issue.kind]}
                      </span>
                      <span className="text-[11px] text-ink-tertiary dark:text-[#666]">·</span>
                      <span className="text-[11px] text-ink-tertiary dark:text-[#888]">
                        {formatRange(issue.chapterRange)}
                      </span>
                      {issue.resolved && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 ml-1">
                          ✓ resolved
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-ink dark:text-[#E8E8E8] leading-snug truncate">
                      {issue.description}
                    </div>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className={`flex-shrink-0 text-ink-tertiary dark:text-[#666] transition-transform ${expanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {expanded && (
                  <div className="px-4 pb-3 pt-1 pl-12 space-y-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary dark:text-[#888] mb-1">
                        Issue
                      </div>
                      <div className="text-[12px] text-ink-secondary dark:text-[#B0B0B0] leading-relaxed">
                        {issue.description}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary dark:text-[#888] mb-1">
                        Suggested fix
                      </div>
                      <div className="text-[12px] text-ink-secondary dark:text-[#B0B0B0] leading-relaxed">
                        {issue.suggestedFix}
                      </div>
                    </div>
                    {!issue.resolved && (
                      <div className="text-[11px] italic text-ink-tertiary dark:text-[#666]">
                        The Line Editor will apply this fix on its next pass.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
