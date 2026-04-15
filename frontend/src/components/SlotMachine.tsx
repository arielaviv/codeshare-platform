import { useEffect, useRef, useState } from 'react';
import slotGold from '../assets/slot/slot_gold.png';
import slotFeather from '../assets/slot/slot_feather.png';
import slotSeven from '../assets/slot/slot_seven.png';
import slotTickets from '../assets/slot/slot_tickets.png';
import machineEmpty from '../assets/slot/SlotMachineEmpty.png';
import knobImg from '../assets/slot/knob1.png';
import knobGlow from '../assets/slot/KnobGlowHL.png';

// Artwork is from https://github.com/Team-on-abandoned/FortuneWheel
// Used with permission from the author. No LICENSE file in upstream repo;
// recommend adding MIT/CC0 to document permanently.

export type SlotSymbol = 'gold' | 'feather' | 'seven' | 'tickets';

export interface SpinOutcome {
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  isWin: boolean;
  label: string;
}

const SYMBOL_IMG: Record<SlotSymbol, string> = {
  gold: slotGold,
  feather: slotFeather,
  seven: slotSeven,
  tickets: slotTickets,
};

// Repeating 4-symbol pattern, 5 cycles = 20 tiles tall.
const BASE: SlotSymbol[] = ['gold', 'feather', 'seven', 'tickets'];
const STRIP: SlotSymbol[] = Array.from({ length: 5 }, () => BASE).flat();

// The final visible tile per reel lives in the last cycle, so the reel
// visually spins almost the full strip length before stopping.
// cycle 4 → index base 16.  gold=+0, feather=+1, seven=+2, tickets=+3
const STOP_INDEX: Record<SlotSymbol, number> = {
  gold: 16,
  feather: 17,
  seven: 18,
  tickets: 19,
};

// Machine artwork native aspect ratio (SlotMachineEmpty.png)
const MACHINE_W = 687;
const MACHINE_H = 363;

// Reel cutout positions match the silver-frame inner cutouts in the
// machine art (SlotMachineEmpty.png, 687×363) so the dark reel fills
// sit inside the decorative frames without overflowing.
const REEL_POSITIONS = [
  { left: '8.3%', top: '11.6%', width: '13.5%', height: '63.4%' },
  { left: '26.2%', top: '11.6%', width: '13.5%', height: '63.4%' },
  { left: '44.4%', top: '11.6%', width: '13.5%', height: '63.4%' },
];

// Timing (ms)
const REEL_STOP_MS = [1800, 2300, 2900];
const NEAR_MISS_HOLD_MS = 1500;
const WIN_TAIL_MS = 400;
const COUNTER_DURATION_MS = 1100;
const FLYOUT_MS = 650;

// Drag-to-pull lever
const PULL_MAX_PX = 80;
const PULL_TRIGGER_PX = 38;

interface Props {
  outcomes: [SpinOutcome, SpinOutcome];
  awardedCents: number;
  reduced?: boolean;
  onWinReveal: () => void;
  onDismiss?: () => void;
  flyoutTarget?: () => DOMRect | null;
}

type Phase =
  | 'idle1'
  | 'spin1'
  | 'near-miss'
  | 'idle2'
  | 'spin2'
  | 'win'
  | 'flyout'
  | 'done';

export default function SlotMachine({
  outcomes,
  awardedCents,
  reduced,
  onWinReveal,
  onDismiss,
  flyoutTarget,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle1');
  const [counter, setCounter] = useState(0);
  const [flyoutTransform, setFlyoutTransform] = useState<string>('');
  const [pullY, setPullY] = useState(0);
  const [pullReleasing, setPullReleasing] = useState(false);
  const reelRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];
  const winBlockRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);

  // Keep the latest callbacks in refs so scheduled timers don't fire stale closures.
  const onWinRevealRef = useRef(onWinReveal);
  const onDismissRef = useRef(onDismiss);
  const flyoutTargetRef = useRef(flyoutTarget);
  useEffect(() => {
    onWinRevealRef.current = onWinReveal;
    onDismissRef.current = onDismiss;
    flyoutTargetRef.current = flyoutTarget;
  }, [onWinReveal, onDismiss, flyoutTarget]);

  const applySpin = (symbols: [SlotSymbol, SlotSymbol, SlotSymbol]) => {
    symbols.forEach((sym, i) => {
      const el = reelRefs[i].current;
      if (!el) return;
      const targetIdx = STOP_INDEX[sym];
      const reelHeight = el.parentElement?.clientHeight || 0;
      el.style.transition = `transform ${REEL_STOP_MS[i]}ms cubic-bezier(0.14, 0.82, 0.32, 1)`;
      el.style.transform = `translateY(${-targetIdx * reelHeight}px)`;
    });
  };

  const resetReels = () => {
    reelRefs.forEach((r) => {
      const el = r.current;
      if (!el) return;
      el.style.transition = 'none';
      el.style.transform = 'translateY(0px)';
    });
  };

  // Reduced motion: skip straight to done, fire both callbacks.
  useEffect(() => {
    if (!reduced) return;
    setPhase('done');
    setCounter(awardedCents);
    onWinRevealRef.current?.();
    onDismissRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Phase effects — each schedules only its own timers.
  useEffect(() => {
    if (phase !== 'spin1') return;
    requestAnimationFrame(() => applySpin(outcomes[0].symbols));
    const t = setTimeout(() => setPhase('near-miss'), REEL_STOP_MS[2] + 150);
    return () => clearTimeout(t);
  }, [phase, outcomes]);

  useEffect(() => {
    if (phase !== 'near-miss') return;
    const t = setTimeout(() => setPhase('idle2'), NEAR_MISS_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'spin2') return;
    resetReels();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => applySpin(outcomes[1].symbols))
    );
    const t = setTimeout(() => setPhase('win'), REEL_STOP_MS[2] + WIN_TAIL_MS);
    return () => clearTimeout(t);
  }, [phase, outcomes]);

  useEffect(() => {
    if (phase !== 'win') return;
    onWinRevealRef.current?.();

    let raf = 0;
    const start = performance.now();
    const target = awardedCents;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNTER_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setCounter(Math.round(target * eased));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setPhase('flyout');
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, awardedCents]);

  useEffect(() => {
    if (phase !== 'flyout') return;

    const block = winBlockRef.current;
    let dx: number;
    let dy: number;
    const target = flyoutTargetRef.current?.() ?? null;
    if (target && block) {
      const src = block.getBoundingClientRect();
      dx = target.left + target.width / 2 - (src.left + src.width / 2);
      dy = target.top + target.height / 2 - (src.top + src.height / 2);
    } else {
      // Fallback trajectory — up and to the right.
      dx = window.innerWidth * 0.4;
      dy = -window.innerHeight * 0.4;
    }
    setFlyoutTransform(`translate(${dx}px, ${dy}px) scale(0.35)`);

    const t = setTimeout(() => {
      setPhase('done');
      onDismissRef.current?.();
    }, FLYOUT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const triggerSpin = () => {
    if (phase === 'idle1') {
      setPhase('spin1');
    } else if (phase === 'idle2') {
      setPhase('spin2');
    }
  };

  const endDrag = (triggered: boolean) => {
    dragStartYRef.current = null;
    dragPointerIdRef.current = null;
    setPullReleasing(true);
    setPullY(0);
    // Clear the "releasing" flag after the snap-back transition finishes.
    setTimeout(() => setPullReleasing(false), triggered ? 120 : 220);
  };

  const handleKnobPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'idle1' && phase !== 'idle2') return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragStartYRef.current = e.clientY;
    dragPointerIdRef.current = e.pointerId;
    setPullReleasing(false);
    setPullY(0);
  };

  const handleKnobPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    if (dragPointerIdRef.current !== e.pointerId) return;
    const raw = e.clientY - dragStartYRef.current;
    // Only allow pulling downward; soft-clamp past PULL_MAX_PX with resistance.
    const clamped =
      raw <= 0
        ? 0
        : raw <= PULL_MAX_PX
          ? raw
          : PULL_MAX_PX + (raw - PULL_MAX_PX) * 0.25;
    setPullY(clamped);
  };

  const handleKnobPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    if (dragPointerIdRef.current !== e.pointerId) return;
    const pulled = pullY >= PULL_TRIGGER_PX;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    endDrag(pulled);
    if (pulled) triggerSpin();
  };

  const handleKnobPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPointerIdRef.current !== e.pointerId) return;
    endDrag(false);
  };

  const isSpinning = phase === 'spin1' || phase === 'spin2';
  const isIdle = phase === 'idle1' || phase === 'idle2';
  const isWinPhase = phase === 'win' || phase === 'flyout' || phase === 'done';
  const isFlyout = phase === 'flyout';
  const pullProgress = Math.min(1, pullY / PULL_TRIGGER_PX);

  return (
    <div className="relative w-full max-w-3xl mx-auto select-none">
      {/* Machine chassis */}
      <div
        className="relative mx-auto"
        style={{
          aspectRatio: `${MACHINE_W} / ${MACHINE_H}`,
          width: '100%',
          maxWidth: MACHINE_W,
          backgroundImage: `url(${machineEmpty})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          filter: isWinPhase
            ? 'drop-shadow(0 0 40px rgba(251, 119, 1, 0.7))'
            : 'drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5))',
          transition: 'filter 0.4s ease',
        }}
      >
        {/* Three reels positioned over the chassis cutouts */}
        {REEL_POSITIONS.map((pos, i) => (
          <div
            key={i}
            className="absolute overflow-hidden"
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.width,
              height: pos.height,
              background:
                'linear-gradient(180deg, #0B0B10 0%, #1C1C24 50%, #0B0B10 100%)',
              borderRadius: '6%',
              boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6), inset 0 -4px 8px rgba(0,0,0,0.6)',
            }}
          >
            <div
              ref={reelRefs[i]}
              style={{
                willChange: 'transform',
                transform: 'translateY(0px)',
                height: `${STRIP.length * 100}%`,
              }}
            >
              {STRIP.map((sym, j) => (
                <div
                  key={j}
                  style={{
                    width: '100%',
                    height: `${100 / STRIP.length}%`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10% 10%',
                    boxSizing: 'border-box',
                  }}
                >
                  <img
                    src={SYMBOL_IMG[sym]}
                    alt=""
                    draggable={false}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      filter:
                        isWinPhase && sym === 'gold'
                          ? 'drop-shadow(0 0 12px #FFB800) drop-shadow(0 0 4px #FB7701)'
                          : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
                      transition: 'filter 0.3s ease',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Winning glow overlay */}
            {isWinPhase && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  boxShadow:
                    'inset 0 0 30px rgba(251, 119, 1, 0.55), inset 0 0 6px rgba(255, 184, 0, 0.9)',
                  borderRadius: '6%',
                  animation: 'mr8-reel-pulse 1.2s ease-in-out infinite',
                }}
              />
            )}
          </div>
        ))}

        {/* Knob — drag-to-pull lever. Pulses when idle, follows pointer during drag,
            snaps back on release. Pulling past PULL_TRIGGER_PX starts the spin. */}
        <div
          role="button"
          tabIndex={isIdle ? 0 : -1}
          aria-label={isIdle ? 'Pull the lever down to spin' : 'Lever'}
          aria-disabled={!isIdle}
          onPointerDown={handleKnobPointerDown}
          onPointerMove={handleKnobPointerMove}
          onPointerUp={handleKnobPointerUp}
          onPointerCancel={handleKnobPointerCancel}
          onKeyDown={(e) => {
            if (!isIdle) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              triggerSpin();
            }
          }}
          className="absolute outline-none"
          style={{
            right: '-4.5%',
            top: '36%',
            width: '11%',
            cursor: isIdle ? 'grab' : 'default',
            transform: `translateY(${pullY}px)`,
            transition: pullReleasing
              ? 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)'
              : dragStartYRef.current !== null
                ? 'none'
                : 'transform 120ms ease-out',
            filter: isIdle
              ? `drop-shadow(0 0 ${10 + pullProgress * 14}px rgba(251, 119, 1, ${0.7 + pullProgress * 0.3}))`
              : isSpinning
                ? 'drop-shadow(0 0 8px rgba(251, 119, 1, 0.6))'
                : 'none',
            animation:
              isSpinning
                ? 'mr8-knob-shake 0.15s linear infinite'
                : isIdle && dragStartYRef.current === null && !pullReleasing
                  ? 'mr8-knob-pulse 1.4s ease-in-out infinite'
                  : undefined,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <img
            src={isWinPhase ? knobGlow : knobImg}
            alt=""
            draggable={false}
            style={{ width: '100%', display: 'block', pointerEvents: 'none' }}
          />
        </div>
      </div>

      {/* Banner under the machine */}
      <div className="mt-6 min-h-[80px] flex items-center justify-center">
        {isIdle && (
          <div
            className="flex items-center gap-2 text-brand-orange text-sm font-bold tracking-wider uppercase"
            style={{ animation: 'mr8-hint-bob 1.6s ease-in-out infinite' }}
          >
            <span>{phase === 'idle1' ? 'Drag the lever down' : 'Pull again'}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14m-7-7l7 7 7-7" />
            </svg>
          </div>
        )}
        {phase === 'near-miss' && (
          <div
            className="px-6 py-3 rounded-full bg-[#1A1A1A] border border-[#3A3A3A] text-[#E8E8E8] text-lg font-bold tracking-wider"
            style={{ animation: 'mr8-near-miss-shake 0.5s ease' }}
          >
            ANOTHER TURN
          </div>
        )}
        {(phase === 'win' || phase === 'flyout' || phase === 'done') && (
          <div
            ref={winBlockRef}
            className="text-center"
            style={{
              transform: isFlyout ? flyoutTransform : 'translate(0, 0) scale(1)',
              opacity: phase === 'done' ? 0 : isFlyout ? 0 : 1,
              transition: isFlyout
                ? `transform ${FLYOUT_MS}ms cubic-bezier(0.5, 0, 0.75, 0), opacity ${FLYOUT_MS}ms ease-in`
                : undefined,
              willChange: 'transform, opacity',
            }}
          >
            <div
              className="text-2xl font-bold text-brand-orange tracking-wider mb-1"
              style={{ animation: phase === 'win' ? 'mr8-win-pop 0.4s ease-out' : undefined }}
            >
              WINNER!
            </div>
            <div className="text-6xl font-black text-white" style={{ textShadow: '0 4px 20px rgba(251,119,1,0.6)' }}>
              ${(counter / 100).toFixed(2)}
            </div>
            <div className="text-xs text-[#888] mt-1">added to your Mr8 balance</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes mr8-reel-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        @keyframes mr8-knob-shake {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(1px); }
        }
        @keyframes mr8-knob-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes mr8-hint-bob {
          0%, 100% { transform: translateX(0); opacity: 0.85; }
          50% { transform: translateX(6px); opacity: 1; }
        }
        @keyframes mr8-near-miss-shake {
          0% { transform: translateX(0) scale(0.9); opacity: 0; }
          20% { transform: translateX(-6px) scale(1); opacity: 1; }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }
        @keyframes mr8-win-pop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
