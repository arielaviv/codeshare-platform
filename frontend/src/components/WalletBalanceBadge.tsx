import { useEffect, useState } from 'react';
import { formatUsd } from '../utils/formatUsd';
import { walletApi, WALLET_CHANGED_EVENT } from '../services/walletApi';

interface WalletBalanceBadgeProps {
  onClick?: () => void;
  collapsed?: boolean;
}

export default function WalletBalanceBadge({ onClick, collapsed }: WalletBalanceBadgeProps) {
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      setLoading(true);
      try {
        const snap = await walletApi.get();
        if (!cancelled) setBalanceCents(snap.balanceCents);
      } catch {
        if (!cancelled) setBalanceCents(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refresh();
    window.addEventListener(WALLET_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(WALLET_CHANGED_EVENT, refresh);
    };
  }, []);

  const label =
    balanceCents === null ? (loading ? '…' : '—') : formatUsd(balanceCents);

  const shared =
    'inline-flex items-center gap-1 rounded-full bg-brand-orange/10 text-brand-orange font-semibold transition-colors hover:bg-brand-orange/20';

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Wallet ${label} — tap to top up`}
        className={`${shared} px-1.5 py-0.5 text-[9px]`}
      >
        <WalletIcon size={10} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Wallet balance — click to top up"
      className={`${shared} px-2 py-0.5 text-[11px]`}
    >
      <WalletIcon size={10} />
      {label}
    </button>
  );
}

function WalletIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M16 12h3" />
    </svg>
  );
}
