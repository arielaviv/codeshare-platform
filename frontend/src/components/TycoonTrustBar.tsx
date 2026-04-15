interface TrustItem {
  icon: React.ReactNode;
  label: string;
}

const ITEMS: TrustItem[] = [
  {
    label: 'Launch for FREE.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </svg>
    ),
  },
  {
    label: 'Build in seconds.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.2" />
      </svg>
    ),
  },
  {
    label: 'Secured',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
  },
];

export default function TycoonTrustBar() {
  return (
    <div className="w-full max-w-4xl mx-auto mb-8 rounded-2xl overflow-hidden shadow-[0_10px_40px_rgba(11,136,0,0.18)]">
      {/* Green bar — Why Mr8? on the left, trust items on the right */}
      <div className="relative bg-brand-green text-white px-4 py-3 flex items-center justify-between gap-2 overflow-hidden">
        {/* Aurora glow */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 60% 120% at 10% 50%, rgba(255, 200, 80, 0.28), transparent 55%), radial-gradient(ellipse 50% 140% at 85% 50%, rgba(255, 230, 120, 0.22), transparent 60%)',
            animation: 'mr8-aurora 7s ease-in-out infinite alternate',
          }}
        />
        {/* Sheen */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 20%, transparent 40%)',
            animation: 'mr8-sheen 5s linear infinite',
          }}
        />

        <div className="relative flex items-center gap-1.5 pr-3 font-bold text-sm sm:text-base whitespace-nowrap">
          <span
            className="mr8-shiny-text"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #FFF5C2 0%, #FFD84D 40%, #FFFFFF 50%, #FFD84D 60%, #FFF5C2 100%)',
              backgroundSize: '220% 100%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'mr8-shiny 3.4s linear infinite',
            }}
          >
            Why Mr8?
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="#FFD84D"
            stroke="#FFD84D"
            strokeLinejoin="round"
            strokeWidth="1.5"
            style={{ filter: 'drop-shadow(0 0 6px rgba(255, 216, 77, 0.7))' }}
          >
            <polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9 12 2" />
          </svg>
        </div>

        <div className="relative flex items-center gap-1 flex-1 min-w-0 justify-end overflow-x-auto sm:overflow-visible subtle-scrollbar">
          {ITEMS.map((item, i) => (
            <div key={item.label} className="flex items-center">
              {i > 0 && <span className="h-4 w-px bg-white/25" aria-hidden />}
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1 text-xs sm:text-sm font-semibold whitespace-nowrap transition-transform active:scale-95 hover:drop-shadow-[0_0_6px_rgba(255,224,128,0.8)]"
              >
                <span className="text-[#FFE89A]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* White tip bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#141414] border-t border-brand-green/30">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand-green flex-shrink-0"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <p className="text-[11px] sm:text-xs text-ink dark:text-[#E8E8E8] leading-snug flex-1 min-w-0">
          <span className="font-bold text-brand-green">Mr8 - your general AI agent:</span>{' '}
          <span className="text-ink-secondary dark:text-[#A0A0A0]">
            Use daily or invite friends to get free rewards.
          </span>
        </p>
      </div>

      <style>{`
        @keyframes mr8-shiny {
          0% { background-position: 220% 0; }
          100% { background-position: -220% 0; }
        }
        @keyframes mr8-aurora {
          0% { transform: translateX(-4%) translateY(0); opacity: 0.55; }
          100% { transform: translateX(4%) translateY(-2px); opacity: 0.75; }
        }
        @keyframes mr8-sheen {
          0% { transform: translateX(-40%); }
          100% { transform: translateX(140%); }
        }
      `}</style>
    </div>
  );
}
