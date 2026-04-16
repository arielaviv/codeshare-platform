/**
 * Recent sessions modal — click-to-open list of the user's recent
 * ChatSessions, rendered as a centered overlay so it's visible regardless
 * of where the sidebar sits or what content overlaps it.
 *
 * - Trigger: icon-only button rendered in AppLayout sidebar.
 * - Open: onClick. Closes on backdrop click, X button, or Esc.
 * - Each row: skill icon + title (truncated) + optional unread red badge.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionsApi, type SessionSummary } from '../../services/sessionsApi';

interface Props {
  collapsed?: boolean;
}

export default function RecentSessionsPopover({ collapsed }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    setLoading(true);
    sessionsApi
      .list(20)
      .then(({ sessions: fresh }) => setSessions(fresh))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Recent chats"
        aria-label="Recent chats"
        className={`flex items-center gap-3 px-3 py-2 text-[15px] w-full text-left text-ink-secondary dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text transition-colors ${collapsed ? 'justify-center' : ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
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
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-[10vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-label="Recent chats"
        >
          <div className="w-[min(560px,95vw)] max-h-[70vh] bg-white dark:bg-[#0F0F0F] rounded-2xl shadow-2xl border border-edge dark:border-[#2A2A2A] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-edge dark:border-[#2A2A2A]">
              <h2 className="text-base font-semibold text-ink dark:text-[#E8E8E8]">Recent chats</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {loading && (
                <div className="px-5 py-8 text-sm text-ink-tertiary dark:text-[#666] text-center">
                  Loading…
                </div>
              )}
              {!loading && sessions && sessions.length === 0 && (
                <div className="px-5 py-8 text-sm text-ink-tertiary dark:text-[#666] text-center">
                  No recent chats
                  <div className="mt-3">
                    <Link
                      to="/chat"
                      onClick={() => setOpen(false)}
                      className="inline-block px-3 py-1 rounded text-brand-orange hover:underline"
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
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
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
          </div>
        </div>
      )}
    </>
  );
}

function SkillIcon({ skill }: { skill: SessionSummary['skill'] }): JSX.Element {
  const c = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0 text-ink-tertiary dark:text-[#888]',
  };
  if (skill === 'slides') {
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
  return <svg {...c}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="0.5" fill="currentColor" /></svg>;
}
