import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import WalletBalanceBadge from './WalletBalanceBadge';
import TopUpModal from './TopUpModal';
import mr8Logo from '../assets/mr8-logo.png';
import { formatUsd } from '../utils/formatUsd';

function NavItem({ to, label, icon, collapsed }: {
  to: string;
  label: string;
  icon: React.ReactNode;
  collapsed?: boolean;
}) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
        collapsed ? 'justify-center' : ''
      } ${
        active
          ? 'text-brand-orange font-semibold'
          : 'text-ink-secondary dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text'
      }`}
    >
      {icon}
      {!collapsed && label}
    </Link>
  );
}

function NavButton({ label, icon, onClick, collapsed }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 px-3 py-1.5 text-sm text-ink-secondary dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text transition-colors w-full text-left ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      {icon}
      {!collapsed && label}
    </button>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const location = useLocation();
  const isChat = location.pathname === '/chat';
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

  useEffect(() => {
    if (isChat) setCollapsed(true);
  }, [isChat]);

  const toggleCollapse = () => {
    setCollapsed((v) => {
      localStorage.setItem('sidebar-collapsed', String(!v));
      return !v;
    });
  };

  const sidebarWidth = collapsed ? 'w-14' : 'w-[220px]';

  const sidebarContent = (
    <>
      <div className={`p-3 border-b border-edge dark:border-dark-border ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} mb-2`}>
          <Link to="/landing" className="flex items-center gap-2" title="Mr8 — landing page">
            <img src={mr8Logo} alt="Mr8" width={24} height={24} className="flex-shrink-0 rounded-md" />
          </Link>
          {!collapsed && (
            <button onClick={toggleCollapse} className="p-1 text-ink-tertiary hover:text-ink dark:text-dark-text-tertiary dark:hover:text-dark-text transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 19l-7-7 7-7" /><path d="M18 19l-7-7 7-7" opacity=".4" />
              </svg>
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={toggleCollapse} className="p-1 text-ink-tertiary hover:text-ink dark:text-dark-text-tertiary dark:hover:text-dark-text transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 5l7 7-7 7" /><path d="M6 5l7 7-7 7" opacity=".4" />
            </svg>
          </button>
        )}
        {!collapsed && user && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-surface-tertiary dark:bg-dark-surface text-ink-secondary dark:text-dark-text-secondary text-[10px] font-medium flex items-center justify-center flex-shrink-0">
                {user.username[0].toUpperCase()}
              </div>
              <span className="text-xs text-ink-secondary dark:text-dark-text-secondary truncate">{user.username}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-green-soft dark:bg-brand-green/15 text-brand-green text-[11px] font-semibold">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" opacity="0.2" />
                  <path d="M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {formatUsd(user.creditsCents)}
              </div>
              <WalletBalanceBadge onClick={() => setShowTopUpModal(true)} />
            </div>
          </div>
        )}
        {collapsed && user && (
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-surface-tertiary dark:bg-dark-surface text-ink-secondary dark:text-dark-text-secondary text-[10px] font-medium flex items-center justify-center">
              {user.username[0].toUpperCase()}
            </div>
            <div
              className="text-[9px] font-semibold text-brand-green"
              title={`${formatUsd(user.creditsCents)} credit`}
            >
              {formatUsd(user.creditsCents)}
            </div>
            <WalletBalanceBadge collapsed onClick={() => setShowTopUpModal(true)} />
          </div>
        )}
        {!user && !collapsed && (
          <Link to="/login" className="text-sm text-accent dark:text-white hover:opacity-80">Sign in</Link>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {!collapsed && <div className="section-label">Main</div>}
        <NavButton
          label="New chat"
          collapsed={collapsed}
          onClick={() => {
            // Navigate then full-reload if already on /chat to guarantee a
            // truly fresh session (clears messages, workspace, computer, etc.).
            if (location.pathname === '/chat') {
              window.location.href = '/chat';
            } else {
              window.location.href = '/chat';
            }
            setMobileSidebarOpen(false);
          }}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          }
        />
        <NavItem to="/" label="Feed" collapsed={collapsed}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>}
        />
        <NavItem to="/chat" label="AI Chat" collapsed={collapsed}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
        />
        {user && (
          <NavItem to="/decks" label="AI Decks" collapsed={collapsed}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="18" x2="9" y2="10" /></svg>}
          />
        )}
        {user && (
          <>
            {!collapsed && <div className="section-label mt-3">Account</div>}
            <NavItem to={`/profile/${user.id}`} label="Profile" collapsed={collapsed}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
            />
          </>
        )}
      </nav>

      <div className={`border-t border-edge dark:border-dark-border p-2 space-y-0.5 ${collapsed ? 'flex flex-col items-center' : ''}`}>
        <button
          type="button"
          onClick={toggleTheme}
          title={dark ? 'Light mode' : 'Dark mode'}
          className={`flex items-center gap-2.5 px-3 py-1.5 text-sm text-ink-tertiary dark:text-dark-text-tertiary hover:text-ink dark:hover:text-dark-text transition-colors ${collapsed ? 'justify-center' : 'w-full text-left'}`}
        >
          {dark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          )}
          {!collapsed && (dark ? 'Light mode' : 'Dark mode')}
        </button>
        {user && (
          <button
            type="button"
            onClick={logout}
            title={collapsed ? 'Sign out' : undefined}
            className={`flex items-center gap-2.5 px-3 py-1.5 text-sm text-ink-tertiary dark:text-dark-text-tertiary hover:text-status-error transition-colors ${collapsed ? 'justify-center' : 'w-full text-left'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!collapsed && 'Sign out'}
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="h-screen flex bg-surface-secondary dark:bg-dark-bg">
      <aside className={`hidden md:flex ${sidebarWidth} flex-shrink-0 border-r border-edge dark:border-dark-border flex-col bg-white dark:bg-dark-bg transition-all duration-200`}>
        {sidebarContent}
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-white dark:bg-dark-bg border-b border-edge dark:border-dark-border flex items-center px-3 z-30">
        <button type="button" onClick={() => setMobileSidebarOpen(true)} className="p-1.5 text-ink-secondary dark:text-dark-text-secondary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link to="/" className="flex items-center gap-1.5 ml-2">
          <img src={mr8Logo} alt="Mr8" width={22} height={22} className="rounded-md" />
        </Link>
      </div>

      {mobileSidebarOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="md:hidden fixed inset-y-0 left-0 w-[220px] bg-white dark:bg-dark-bg border-r border-edge dark:border-dark-border flex flex-col z-50">
            {sidebarContent}
          </aside>
        </>
      )}

      <main className="flex-1 overflow-hidden md:overflow-y-auto pt-12 md:pt-0" id="main-content">
        <Outlet />
      </main>

      {showTopUpModal && (
        <TopUpModal onClose={() => setShowTopUpModal(false)} />
      )}
    </div>
  );
}
