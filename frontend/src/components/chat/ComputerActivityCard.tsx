/**
 * Inline thumbnail card embedded in chat assistant messages — anchors the
 * Mr8's Computer modal. Matches Manus image #25.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ┌────────┐ Mr8's Computer                    │
 *   │ │ thumb  │ Mr8 is using <Tool>               │
 *   │ │ 88×64  │ <breadcrumb URL/path>             │
 *   │ └────────┘                                   │
 *   └──────────────────────────────────────────────┘
 *      Hover: tooltip "View Mr8's Computer"
 *      Click: opens ComputerModal at this entry
 */
import { useComputer } from '../../contexts/ComputerContext';
import { useComputerModal } from '../../contexts/ComputerModalContext';
import type { TimelineEntry } from '../computer/types';

interface Props {
  timelineEntryId: string;
  /** Fallback label if the entry hasn't loaded yet (rare race) */
  fallbackLabel?: string;
}

export default function ComputerActivityCard({
  timelineEntryId,
  fallbackLabel,
}: Props): JSX.Element {
  const { state } = useComputer();
  const { openModal } = useComputerModal();
  const entry = state.timeline.find((e) => e.id === timelineEntryId);

  const tool = describeTool(entry, fallbackLabel);
  const breadcrumb = describeBreadcrumb(entry);

  return (
    <div className="relative group inline-block">
      <button
        type="button"
        onClick={() => openModal(timelineEntryId)}
        className="flex items-center gap-3 w-[360px] max-w-full p-2.5 pr-4 bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg hover:border-ink-tertiary dark:hover:border-[#444] hover:shadow-md transition-all text-left"
      >
        <Thumbnail entry={entry} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink dark:text-[#E8E8E8] mb-0.5">
            Mr8's Computer
          </div>
          <div className="flex items-center gap-1 text-[12px] text-ink-secondary dark:text-[#A0A0A0] truncate">
            <ToolIconSmall kind={tool.iconKind} />
            <span className="truncate">
              Mr8 is using <span className="font-medium text-ink dark:text-[#E8E8E8]">{tool.label}</span>
            </span>
          </div>
          {breadcrumb && (
            <div className="text-[11px] font-mono text-ink-tertiary dark:text-[#666] truncate mt-0.5">
              {breadcrumb}
            </div>
          )}
        </div>
      </button>

      {/* Hover tooltip */}
      <div className="absolute -top-9 left-3 px-2.5 py-1 bg-ink dark:bg-white text-white dark:text-ink text-[11px] rounded whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
        View Mr8's Computer
        <span className="absolute top-full left-4 -mt-px border-4 border-transparent border-t-ink dark:border-t-white" />
      </div>
    </div>
  );
}

function Thumbnail({ entry }: { entry: TimelineEntry | undefined }): JSX.Element {
  // Browser → screenshot if available, else placeholder
  if (entry?.kind === 'browser' && entry.browserScreenshot) {
    return (
      <img
        src={`data:image/png;base64,${entry.browserScreenshot}`}
        alt=""
        className="w-[88px] h-[64px] object-cover rounded border border-edge dark:border-[#2A2A2A] flex-shrink-0"
      />
    );
  }
  // Media → image preview
  if (entry?.kind === 'media' && entry.mediaImageUrl) {
    return (
      <img
        src={entry.mediaImageUrl}
        alt=""
        className="w-[88px] h-[64px] object-cover rounded border border-edge dark:border-[#2A2A2A] flex-shrink-0"
      />
    );
  }
  // Loading / no preview yet → gradient placeholder with tool icon
  return (
    <div className="w-[88px] h-[64px] rounded border border-edge dark:border-[#2A2A2A] bg-gradient-to-br from-surface-secondary to-surface-tertiary dark:from-[#1A1A1A] dark:to-[#0F0F0F] flex items-center justify-center flex-shrink-0">
      {entry?.status === 'running' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin text-brand-orange">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <ToolIconSmall kind={describeTool(entry).iconKind} />
      )}
    </div>
  );
}

interface ToolDescriptor {
  label: string;
  iconKind: 'browser' | 'python' | 'editor' | 'media' | 'search';
}

function describeTool(entry: TimelineEntry | undefined, fallback?: string): ToolDescriptor {
  if (!entry) return { label: fallback ?? 'Computer', iconKind: 'browser' };
  if (entry.kind === 'browser') {
    const lastAction = entry.browserActions?.[entry.browserActions.length - 1];
    if (lastAction?.action === 'search') return { label: 'Search', iconKind: 'search' };
    return { label: 'Browser', iconKind: 'browser' };
  }
  if (entry.kind === 'python') return { label: 'Python', iconKind: 'python' };
  if (entry.kind === 'editor') return { label: 'Editor', iconKind: 'editor' };
  if (entry.kind === 'media') return { label: 'Media viewer', iconKind: 'media' };
  return { label: fallback ?? 'Computer', iconKind: 'browser' };
}

function describeBreadcrumb(entry: TimelineEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.kind === 'browser') {
    if (entry.browserUrl) return entry.browserUrl;
    const lastAction = entry.browserActions?.[entry.browserActions.length - 1];
    if (lastAction?.action === 'search' && lastAction.target) return `"${lastAction.target}"`;
    return null;
  }
  if (entry.kind === 'python') return entry.description ?? null;
  if (entry.kind === 'editor') return entry.writePath ?? null;
  if (entry.kind === 'media') return entry.mediaPath ?? null;
  return null;
}

function ToolIconSmall({ kind }: { kind: ToolDescriptor['iconKind'] }): JSX.Element {
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (kind === 'search') return <svg {...common}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
  if (kind === 'browser') return <svg {...common}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>;
  if (kind === 'python') return <svg {...common}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
  if (kind === 'editor') return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
}
