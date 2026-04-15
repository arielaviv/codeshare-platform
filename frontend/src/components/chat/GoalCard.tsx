/**
 * Manus-style toggleable goal card with action chips inside.
 *
 *   ○ Research Palantir's platforms                          ⌃
 *      ┌────────────────────────────────────────────────────┐
 *      │ 🔍  Research Palantir's core platforms…            │  ← chip
 *      ├────────────────────────────────────────────────────┤
 *      │ 🧭  Access Palantir's official website…           │
 *      └────────────────────────────────────────────────────┘
 *      Research revealed Palantir's platforms—Foundry, Gotham…
 *
 * - Title row: status icon + bold title + chevron toggle.
 * - Chips: pill-shaped, lucide-style icons, click → opens computer modal.
 * - Summary text below: appears once `complete_goal` has been called.
 */
import { useState } from 'react';
import { useComputerModal } from '../../contexts/ComputerModalContext';

export interface GoalAction {
  id: string;
  /** Used to choose the icon. */
  kind: 'search' | 'browse' | 'extract' | 'python' | 'image' | 'write' | 'delete';
  label: string;
  /** Optional bridge to ComputerContext for click → modal */
  timelineEntryId?: string;
  status: 'running' | 'done' | 'error';
}

interface Props {
  title: string;
  status: 'running' | 'done' | 'error';
  actions: GoalAction[];
  summary?: string;
  /** Defaults: expanded while running, collapsed once done. */
  defaultExpanded?: boolean;
}

export default function GoalCard({
  title,
  status,
  actions,
  summary,
  defaultExpanded,
}: Props): JSX.Element {
  const [expandedManual, setExpandedManual] = useState<boolean | null>(null);
  const { openModal } = useComputerModal();

  const expanded =
    expandedManual ?? (defaultExpanded ?? (status === 'running'));

  return (
    <div className="my-3">
      {/* Title row */}
      <button
        type="button"
        onClick={() => setExpandedManual(!expanded)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <GoalStatusIcon status={status} />
        <span className="text-[15px] font-semibold text-ink dark:text-[#E8E8E8] group-hover:text-brand-orange transition-colors">
          {title}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-ink-tertiary dark:text-[#666] transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Action chips */}
      {expanded && actions.length > 0 && (
        <div className="mt-2.5 ml-6 space-y-1.5">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => action.timelineEntryId && openModal(action.timelineEntryId)}
              disabled={!action.timelineEntryId}
              className="flex items-center gap-2 w-full px-3 py-2 bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-full text-[13px] text-left text-ink-secondary dark:text-[#A0A0A0] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] hover:border-ink-tertiary dark:hover:border-[#444] disabled:cursor-default disabled:hover:bg-surface-secondary disabled:hover:border-edge dark:disabled:hover:bg-[#141414] dark:disabled:hover:border-[#2A2A2A] transition-colors"
            >
              <ActionIcon kind={action.kind} />
              <span className="flex-1 truncate">{action.label}</span>
              {action.status === 'running' && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin text-brand-orange flex-shrink-0">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Summary prose */}
      {summary && (
        <div className="mt-3 ml-6 text-[14px] leading-relaxed text-ink-secondary dark:text-[#D4D4D4]">
          {summary}
        </div>
      )}
    </div>
  );
}

function GoalStatusIcon({ status }: { status: 'running' | 'done' | 'error' }): JSX.Element {
  if (status === 'done') {
    return (
      <span className="w-5 h-5 rounded-full bg-status-live/15 flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-status-live">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="w-5 h-5 rounded-full bg-status-error/15 flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-status-error">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </span>
    );
  }
  // running
  return (
    <span className="w-5 h-5 rounded-full border-2 border-brand-orange flex items-center justify-center flex-shrink-0">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="animate-spin text-brand-orange">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </span>
  );
}

function ActionIcon({ kind }: { kind: GoalAction['kind'] }): JSX.Element {
  const c = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0 text-ink-tertiary dark:text-[#888]',
  };
  if (kind === 'search') {
    return <svg {...c}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
  }
  if (kind === 'browse' || kind === 'extract') {
    // compass icon (Manus uses this for site visits)
    return <svg {...c}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>;
  }
  if (kind === 'python') {
    return <svg {...c}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
  }
  if (kind === 'image') {
    return <svg {...c}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
  }
  if (kind === 'write') {
    return <svg {...c}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  }
  // delete
  return <svg {...c}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>;
}
