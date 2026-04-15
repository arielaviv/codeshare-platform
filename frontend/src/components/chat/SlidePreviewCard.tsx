/**
 * Inline slide thumbnail in chat (Manus image #16). Click → opens the deck
 * editor at that exact slide via `/decks/:id?slide=<slideId>`.
 */
import { useNavigate } from 'react-router-dom';

interface Props {
  deckId: string;
  slideId: string;
  slideNumber: number;
  totalSlides: number;
  title: string;
  subtitle?: string;
  bulletCount?: number;
  slideType?: string;
}

export default function SlidePreviewCard({
  deckId,
  slideId,
  slideNumber,
  totalSlides,
  title,
  subtitle,
  bulletCount,
  slideType,
}: Props): JSX.Element {
  const navigate = useNavigate();

  const go = () => {
    navigate(`/decks/${deckId}?slide=${slideId}`);
  };

  return (
    <button
      type="button"
      onClick={go}
      className="w-full max-w-[480px] my-2 rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden text-left hover:border-ink-tertiary dark:hover:border-[#444] hover:shadow-md transition-all group"
    >
      {/* Header strip */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F]">
        <DeckIcon />
        <span className="flex-1 truncate text-[13px] font-semibold text-ink dark:text-[#E8E8E8]">
          {title}
        </span>
        <span className="text-[11px] tabular-nums text-ink-tertiary dark:text-[#666] flex-shrink-0">
          {slideNumber} / {totalSlides}
        </span>
      </div>

      {/* Thumbnail body — scaled-down visual approximation */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-surface-secondary to-white dark:from-[#141414] dark:to-[#0A0A0A] p-5 flex flex-col justify-center overflow-hidden">
        <div className="text-ink dark:text-[#E8E8E8] text-[18px] font-bold leading-snug line-clamp-3">
          {title}
        </div>
        {subtitle && (
          <div className="mt-1.5 text-ink-secondary dark:text-[#A0A0A0] text-[11px] line-clamp-2">
            {subtitle}
          </div>
        )}
        {bulletCount && bulletCount > 0 && (
          <div className="mt-3 space-y-1.5">
            {Array.from({ length: Math.min(4, bulletCount) }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-ink-tertiary dark:bg-[#555]" />
                <span className="flex-1 h-1.5 rounded-full bg-surface-tertiary dark:bg-[#2A2A2A]" style={{ width: `${60 + Math.random() * 30}%` }} />
              </div>
            ))}
          </div>
        )}
        {slideType && (
          <div className="absolute top-2 right-2 text-[9px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] bg-white dark:bg-[#0A0A0A] px-1.5 py-0.5 rounded border border-edge dark:border-[#2A2A2A]">
            {slideType}
          </div>
        )}
        {/* Bottom accent bar — matches the deck's navy-ish theme */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#0A2540] dark:bg-brand-orange" />
      </div>

      <div className="flex items-center justify-end gap-1 px-3 py-1.5 text-[11px] text-ink-tertiary dark:text-[#666] group-hover:text-brand-orange transition-colors">
        Open in editor
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </button>
  );
}

function DeckIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-ink-tertiary dark:text-[#888]">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9" y1="18" x2="9" y2="22" />
      <line x1="15" y1="18" x2="15" y2="22" />
    </svg>
  );
}
