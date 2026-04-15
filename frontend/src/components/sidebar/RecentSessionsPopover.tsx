/**
 * Sidebar "recent sessions" popover, Manus image #1 — hover-open list of
 * the user's recent ChatSessions. Click a row → opens that session.
 *
 * - Trigger: icon-only button rendered in AppLayout sidebar (between New
 *   chat and Feed).
 * - Open: onMouseEnter (no click required). Closes on mouse leave with
 *   200ms grace so users can move into the popover.
 * - Each row: skill icon + title (truncated) + optional unread red badge.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionsApi, type SessionSummary } from '../../services/sessionsApi';

interface Props {
  collapsed?: boolean;
}

export default function RecentSessionsPopover({ collapsed }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheTimeRef = useRef<number>(0);

  const handleEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
    // Refresh if cache is older than 60s.
    if (Date.now() - cacheTimeRef.current > 60_000) {
      setLoading(true);
      sessionsApi
        .list(20)
        .then(({ sessions: fresh }) => {
          setSessions(fresh);
          cacheTimeRef.current = Date.now();
        })
        .catch(() => setSessions([]))
        .finally(() => setLoading(false));
    }
  };

  const handleLeave = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 200);
  };

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        title="Recent chats"
        aria-label="Recent chats"
        className={`flex items-center gap-2.5 px-3 py-1.5 text-sm w-full text-left text-ink-secondary dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text transition-colors ${collapsed ? 'justify-center' : ''}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M9 6h11" />
          <path d="M9 12h11" />
          <path d="M9 18h11" />
          <path d="M5 6l-1 1 2 2" />
          <path d="M5 12l-1 1 2 2" />
          <path d="M5 18l-1 1 2 2" />
        </svg>
        {!collapsed && <span>Recent</span>}
      </button>

      {open && (
        <div
          className="absolute z-50 left-full top-0 ml-2 w-[280px] max-h-[60vh] overflow-y-auto bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg shadow-xl py-2"
          role="menu"
        >
          {loading && (
            <div className="px-3 py-4 text-xs text-ink-tertiary dark:text-[#666] text-center">
              Loading…
            </div>
          )}
          {!loading && sessions && sessions.length === 0 && (
            <div className="px-3 py-4 text-xs text-ink-tertiary dark:text-[#666] text-center">
              No recent chats
              <div className="mt-2">
                <Link
                  to="/chat"
                  className="inline-block px-2 py-0.5 rounded text-brand-orange hover:underline"
                >
                  Start a new chat
                </Link>
              </div>
            </div>
          )}
          {!loading && sessions && sessions.length > 0 && (
            <ul className="space-y-0">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/chat?session=${s.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
                  >
                    <SkillIcon skill={s.skill} />
                    <span className="flex-1 truncate text-ink dark:text-[#E8E8E8]">
                      {s.title || 'Untitled'}
                    </span>
                    {s.unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-status-error text-white text-[10px] font-semibold flex items-center justify-center">
                        {s.unreadCount > 9 ? '9+' : s.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SkillIcon({ skill }: { skill: SessionSummary['skill'] }): JSX.Element {
  const c = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0 text-ink-tertiary dark:text-[#888]',
  };
  if (skill === 'slides') {
    // presentation icon
    return <svg {...c}><rect x="3" y="4" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="18" x2="9" y2="22" /><line x1="15" y1="18" x2="15" y2="22" /></svg>;
  }
  if (skill === 'sheet') {
    return <svg {...c}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>;
  }
  if (skill === 'design') {
    return <svg {...c}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
  }
  if (skill === 'apps') {
    return <svg {...c}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>;
  }
  // unknown / mixed
  return <svg {...c}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="0.5" fill="currentColor" /></svg>;
}
