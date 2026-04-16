/**
 * Mr8's Computer — full-screen modal overlay (Manus-exact, image #9).
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Mr8's Computer                       [↗] [◧] | [×]    │
 *  │  <icon> Mr8 is using <Tool> · <breadcrumb URL/path>     │
 *  ├─────────────────────────────────────────────────────────┤
 *  │                                                         │
 *  │      Live viewport (browser/python/editor/media)        │
 *  │                                                         │
 *  │            [▷ Jump to live] (floating pill)             │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  ⏮ ⏭ ━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ●live      │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  ✓ Task progress                          N/M ⌃         │
 *  │   ✓ task 1 (collapsed by default if all done)          │
 *  └─────────────────────────────────────────────────────────┘
 *
 * Top-right cluster (Manus order, separated by subtle | divider):
 *   ↗  Use Mr8's Computer  (takeover - pins iframe so user can drive)
 *   ◧  Side view           (close modal, expand right artifact panel)
 *   ×  Close
 */
import { useState, useMemo } from 'react';
import { useComputer } from '../../contexts/ComputerContext';
import { useComputerModal } from '../../contexts/ComputerModalContext';
import { BrowserView } from './BrowserView';
import { EditorView } from './EditorView';
import { PythonView } from './PythonView';
import { MediaView } from './MediaView';
import { IdleView } from './IdleView';
import { TerminalView } from './TerminalView';
import type { TimelineEntry, ComputeTask } from './types';

export function ComputerModal(): JSX.Element | null {
  const { open, closeModal } = useComputerModal();
  const { state, setActive, jumpToLive, setMode } = useComputer();
  const { timeline, tasks, panel } = state;
  const [taskDrawerExpanded, setTaskDrawerExpanded] = useState(true);

  const activeEntry = useMemo<TimelineEntry | undefined>(() => {
    if (panel.activeIndex < 0 || panel.activeIndex >= timeline.length) {
      return timeline[timeline.length - 1];
    }
    return timeline[panel.activeIndex];
  }, [panel.activeIndex, timeline]);

  if (!open) return null;

  const total = timeline.length;
  const currentIdx =
    panel.activeIndex < 0 || panel.activeIndex >= total ? total - 1 : panel.activeIndex;
  const isLive = currentIdx >= total - 1;

  const handlePrev = () => {
    if (currentIdx > 0) setActive(currentIdx - 1, { isLive: false });
  };
  const handleNext = () => {
    if (currentIdx < total - 1) setActive(currentIdx + 1, { isLive: currentIdx + 1 === total - 1 });
  };
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    setActive(idx, { isLive: idx === total - 1 });
  };
  const handleJumpToLive = () => jumpToLive();
  const handleSideView = () => {
    // Side view: close modal, the right artifact panel covers the same data.
    closeModal();
  };
  const handleTakeover = () => {
    // Takeover: switch to the takeover host (existing TakeoverHost in App.tsx).
    setMode('takeover');
    closeModal();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
      role="dialog"
      aria-label="Mr8's Computer"
    >
      <div className="w-[min(1024px,90vw)] h-[min(720px,85vh)] bg-white dark:bg-[#0A0A0A] rounded-xl shadow-2xl border border-edge dark:border-[#2A2A2A] flex flex-col overflow-hidden">
        <ModalHeader
          activeEntry={activeEntry}
          onTakeover={handleTakeover}
          onSideView={handleSideView}
          onClose={closeModal}
        />

        <div className="flex-1 min-h-0 relative bg-surface-secondary dark:bg-[#0F0F0F]">
          {activeEntry ? (
            <ViewSwitch entry={activeEntry} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-ink-tertiary dark:text-[#666]">
              Mr8 hasn't opened anything yet.
            </div>
          )}

          {!isLive && total > 0 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
              <button
                type="button"
                onClick={handleJumpToLive}
                className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-full text-xs font-medium text-ink dark:text-[#E8E8E8] shadow-lg hover:shadow-xl hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-brand-orange">
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
                Jump to live
              </button>
            </div>
          )}
        </div>

        {total > 1 && (
          <PlaybackStrip
            currentIdx={currentIdx}
            total={total}
            isLive={isLive}
            onPrev={handlePrev}
            onNext={handleNext}
            onScrub={handleScrub}
          />
        )}

        <TaskProgressDrawer
          tasks={tasks}
          expanded={taskDrawerExpanded}
          onToggle={() => setTaskDrawerExpanded((v) => !v)}
        />
      </div>
    </div>
  );
}

function ModalHeader({
  activeEntry,
  onTakeover,
  onSideView,
  onClose,
}: {
  activeEntry: TimelineEntry | undefined;
  onTakeover: () => void;
  onSideView: () => void;
  onClose: () => void;
}): JSX.Element {
  const tool = useMemo(() => describeTool(activeEntry), [activeEntry]);
  const breadcrumb = useMemo(() => describeBreadcrumb(activeEntry), [activeEntry]);

  return (
    <div className="px-5 py-3 border-b border-edge dark:border-[#1A1A1A] bg-white dark:bg-[#0F0F0F]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-ink dark:text-[#E8E8E8] mb-0.5">
            Mr8's Computer
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-ink-secondary dark:text-[#A0A0A0] truncate">
            {tool && (
              <>
                <ToolIcon kind={tool.iconKind} />
                <span>Mr8 is using {tool.label}</span>
              </>
            )}
            {breadcrumb && (
              <>
                <span className="text-ink-tertiary dark:text-[#555]">·</span>
                <span className="font-mono text-[11px] truncate">{breadcrumb}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 -mt-0.5">
          <IconButton
            label="Use Mr8's Computer"
            onClick={onTakeover}
          >
            {/* up-right arrow icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </IconButton>
          <IconButton label="Side view" onClick={onSideView}>
            {/* split-pane icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="1.5" />
              <line x1="14" y1="4" x2="14" y2="20" />
            </svg>
          </IconButton>
          <span className="w-px h-4 bg-edge dark:bg-[#2A2A2A] mx-0.5 self-center opacity-60" />
          <IconButton label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-7 h-7 flex items-center justify-center rounded text-ink-secondary dark:text-[#888] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] hover:text-ink dark:hover:text-[#E8E8E8] transition-colors"
    >
      {children}
    </button>
  );
}

interface ToolDescriptor {
  label: string;
  iconKind: 'browser' | 'python' | 'editor' | 'media' | 'search';
}

function describeTool(entry: TimelineEntry | undefined): ToolDescriptor | null {
  if (!entry) return null;
  if (entry.kind === 'browser') {
    const lastAction = entry.browserActions?.[entry.browserActions.length - 1];
    if (lastAction?.action === 'search') return { label: 'Search', iconKind: 'search' };
    return { label: 'Browser', iconKind: 'browser' };
  }
  if (entry.kind === 'python') return { label: 'Python', iconKind: 'python' };
  if (entry.kind === 'editor') return { label: 'Editor', iconKind: 'editor' };
  if (entry.kind === 'media') return { label: 'Media viewer', iconKind: 'media' };
  if (entry.kind === 'idle') return { label: 'Idle', iconKind: 'browser' };
  if (entry.kind === 'terminal') return { label: 'Terminal', iconKind: 'python' };
  return null;
}

/**
 * Map a host filesystem path to a virtual sandbox path so the user sees
 * `/home/user/output/foo.png` (Manus-style) instead of leaking the
 * server's local Windows/Linux path. We only ever expose the basename.
 */
export function virtualizeMediaPath(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Already a public uploads URL — strip to filename.
  if (raw.startsWith('/uploads/')) {
    const file = raw.split('/').pop() ?? raw;
    return `/home/user/output/${file}`;
  }
  // Host fs path — last segment is the filename.
  const file = raw.split(/[\\/]/).pop();
  if (!file) return raw;
  return `/home/user/output/${file}`;
}

function describeBreadcrumb(entry: TimelineEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.kind === 'browser') {
    if (entry.browserUrl) return `Browsing ${entry.browserUrl}`;
    const lastAction = entry.browserActions?.[entry.browserActions.length - 1];
    if (lastAction?.action === 'search' && lastAction.target) {
      return `Searching ${lastAction.target}`;
    }
    return 'Loading…';
  }
  if (entry.kind === 'python') return entry.description ?? 'Running script';
  if (entry.kind === 'editor') return entry.writePath ?? 'Editing';
  if (entry.kind === 'media') {
    const display = virtualizeMediaPath(entry.mediaPath);
    if (display) return `Generating image ${display}`;
    return entry.mediaPrompt ? `"${entry.mediaPrompt}"` : 'Generating image';
  }
  return null;
}

function ToolIcon({ kind }: { kind: ToolDescriptor['iconKind'] }): JSX.Element {
  const common = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'search') {
    return <svg {...common}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
  }
  if (kind === 'browser') {
    return <svg {...common}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>;
  }
  if (kind === 'python') {
    return <svg {...common}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
  }
  if (kind === 'editor') {
    return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  }
  // media
  return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
}

function ViewSwitch({ entry }: { entry: TimelineEntry }): JSX.Element {
  if (entry.kind === 'browser') return <BrowserView entry={entry} />;
  if (entry.kind === 'python') return <PythonView entry={entry} />;
  if (entry.kind === 'editor') return <EditorView entry={entry} />;
  if (entry.kind === 'media') return <MediaView entry={entry} />;
  if (entry.kind === 'idle') return <IdleView entry={entry} />;
  if (entry.kind === 'terminal') return <TerminalView entry={entry} />;
  return <div className="p-6 text-sm text-ink-tertiary dark:text-[#666]">Unknown view kind</div>;
}

function PlaybackStrip({
  currentIdx,
  total,
  isLive,
  onPrev,
  onNext,
  onScrub,
}: {
  currentIdx: number;
  total: number;
  isLive: boolean;
  onPrev: () => void;
  onNext: () => void;
  onScrub: (e: React.ChangeEvent<HTMLInputElement>) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-edge dark:border-[#1A1A1A] bg-white dark:bg-[#0F0F0F]">
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIdx <= 0}
        className="w-7 h-7 flex items-center justify-center rounded text-ink-secondary dark:text-[#888] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Previous"
        aria-label="Previous"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="19 20 9 12 19 4 19 20" />
          <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={currentIdx >= total - 1}
        className="w-7 h-7 flex items-center justify-center rounded text-ink-secondary dark:text-[#888] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Next"
        aria-label="Next"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={currentIdx}
        onChange={onScrub}
        className="flex-1 h-1 accent-brand-orange cursor-pointer"
        aria-label="Scrub timeline"
      />
      <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-ink-tertiary dark:text-[#666]">
        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-status-live' : 'bg-ink-tertiary dark:bg-[#555]'}`} />
        {isLive ? 'live' : `${currentIdx + 1}/${total}`}
      </div>
    </div>
  );
}

function TaskProgressDrawer({
  tasks,
  expanded,
  onToggle,
}: {
  tasks: ComputeTask[];
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element | null {
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === 'complete').length;
  const total = tasks.length;
  const allDone = done === total;
  const overallStatus = allDone ? 'done' : tasks.some((t) => t.status === 'error') ? 'error' : 'running';
  const showExpanded = expanded || !allDone;

  return (
    <div className="border-t border-edge dark:border-[#1A1A1A] bg-white dark:bg-[#0F0F0F]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
      >
        <StatusIcon status={overallStatus} />
        <span className="text-sm font-medium text-ink dark:text-[#E8E8E8] flex-1">
          Task progress
        </span>
        <span className="text-[11px] tabular-nums text-ink-tertiary dark:text-[#666]">
          {done}/{total}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-ink-tertiary dark:text-[#666] transition-transform ${showExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {showExpanded && (
        <ul className="px-4 pb-3 space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-[13px]">
              <span className="mt-0.5">
                <StatusIcon status={t.status === 'complete' ? 'done' : t.status === 'error' ? 'error' : t.status === 'running' ? 'running' : 'pending'} />
              </span>
              <span className={t.status === 'complete' ? 'text-ink-secondary dark:text-[#A0A0A0]' : 'text-ink dark:text-[#E8E8E8]'}>
                {t.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: 'pending' | 'running' | 'done' | 'error' }): JSX.Element {
  if (status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-status-live">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === 'running') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin text-brand-orange">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-status-error">
        <circle cx="12" cy="12" r="9" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-tertiary dark:text-[#555]">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
