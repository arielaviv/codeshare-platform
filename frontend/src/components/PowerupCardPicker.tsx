import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { PowerupGiftedEvent } from '../types/agent-events';
import type { FeatureTier } from '../types/blueprint';
import mr8Logo from '../assets/mr8-logo.png';

interface Props {
  event: PowerupGiftedEvent;
  onComplete: () => void;
}

const TIER_LABEL: Record<FeatureTier, string> = {
  polish: 'Polish',
  brains: 'Brains',
  power: 'Power',
};

const TIER_ACCENT: Record<FeatureTier, string> = {
  polish: '#FFB800',
  brains: '#FB7701',
  power: '#0B8800',
};

const REVEAL_HOLD_MS = 2400;
const CARD_COUNT = 3;

function fireRevealConfetti(accent: string) {
  confetti({
    particleCount: 180,
    spread: 110,
    startVelocity: 45,
    origin: { y: 0.55 },
    colors: [accent, '#FB7701', '#FFB800', '#FFFFFF'],
    scalar: 1.1,
  });
  setTimeout(() => {
    confetti({ particleCount: 70, angle: 60, spread: 70, origin: { x: 0.15, y: 0.7 } });
    confetti({ particleCount: 70, angle: 120, spread: 70, origin: { x: 0.85, y: 0.7 } });
  }, 180);
}

export default function PowerupCardPicker({ event, onComplete }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accent = TIER_ACCENT[event.tier];
  const tierLabel = TIER_LABEL[event.tier];

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    fireRevealConfetti(accent);
    timerRef.current = setTimeout(onComplete, REVEAL_HOLD_MS);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md px-4"
      style={{ animation: 'mr8-powerup-overlay 0.25s ease-out' }}
    >
      <div className="text-xs uppercase tracking-[0.3em] text-brand-orange font-bold mb-2">
        Mr8 found something extra
      </div>
      <div className="text-2xl md:text-3xl font-black text-white tracking-tight mb-1 text-center">
        Pick your power-up
      </div>
      <div className="text-sm text-[#A0A0A0] mb-6 text-center max-w-sm">
        {event.reason || 'One free feature on the house. Choose a card.'}
      </div>

      <div className="flex gap-4 md:gap-6">
        {Array.from({ length: CARD_COUNT }).map((_, idx) => {
          const isPicked = picked === idx;
          const isRevealed = picked !== null;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handlePick(idx)}
              disabled={isRevealed}
              aria-label={`power-up card ${idx + 1}`}
              className="relative w-24 h-36 md:w-32 md:h-48 rounded-2xl cursor-pointer disabled:cursor-default focus:outline-none focus:ring-2 focus:ring-brand-orange"
              style={{
                perspective: '800px',
              }}
            >
              <div
                className="absolute inset-0 transition-transform duration-500"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isPicked ? 'rotateY(180deg)' : undefined,
                }}
              >
                {/* back */}
                <div
                  className="absolute inset-0 rounded-2xl border border-brand-orange/40 shadow-[0_12px_40px_rgba(251,119,1,0.35)] flex items-center justify-center"
                  style={{
                    background:
                      'linear-gradient(135deg, #1A1A20 0%, #0C0C10 100%)',
                    backfaceVisibility: 'hidden',
                    opacity: isRevealed && !isPicked ? 0.35 : 1,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  <img
                    src={mr8Logo}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded-xl opacity-80"
                    draggable={false}
                  />
                </div>
                {/* front */}
                <div
                  className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center p-3 text-center"
                  style={{
                    background: `linear-gradient(160deg, ${accent} 0%, #0C0C10 120%)`,
                    transform: 'rotateY(180deg)',
                    backfaceVisibility: 'hidden',
                    boxShadow: `0 18px 60px ${accent}55`,
                  }}
                >
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/80 font-bold mb-1">
                    {tierLabel}
                  </div>
                  <div className="text-sm md:text-base font-black text-white leading-tight">
                    {event.featureName}
                  </div>
                  <div className="text-[10px] text-white/80 mt-2">FREE</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <button
          type="button"
          onClick={onComplete}
          className="mt-8 px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm font-bold"
        >
          Keep going
        </button>
      )}

      <style>{`
        @keyframes mr8-powerup-overlay {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
