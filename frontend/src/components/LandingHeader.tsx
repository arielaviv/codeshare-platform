import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ThumbsUp, Gem } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import mr8Logo from '../assets/mr8-logo.png';
import { formatUsd } from '../utils/formatUsd';

interface ProductTile {
  label: string;
  desc: string;
  to: string;
  disabled?: boolean;
  icon: React.ReactNode;
}

const PRODUCTS: ProductTile[] = [
  {
    label: 'AI Code Apps',
    desc: 'Build full-stack web apps from a prompt',
    to: '/chat',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    label: 'AI Decks',
    desc: 'Gartner-style slide decks in seconds',
    to: '/decks',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="9" y1="18" x2="9" y2="10" />
      </svg>
    ),
  },
  {
    label: 'AI Spreadsheets',
    desc: 'Coming soon — AI-native sheets',
    to: '#',
    disabled: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
  },
];

export default function LandingHeader() {
  const { user } = useAuth();
  const [productOpen, setProductOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const openProduct = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setProductOpen(true);
  };
  const scheduleCloseProduct = () => {
    closeTimer.current = setTimeout(() => setProductOpen(false), 150);
  };

  return (
    <nav className="relative z-30 bg-[#0059A4] border-b border-black/10 py-4 px-6">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        {/* Left cluster: logo + nav — logo anchors to the left edge of the max-w-4xl
            box, aligning vertically with the "Why Mr8?" text in the trust bar below. */}
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 mr-2 sm:mr-4">
            <img src={mr8Logo} alt="Mr8" width={36} height={36} className="rounded-xl" />
          </Link>
          <div className="hidden md:flex items-center gap-2">
        <div
          onMouseEnter={openProduct}
          onMouseLeave={scheduleCloseProduct}
          className="relative"
        >
          <button
            type="button"
            className="px-4 py-2 text-sm text-white hover:text-brand-orange transition-colors flex items-center gap-1.5 font-medium"
          >
            <ThumbsUp size={14} strokeWidth={2.2} />
            Features
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${productOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {productOpen && (
            <div
              onMouseEnter={openProduct}
              onMouseLeave={scheduleCloseProduct}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[520px] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-2xl shadow-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2"
              style={{ animation: 'mr8-dropdown 0.18s ease-out' }}
            >
              {PRODUCTS.map((p) =>
                p.disabled ? (
                  <div
                    key={p.label}
                    className="p-3 rounded-xl text-left opacity-50 cursor-not-allowed"
                  >
                    <div className="w-9 h-9 rounded-lg bg-brand-orange-soft dark:bg-brand-orange/10 text-brand-orange flex items-center justify-center mb-2">
                      {p.icon}
                    </div>
                    <div className="font-semibold text-sm text-ink dark:text-white">{p.label}</div>
                    <div className="text-xs text-ink-tertiary dark:text-[#888] mt-0.5">{p.desc}</div>
                  </div>
                ) : (
                  <Link
                    key={p.label}
                    to={p.to}
                    className="p-3 rounded-xl text-left hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-brand-orange-soft dark:bg-brand-orange/15 text-brand-orange flex items-center justify-center mb-2">
                      {p.icon}
                    </div>
                    <div className="font-semibold text-sm text-ink dark:text-white">{p.label}</div>
                    <div className="text-xs text-ink-tertiary dark:text-[#888] mt-0.5">{p.desc}</div>
                  </Link>
                )
              )}
            </div>
          )}
        </div>

        <Link
          to="/pricing"
          className="px-4 py-2 text-sm text-white hover:text-brand-orange transition-colors font-medium flex items-center gap-1.5"
        >
          <Gem size={14} strokeWidth={2.2} />
          Pricing
        </Link>
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
        {user ? (
          <Link
            to="/account"
            className="flex items-center gap-2 group"
            title={`${user.username} — ${formatUsd(user.creditsCents)}`}
          >
            <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-white/15 text-white text-xs font-semibold backdrop-blur-sm">
              {formatUsd(user.creditsCents)}
            </span>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-orange to-[#FF9A3C] text-white text-sm font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(251,119,1,0.45)] ring-2 ring-white/20 group-hover:scale-105 transition-transform">
              {user.username[0].toUpperCase()}
            </div>
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="text-sm text-white/80 hover:text-white transition-colors px-3 py-2 hidden sm:inline"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="text-sm bg-brand-orange hover:bg-brand-orange-hover text-white px-4 py-2 rounded-full font-semibold shadow-[0_4px_14px_rgba(251,119,1,0.45)] transition-colors"
            >
              Get started
            </Link>
          </>
        )}
        </div>
      </div>

      <style>{`
        @keyframes mr8-dropdown {
          0% { opacity: 0; transform: translate(-50%, -4px); }
          100% { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </nav>
  );
}
