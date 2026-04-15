import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useAuth } from '../contexts/AuthContext';
import { streamAnonBuild } from '../services/anonBuildStream';
import SlotMachine from '../components/SlotMachine';
import type { SpinOutcome } from '../components/SlotMachine';
import ClaimRegisterModal from '../components/ClaimRegisterModal';
import mr8Logo from '../assets/mr8-logo.png';
import { formatUsd } from '../utils/formatUsd';

const ANON_OUTCOMES: [SpinOutcome, SpinOutcome] = [
  { symbols: ['gold', 'gold', 'feather'], isWin: false, label: 'ANOTHER TURN' },
  { symbols: ['gold', 'gold', 'gold'], isWin: true, label: 'WINNER!' },
];

const PRIZE_CENTS = 500; // matches WELCOME_BONUS_CENTS server-side
const SLOT_FALLBACK_DELAY_MS = 3000;

interface BuildFile {
  path: string;
  size: number;
}

type Stage =
  | 'building'    // agent streaming
  | 'slot'        // slot machine open over the build
  | 'claim'       // register-to-claim modal
  | 'error'       // terminal error state
  | 'rate-limited';

function fireSlotOpeningConfetti() {
  const colors = ['#FB7701', '#FFB800', '#FF9A3C'];
  confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 }, colors, scalar: 1.0 });
}

export default function AnonBuildPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt || '';

  const [prompt, setPrompt] = useState(initialPrompt);
  const [committedPrompt, setCommittedPrompt] = useState(initialPrompt);
  const [stage, setStage] = useState<Stage>('building');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<BuildFile[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [buildId, setBuildId] = useState<string | null>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [chipPulse, setChipPulse] = useState(false);
  const streamStartedRef = useRef(false);
  const slotTriggeredRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const buildIdRef = useRef<string | null>(null);
  const chipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    buildIdRef.current = buildId;
  }, [buildId]);

  // If a logged-in user reaches /build, bounce them straight to /chat — they don't need
  // the anon journey; any prompt they typed carries forward through the chat flow.
  useEffect(() => {
    if (user) {
      navigate('/chat', {
        state: committedPrompt ? { initialPrompt: committedPrompt } : undefined,
        replace: true,
      });
    }
  }, [user, committedPrompt, navigate]);

  const triggerSlot = useCallback(() => {
    if (slotTriggeredRef.current) return;
    slotTriggeredRef.current = true;
    fireSlotOpeningConfetti();
    setStage('slot');
  }, []);

  const startStream = useCallback((p: string) => {
    if (!p.trim() || streamStartedRef.current) return;
    streamStartedRef.current = true;
    setStage('building');
    setText('');
    setFiles([]);
    setErrorMsg('');

    // Fallback: trigger the slot even if the agent has no file writes yet
    const fallback = setTimeout(triggerSlot, SLOT_FALLBACK_DELAY_MS);

    abortRef.current = streamAnonBuild(p, {
      onTextDelta(content) {
        setText((prev) => prev + content);
      },
      onToolCall() {
        // reserved for future UI hint
      },
      onFileWrite(path, content) {
        setFiles((prev) => {
          if (prev.some((f) => f.path === path)) {
            return prev.map((f) =>
              f.path === path ? { path, size: content.length } : f
            );
          }
          return [...prev, { path, size: content.length }];
        });
        triggerSlot();
      },
      onDone({ buildId: id }) {
        setBuildId(id);
        clearTimeout(fallback);
        // Slot is likely already up; if not (no file writes happened), force it now.
        triggerSlot();
      },
      onError(message) {
        clearTimeout(fallback);
        if (message.toLowerCase().includes('free preview')) {
          setStage('rate-limited');
        } else {
          setErrorMsg(message);
          setStage('error');
        }
      },
    });
  }, [triggerSlot]);

  useEffect(() => {
    if (user) return;
    if (initialPrompt.trim()) {
      setCommittedPrompt(initialPrompt);
      startStream(initialPrompt);
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualStart = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length < 3) return;
    setCommittedPrompt(trimmed);
    streamStartedRef.current = false;
    slotTriggeredRef.current = false;
    startStream(trimmed);
  };

  // Fires at the slot's 'win' phase — tween the header chip in lockstep with the machine counter.
  const handleSlotWinReveal = useCallback(() => {
    const start = performance.now();
    const duration = 1100;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setBalanceCents(Math.round(PRIZE_CENTS * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  // Fires after the $5 has flown into the header chip. Always advance — the
  // claim modal handles the (common) case where the agent stream hasn't
  // finished yet and buildId is still null.
  const handleSlotDismiss = useCallback(() => {
    setChipPulse(true);
    setTimeout(() => setChipPulse(false), 600);
    setStage('claim');
  }, []);

  const getChipRect = useCallback(() => {
    return chipRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const showPromptInput = !committedPrompt && stage === 'building';
  const showStreamingUI = committedPrompt && (stage === 'building' || stage === 'slot' || stage === 'claim');

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] text-ink dark:text-[#E8E8E8] relative overflow-hidden">
      {/* Warm brand glow */}
      <div
        className="fixed inset-x-0 top-0 h-[60vh] pointer-events-none opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 55% 55% at 50% 0%, rgba(251, 119, 1, 0.18), transparent 70%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 px-6 py-4 flex items-center gap-3 border-b border-edge dark:border-[#1A1A1A]">
        <img src={mr8Logo} alt="Mr8" width={32} height={32} className="rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-ink-tertiary dark:text-[#666] uppercase tracking-wider">
            Mr8 is building
          </div>
          {committedPrompt && (
            <div className="text-sm font-medium truncate text-ink dark:text-[#E8E8E8]">
              {committedPrompt}
            </div>
          )}
        </div>
        {committedPrompt && (
          <div
            ref={chipRef}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-green-soft dark:bg-brand-green/15 text-brand-green text-xs font-semibold shadow-[0_2px_10px_rgba(11,136,0,0.2)]"
            style={{
              animation: chipPulse ? 'mr8-chip-pulse 0.5s ease-out' : undefined,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" opacity="0.2" />
              <path d="M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {formatUsd(balanceCents)}
          </div>
        )}
        {stage === 'building' && (
          <div className="flex items-center gap-2 text-[11px] text-brand-orange font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" style={{ animationDelay: '0.15s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" style={{ animationDelay: '0.3s' }} />
          </div>
        )}
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {showPromptInput && (
          <form onSubmit={handleManualStart} className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold mb-2">Try Mr8 — free preview</h1>
              <p className="text-sm text-ink-secondary dark:text-[#A0A0A0]">
                Describe something small. Get a working demo in seconds.
              </p>
            </div>
            <div className="bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.06)] px-4 py-3 mb-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={300}
                placeholder="e.g. a counter app with increment, decrement, reset"
                rows={2}
                className="w-full bg-transparent text-sm text-ink dark:text-[#E8E8E8] placeholder:text-ink-tertiary dark:placeholder:text-[#555] focus:outline-none resize-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm font-semibold shadow-[0_4px_14px_rgba(251,119,1,0.35)] transition-colors flex items-center justify-center gap-2"
            >
              Start building
            </button>
          </form>
        )}

        {showStreamingUI && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-6">
            {/* Assistant stream */}
            <div className="bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-2xl p-5 min-h-[320px] shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              {text ? (
                <pre className="whitespace-pre-wrap text-sm text-ink-secondary dark:text-[#C8C8C8] leading-relaxed font-sans">
                  {text}
                  {stage === 'building' && (
                    <span className="inline-block w-2 h-4 bg-brand-orange animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-tertiary dark:text-[#666]">
                  <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
                  Thinking…
                </div>
              )}
            </div>

            {/* Files column */}
            <aside className="bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-3">
                Files
              </div>
              <ul className="space-y-1.5">
                {files.length === 0 && (
                  <li className="text-xs text-ink-tertiary dark:text-[#555] italic">
                    Waiting for Mr8…
                  </li>
                )}
                {files.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-center justify-between gap-2 text-xs animate-fade-slide-up"
                  >
                    <span className="flex items-center gap-1.5 min-w-0 flex-1 text-ink dark:text-[#E8E8E8]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-brand-green flex-shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="truncate font-mono">{f.path}</span>
                    </span>
                    <span className="text-ink-tertiary dark:text-[#666] flex-shrink-0">
                      {f.size}B
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}

        {stage === 'error' && (
          <div className="max-w-md mx-auto mt-8 text-center">
            <div className="text-lg text-status-error mb-4">{errorMsg}</div>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm font-semibold"
            >
              Back to landing
            </button>
          </div>
        )}

        {stage === 'rate-limited' && (
          <div className="max-w-md mx-auto mt-8 text-center">
            <div className="text-3xl mb-3">🎰</div>
            <h2 className="text-xl font-bold mb-2">You used your free preview</h2>
            <p className="text-sm text-ink-secondary dark:text-[#A0A0A0] mb-5">
              Sign up to keep building — you'll also get your $5 welcome credit.
            </p>
            <button
              type="button"
              onClick={() => navigate('/register', { replace: true })}
              className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm font-semibold shadow-[0_4px_14px_rgba(251,119,1,0.35)]"
            >
              Sign up for free
            </button>
          </div>
        )}
      </main>

      {stage === 'slot' && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          style={{ animation: 'mr8-slot-overlay 0.25s ease-out' }}
        >
          <div className="w-full max-w-[540px]">
            <div className="text-center mb-3 text-white">
              <div className="text-[11px] uppercase tracking-[0.25em] text-brand-orange font-bold mb-1">
                Wait — You're a winner!
              </div>
              <div className="text-sm text-white/80">Spin to unlock your $5 build credit</div>
            </div>
            <SlotMachine
              outcomes={ANON_OUTCOMES}
              awardedCents={PRIZE_CENTS}
              onWinReveal={handleSlotWinReveal}
              onDismiss={handleSlotDismiss}
              flyoutTarget={getChipRect}
            />
          </div>
        </div>
      )}

      {stage === 'claim' && (
        <ClaimRegisterModal buildId={buildId} prompt={committedPrompt} prizeCents={PRIZE_CENTS} />
      )}

      <style>{`
        @keyframes mr8-slot-overlay { 0% { opacity: 0 } 100% { opacity: 1 } }
        @keyframes mr8-chip-pulse {
          0% { transform: scale(1); box-shadow: 0 2px 10px rgba(11,136,0,0.2); }
          40% { transform: scale(1.35); box-shadow: 0 6px 24px rgba(11,136,0,0.6); }
          100% { transform: scale(1); box-shadow: 0 2px 10px rgba(11,136,0,0.2); }
        }
      `}</style>
    </div>
  );
}
