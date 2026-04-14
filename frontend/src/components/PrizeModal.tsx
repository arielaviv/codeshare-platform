import { useEffect, useState } from 'react';
import type { PrizeAward } from '../types';
import { formatUsd } from '../utils/formatUsd';
import mr8Logo from '../assets/mr8-logo.png';

interface Props {
  prize: PrizeAward;
  onClose: () => void;
}

export default function PrizeModal({ prize, onClose }: Props) {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setCounter(Math.round(prize.amountCents * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [prize.amountCents]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      style={{ animation: 'mr8-prize-overlay 0.25s ease-out' }}
    >
      <div
        className="relative bg-white dark:bg-[#141414] border border-brand-orange/40 rounded-2xl p-8 max-w-sm w-[92vw] text-center shadow-[0_24px_80px_rgba(251,119,1,0.35)]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'mr8-prize-pop 0.5s cubic-bezier(0.18, 1.2, 0.4, 1)' }}
      >
        <div className="flex items-center justify-center mb-4">
          <img
            src={mr8Logo}
            alt="Mr8"
            width={56}
            height={56}
            className="rounded-2xl shadow-[0_6px_22px_rgba(251,119,1,0.45)]"
            style={{ animation: 'mr8-prize-logo-spin 1.2s ease-out' }}
          />
        </div>

        <div className="text-xs uppercase tracking-[0.25em] text-brand-orange font-bold mb-2">
          Prize unlocked
        </div>
        <div
          className="text-6xl font-black text-ink dark:text-white tracking-tight mb-1"
          style={{ textShadow: '0 4px 24px rgba(251,119,1,0.45)' }}
        >
          +{formatUsd(counter)}
        </div>
        <div className="text-xs text-ink-tertiary dark:text-[#888] mb-4">
          added to your balance
        </div>

        {prize.reason && (
          <div className="text-sm text-ink-secondary dark:text-[#A0A0A0] italic px-3 py-2 bg-brand-orange-soft dark:bg-brand-orange/10 rounded-lg mb-5">
            "{prize.reason}"
          </div>
        )}

        <div className="text-[11px] text-ink-tertiary dark:text-[#666] mb-4">
          New balance:{' '}
          <span className="font-bold text-brand-green">
            {formatUsd(prize.newBalanceCents)}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm font-bold shadow-[0_4px_14px_rgba(251,119,1,0.45)] transition-colors"
        >
          Keep going
        </button>
      </div>

      <style>{`
        @keyframes mr8-prize-overlay {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes mr8-prize-pop {
          0% { transform: scale(0.7) translateY(20px); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes mr8-prize-logo-spin {
          0% { transform: rotate(-30deg) scale(0.5); opacity: 0; }
          50% { transform: rotate(10deg) scale(1.15); opacity: 1; }
          100% { transform: rotate(0deg) scale(1); }
        }
      `}</style>
    </div>
  );
}
