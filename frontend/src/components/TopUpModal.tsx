import { useState } from 'react';
import { formatUsd } from '../utils/formatUsd';
import { walletApi, notifyWalletChanged } from '../services/walletApi';

interface TopUpModalProps {
  onClose: () => void;
  onSuccess?: (newBalanceCents: number) => void;
}

const PRESETS: { label: string; cents: number }[] = [
  { label: '$1', cents: 100 },
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
];

export default function TopUpModal({ onClose, onSuccess }: TopUpModalProps) {
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTopUp = async (amountCents: number) => {
    setSubmitting(amountCents);
    setError(null);
    try {
      const res = await walletApi.topUp(amountCents);
      notifyWalletChanged();
      onSuccess?.(res.balanceCents);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Top-up failed. Try again.';
      setError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-dark-bg border border-edge dark:border-dark-border rounded-xl w-[360px] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">
            Top up wallet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-tertiary dark:text-dark-text-tertiary hover:text-ink dark:hover:text-dark-text transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-ink-secondary dark:text-dark-text-secondary mb-4">
          Mock top-up — no card required. Real payment coming soon.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.cents}
              type="button"
              disabled={submitting !== null}
              onClick={() => handleTopUp(p.cents)}
              className="flex flex-col items-center justify-center px-3 py-3 rounded-lg bg-brand-orange/10 text-brand-orange font-semibold text-sm hover:bg-brand-orange/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting === p.cents ? (
                <span className="text-xs">Adding…</span>
              ) : (
                <>
                  <span>{p.label}</span>
                  <span className="text-[10px] font-normal opacity-70">
                    + {formatUsd(p.cents)}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 text-xs text-status-error">{error}</div>
        )}
      </div>
    </div>
  );
}
