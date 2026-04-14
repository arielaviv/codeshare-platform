import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LandingHeader from '../components/LandingHeader';
import { formatUsd } from '../utils/formatUsd';

export default function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-ink dark:text-[#E8E8E8]">
      <LandingHeader />

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Profile header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-orange to-[#FF9A3C] text-white text-3xl font-bold flex items-center justify-center shadow-[0_8px_24px_rgba(251,119,1,0.4)]">
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{user.username}</h1>
            <div className="text-sm text-ink-tertiary dark:text-[#888]">{user.email}</div>
          </div>
        </div>

        {/* Balance card */}
        <div className="bg-gradient-to-br from-brand-orange-soft to-white dark:from-brand-orange/20 dark:to-[#141414] border border-brand-orange/30 rounded-2xl p-6 mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-ink-tertiary dark:text-[#888] mb-2">
            Balance
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-ink dark:text-white tracking-tight">
              {formatUsd(user.creditsCents)}
            </span>
            <span className="text-sm text-ink-tertiary dark:text-[#888]">credit</span>
          </div>
          {user.creditsCents < 100 && (
            <div className="mt-4 text-xs text-brand-orange bg-brand-orange-soft dark:bg-brand-orange/10 rounded-lg px-3 py-2 inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12" y2="16" />
              </svg>
              Low balance — upgrade or earn more by chatting with Mr8.
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Link
              to="/pricing"
              className="px-4 py-2 text-xs font-semibold bg-brand-orange hover:bg-brand-orange-hover text-white rounded-full shadow-[0_4px_14px_rgba(251,119,1,0.35)] transition-colors"
            >
              Top up
            </Link>
            <Link
              to="/chat"
              className="px-4 py-2 text-xs font-semibold border border-edge dark:border-[#2A2A2A] text-ink dark:text-white rounded-full hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
            >
              Start building
            </Link>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          <Link
            to="/chat"
            className="p-4 border border-edge dark:border-[#2A2A2A] rounded-xl hover:border-brand-orange/50 hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <div className="text-sm font-semibold mb-1">AI Code apps</div>
            <div className="text-xs text-ink-tertiary dark:text-[#888]">
              Build something new
            </div>
          </Link>
          <Link
            to="/decks"
            className="p-4 border border-edge dark:border-[#2A2A2A] rounded-xl hover:border-brand-orange/50 hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <div className="text-sm font-semibold mb-1">AI Decks</div>
            <div className="text-xs text-ink-tertiary dark:text-[#888]">
              Your generated slide decks
            </div>
          </Link>
          <Link
            to={`/profile/${user.id}`}
            className="p-4 border border-edge dark:border-[#2A2A2A] rounded-xl hover:border-brand-orange/50 hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <div className="text-sm font-semibold mb-1">Public profile</div>
            <div className="text-xs text-ink-tertiary dark:text-[#888]">
              Edit bio and avatar
            </div>
          </Link>
          <Link
            to="/pricing"
            className="p-4 border border-edge dark:border-[#2A2A2A] rounded-xl hover:border-brand-orange/50 hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <div className="text-sm font-semibold mb-1">Pricing plans</div>
            <div className="text-xs text-ink-tertiary dark:text-[#888]">
              Upgrade anytime
            </div>
          </Link>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-ink-tertiary dark:text-[#666] hover:text-status-error transition-colors"
        >
          Sign out
        </button>
      </main>
    </div>
  );
}
