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

// Reel cutout positions (percentages of machine dimensions, derived from the sprite)
const REEL_POSITIONS = [
  { left: '7.4%', top: '11.5%', width: '16.2%', height: '69.5%' },
  { left: '27.0%', top: '11.5%', width: '16.2%', height: '69.5%' },
  { left: '46.5%', top: '11.5%', width: '16.2%', height: '69.5%' },
];

// Timing (ms, from phase start)
const REEL_STOP_MS = [1800, 2300, 2900];
const NEAR_MISS_HOLD_MS = 1500;
const WIN_TAIL_MS = 400;
const COUNTER_DURATION_MS = 1100;

interface Props {
  outcomes: [SpinOutcome, SpinOutcome];
  awardedCents: number;
  reduced?: boolean;
  onWinReveal: () => void;
}

type Phase = 'spin1' | 'near-miss' | 'spin2' | 'win' | 'done';

export default function SlotMachine({
  outcomes,
  awardedCents,
  reduced,
  onWinReveal,
}: Props) {
  const [phase, setPhase] = useState<Phase>('spin1');
  const [counter, setCounter] = useState(0);
  const reelRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];

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

  useEffect(() => {
    if (reduced) {
      setPhase('done');
      setCounter(awardedCents);
      onWinReveal();
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Spin 1 starts on mount
    requestAnimationFrame(() => applySpin(outcomes[0].symbols));

    // Show near-miss banner after reel 3 settles
    timers.push(setTimeout(() => setPhase('near-miss'), REEL_STOP_MS[2] + 150));

    // Start spin 2
    const spin2Start = REEL_STOP_MS[2] + 150 + NEAR_MISS_HOLD_MS;
    timers.push(
      setTimeout(() => {
        setPhase('spin2');
        resetReels();
        // two rAFs so the reset transition actually applies before the animation resumes
        requestAnimationFrame(() =>
          requestAnimationFrame(() => applySpin(outcomes[1].symbols))
        );
      }, spin2Start)
    );

    // Win banner after reel 3 of spin 2 settles
    const winAt = spin2Start + REEL_STOP_MS[2] + WIN_TAIL_MS;
    timers.push(
      setTimeout(() => {
        setPhase('win');
        onWinReveal();

        // Counter animation
        const start = performance.now();
        const target = awardedCents;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / COUNTER_DURATION_MS);
          const eased = 1 - Math.pow(1 - t, 3);
          setCounter(Math.round(target * eased));
          if (t < 1) requestAnimationFrame(step);
          else setPhase('done');
        };
        requestAnimationFrame(step);
      }, winAt)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isWinPhase = phase === 'win' || phase === 'done';

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
                    padding: '12% 14%',
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

        {/* Knob — positioned at the machine's right side */}
        <img
          src={isWinPhase ? knobGlow : knobImg}
          alt=""
          draggable={false}
          className="absolute"
          style={{
            right: '-4.5%',
            top: '36%',
            width: '11%',
            filter: phase === 'spin1' || phase === 'spin2'
              ? 'drop-shadow(0 0 8px rgba(251, 119, 1, 0.6))'
              : 'none',
            transition: 'filter 0.3s ease',
            animation:
              phase === 'spin1' || phase === 'spin2'
                ? 'mr8-knob-shake 0.15s linear infinite'
                : undefined,
          }}
        />
      </div>

      {/* Banner under the machine */}
      <div className="mt-6 min-h-[80px] flex items-center justify-center">
        {phase === 'near-miss' && (
          <div
            className="px-6 py-3 rounded-full bg-[#1A1A1A] border border-[#3A3A3A] text-[#E8E8E8] text-lg font-bold tracking-wider"
            style={{ animation: 'mr8-near-miss-shake 0.5s ease' }}
          >
            ANOTHER TURN
          </div>
        )}
        {(phase === 'win' || phase === 'done') && (
          <div className="text-center">
            <div
              className="text-2xl font-bold text-brand-orange tracking-wider mb-1"
              style={{ animation: 'mr8-win-pop 0.4s ease-out' }}
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
