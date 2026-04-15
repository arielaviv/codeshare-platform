import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useAuth } from '../contexts/AuthContext';
import { welcomeSpinApi } from '../services/welcomeSpinApi';
import SlotMachine from '../components/SlotMachine';
import type { SpinOutcome } from '../components/SlotMachine';
import mr8Logo from '../assets/mr8-logo.png';

type Stage =
  | 'confetti-hold'   // confetti falls, slot machine not yet mounted
  | 'spinning'        // slot machine animating through both spins
  | 'price-drop'      // "Usually $16/mo → FREE" counter countdown
  | 'awaiting-claim'  // CTA visible
  | 'error';

const CONFETTI_HOLD_MS = 2200;
const PRICE_DROP_MS = 1600;
// The "list price" we display as the crossed-out anchor — matches Base44 Starter tier.
const LIST_PRICE_CENTS = 1600;

interface ClaimResult {
  spins: [SpinOutcome, SpinOutcome];
  awardedCents: number;
}

function fireOpeningConfetti() {
  const duration = 2000;
  const end = Date.now() + duration;
  const colors = ['#FB7701', '#FFB800', '#FF9A3C', '#0B8800'];

  confetti({
    particleCount: 180,
    spread: 110,
    startVelocity: 45,
    origin: { y: 0.5 },
    colors,
  });

  const frame = () => {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

function fireWinConfetti() {
  const colors = ['#FB7701', '#FFB800', '#FFFFFF', '#FF9A3C', '#0B8800'];
  confetti({
    particleCount: 240,
    spread: 130,
    startVelocity: 55,
    origin: { y: 0.55 },
    colors,
    scalar: 1.2,
  });
  setTimeout(() => {
    confetti({ particleCount: 100, angle: 60, spread: 80, origin: { x: 0.12, y: 0.65 }, colors });
    confetti({ particleCount: 100, angle: 120, spread: 80, origin: { x: 0.88, y: 0.65 }, colors });
  }, 220);
}

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export default function WelcomeSpinPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt;

  const [stage, setStage] = useState<Stage>('confetti-hold');
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [priceCents, setPriceCents] = useState<number>(LIST_PRICE_CENTS);
  const claimInFlight = useRef(false);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const goToChat = () => {
    navigate('/chat', {
      state: initialPrompt ? { initialPrompt } : undefined,
      replace: true,
    });
  };

  // Already claimed before this session → skip
  useEffect(() => {
    if (user?.hasClaimedWelcomeBonus) {
      goToChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.hasClaimedWelcomeBonus]);

  // On mount: fire confetti, call claim.  Guarded against double-mount (StrictMode).
  useEffect(() => {
    if (user?.hasClaimedWelcomeBonus) return;
    if (claimInFlight.current) return;
    claimInFlight.current = true;

    if (!reducedMotion) fireOpeningConfetti();

    welcomeSpinApi
      .claim()
      .then((data) => {
        setResult({ spins: data.spins, awardedCents: data.awardedCents });
      })
      .catch((err: { response?: { status?: number; data?: { message?: string } } }) => {
        if (err.response?.status === 409) {
          // Already claimed — still play the animation for visual consistency,
          // but with awardedCents=0 (the real balance already reflects the first claim).
          setResult({
            spins: [
              { symbols: ['gold', 'gold', 'feather'], isWin: false, label: 'ANOTHER TURN' },
              { symbols: ['gold', 'gold', 'gold'], isWin: true, label: 'WINNER!' },
            ],
            awardedCents: 0,
          });
          return;
        }
        setErrorMsg(err.response?.data?.message || 'Could not start your welcome spin.');
        setStage('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start the slot once both the confetti hold has elapsed AND the claim has returned.
  useEffect(() => {
    if (stage !== 'confetti-hold' || !result) return;
    const t = setTimeout(() => setStage('spinning'), CONFETTI_HOLD_MS);
    return () => clearTimeout(t);
  }, [stage, result]);

  // Price-drop animation: tween LIST_PRICE_CENTS → 0
  useEffect(() => {
    if (stage !== 'price-drop') return;
    const start = performance.now();
    const startVal = LIST_PRICE_CENTS;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / PRICE_DROP_MS);
      const eased = 1 - Math.pow(1 - t, 2.5);
      const v = Math.round(startVal * (1 - eased));
      setPriceCents(v);
      if (t < 1) requestAnimationFrame(step);
      else {
        setTimeout(() => setStage('awaiting-claim'), 500);
      }
    };
    requestAnimationFrame(step);
  }, [stage]);

  // Esc to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClaim();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWinReveal = () => {
    if (!reducedMotion) fireWinConfetti();
  };

  const handleSlotDismiss = () => {
    setStage('price-drop');
  };

  const handleClaim = async () => {
    await refreshUser();
    goToChat();
  };

  const amountAwarded = result?.awardedCents ?? 0;

  return (
    <div className="h-screen w-full overflow-hidden relative flex flex-col items-center bg-gradient-to-b from-brand-orange-soft via-white to-white dark:from-[#0A0A14] dark:via-[#0A0A0A] dark:to-[#0A0A0A] text-ink dark:text-white px-4 py-5">
      {/* Soft radial accent */}
      <div
        className="fixed inset-0 pointer-events-none opacity-50 dark:opacity-60"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(251,119,1,0.22), transparent 55%)',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 mb-3">
        <img
          src={mr8Logo}
          alt="Mr8"
          width={40}
          height={40}
          className="rounded-xl shadow-[0_6px_22px_rgba(251,119,1,0.35)]"
        />
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Welcome to Mr8
        </h1>
      </div>
      <p className="relative z-10 text-xs md:text-sm text-ink-secondary dark:text-[#A0A0A0] mb-3 text-center max-w-md">
        {stage === 'awaiting-claim' || stage === 'price-drop'
          ? 'Your welcome credit is ready.'
          : 'Your first pull — on the house.'}
      </p>

      {/* Slot area */}
      <div className="relative z-10 flex-1 w-full flex items-center justify-center min-h-0">
        {stage === 'confetti-hold' && (
          <div className="flex items-center gap-2 text-brand-orange text-sm">
            <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" style={{ animationDelay: '0.15s' }} />
            <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" style={{ animationDelay: '0.3s' }} />
          </div>
        )}

        {(stage === 'spinning' || stage === 'price-drop' || stage === 'awaiting-claim') && result && (
          <div className="w-full max-w-[540px]">
            <SlotMachine
              outcomes={result.spins}
              awardedCents={amountAwarded > 0 ? amountAwarded : 500}
              reduced={reducedMotion}
              onWinReveal={handleWinReveal}
              onDismiss={handleSlotDismiss}
            />
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center max-w-sm">
            <div className="text-sm text-status-error mb-4">{errorMsg}</div>
            <button
              type="button"
              onClick={handleClaim}
              className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white font-semibold text-sm"
            >
              Continue anyway
            </button>
          </div>
        )}
      </div>

      {/* Price-drop banner — Temu-style "usually $X → FREE" counter */}
      {(stage === 'price-drop' || stage === 'awaiting-claim') && (
        <div
          className="relative z-10 mt-2 mb-3 flex flex-col items-center"
          style={{ animation: 'mr8-price-drop-in 0.4s ease-out' }}
        >
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-tertiary dark:text-[#666] mb-1">
            Mr8 Starter · Usually
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl md:text-3xl text-ink-tertiary dark:text-[#888] line-through font-semibold">
              {formatDollars(LIST_PRICE_CENTS)}
              <span className="text-sm font-normal">/mo</span>
            </span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-orange">
              <path d="M5 12h14m-7-7l7 7-7 7" />
            </svg>
            <span
              className={`text-3xl md:text-4xl font-black tracking-tight ${
                priceCents === 0 ? 'text-brand-green' : 'text-ink dark:text-white'
              }`}
              style={priceCents === 0 ? { textShadow: '0 2px 18px rgba(11,136,0,0.4)' } : undefined}
            >
              {priceCents === 0 ? 'FREE' : formatDollars(priceCents)}
            </span>
          </div>
          <div className="text-[11px] text-ink-tertiary dark:text-[#666] mt-1">for you, today</div>
        </div>
      )}

      {/* CTA */}
      {stage === 'awaiting-claim' && (
        <button
          type="button"
          onClick={handleClaim}
          className="relative z-10 px-8 py-3.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm md:text-base font-bold tracking-wide transition-colors flex items-center gap-2 shadow-[0_8px_28px_rgba(251,119,1,0.5)]"
          style={{ animation: 'mr8-cta-rise 0.5s ease-out both' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14m-7-7l7 7-7 7" />
          </svg>
          Claim & start building
        </button>
      )}

      {stage !== 'error' && (
        <div className="relative z-10 mt-2 text-[10px] text-ink-tertiary dark:text-[#555]">
          Press Esc to skip
        </div>
      )}

      <style>{`
        @keyframes mr8-cta-rise {
          0% { transform: translateY(16px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes mr8-price-drop-in {
          0% { transform: translateY(10px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
