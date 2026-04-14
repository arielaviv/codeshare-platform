import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import confetti from 'canvas-confetti';
import SlotMachine, { type SpinOutcome } from '../components/SlotMachine';
import PrizeModal from '../components/PrizeModal';
import PowerupCardPicker from '../components/PowerupCardPicker';
import {
  JACKPOT_WEIGHTS,
  awardCentsForTier,
  outcomesForTier,
  pickTier,
} from '../utils/spinOutcomes';
import type {
  PrizeAwardedEvent,
  SlotSpinTriggeredEvent,
  PowerupGiftedEvent,
} from '../types/agent-events';
import type { AgentStreamEvent } from '../hooks/useAgentEventStream';

export interface PrizeOrchestratorApi {
  triggerSpin: (spin: SlotSpinTriggeredEvent) => void;
  triggerPrize: (prize: PrizeAwardedEvent) => void;
  triggerPowerup: (powerup: PowerupGiftedEvent) => void;
  triggerJackpot: () => void;
}

type QueueItem =
  | { id: number; kind: 'spin'; event: SlotSpinTriggeredEvent }
  | { id: number; kind: 'prize'; event: PrizeAwardedEvent }
  | { id: number; kind: 'powerup'; event: PowerupGiftedEvent }
  | { id: number; kind: 'jackpot' };

const stubApi: PrizeOrchestratorApi = {
  triggerSpin: () => {
    console.warn('[PrizeOrchestrator] triggerSpin called before provider mounted');
  },
  triggerPrize: () => {
    console.warn('[PrizeOrchestrator] triggerPrize called before provider mounted');
  },
  triggerPowerup: () => {
    console.warn('[PrizeOrchestrator] triggerPowerup called before provider mounted');
  },
  triggerJackpot: () => {
    console.warn('[PrizeOrchestrator] triggerJackpot called before provider mounted');
  },
};

const PrizeOrchestratorContext = createContext<PrizeOrchestratorApi>(stubApi);

export interface PrizeOrchestratorProviderProps {
  children: ReactNode;
  value?: PrizeOrchestratorApi;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function PrizeOrchestratorProvider({
  children,
  value,
}: PrizeOrchestratorProviderProps): JSX.Element {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const idRef = useRef(0);

  const enqueue = useCallback((item: Omit<QueueItem, 'id'>) => {
    idRef.current += 1;
    const queued = { ...item, id: idRef.current } as QueueItem;
    setQueue((q) => [...q, queued]);
  }, []);

  const advance = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const api = useMemo<PrizeOrchestratorApi>(() => {
    if (value) return value;
    return {
      triggerSpin: (spin) => enqueue({ kind: 'spin', event: spin }),
      triggerPrize: (prize) => enqueue({ kind: 'prize', event: prize }),
      triggerPowerup: (powerup) => enqueue({ kind: 'powerup', event: powerup }),
      triggerJackpot: () => enqueue({ kind: 'jackpot' }),
    };
  }, [enqueue, value]);

  const active = queue[0];

  return (
    <PrizeOrchestratorContext.Provider value={api}>
      {children}
      {active ? (
        <ActiveOverlay key={active.id} item={active} onComplete={advance} />
      ) : null}
    </PrizeOrchestratorContext.Provider>
  );
}

interface ActiveOverlayProps {
  item: QueueItem;
  onComplete: () => void;
}

function ActiveOverlay({ item, onComplete }: ActiveOverlayProps): JSX.Element {
  switch (item.kind) {
    case 'prize':
      return (
        <PrizeModal
          prize={{
            amountCents: item.event.amountCents,
            newBalanceCents: item.event.newBalanceCents,
            reason: item.event.reason,
          }}
          onClose={onComplete}
        />
      );
    case 'powerup':
      return <PowerupCardPicker event={item.event} onComplete={onComplete} />;
    case 'spin':
      return (
        <SpinOverlay
          reason={item.event.reason}
          tierWeights={item.event.tierWeights}
          onComplete={onComplete}
        />
      );
    case 'jackpot':
      return (
        <SpinOverlay
          reason="Jackpot"
          tierWeights={JACKPOT_WEIGHTS}
          onComplete={onComplete}
          jackpot
        />
      );
  }
}

interface SpinOverlayProps {
  reason: string;
  tierWeights: SlotSpinTriggeredEvent['tierWeights'];
  onComplete: () => void;
  jackpot?: boolean;
}

function SpinOverlay({
  reason,
  tierWeights,
  onComplete,
  jackpot,
}: SpinOverlayProps): JSX.Element {
  const reduced = useMemo(prefersReducedMotion, []);
  const { outcomes, awardedCents } = useMemo(() => {
    const tier = jackpot ? 'power' : pickTier(tierWeights);
    const picked: [SpinOutcome, SpinOutcome] = outcomesForTier(tier);
    return { outcomes: picked, awardedCents: awardCentsForTier(tier) };
  }, [jackpot, tierWeights]);
  const [won, setWon] = useState(false);

  const handleWin = useCallback(() => {
    setWon(true);
    if (reduced) return;
    confetti({
      particleCount: jackpot ? 300 : 180,
      spread: 130,
      startVelocity: jackpot ? 60 : 45,
      origin: { y: 0.55 },
      colors: ['#FB7701', '#FFB800', '#FFFFFF', '#0B8800'],
      scalar: jackpot ? 1.4 : 1.1,
    });
  }, [jackpot, reduced]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md px-4"
      style={{ animation: 'mr8-prize-overlay 0.25s ease-out' }}
    >
      <div className="text-xs uppercase tracking-[0.3em] text-brand-orange font-bold mb-3">
        {jackpot ? 'Jackpot time' : 'Free spin'}
      </div>
      {reason && (
        <div className="text-sm text-[#A0A0A0] mb-5 text-center max-w-md italic">
          "{reason}"
        </div>
      )}
      <div className="w-full max-w-[540px]">
        <SlotMachine
          overrideOutcomes={outcomes}
          awardedCents={awardedCents}
          reduced={reduced}
          onWinReveal={handleWin}
        />
      </div>
      {won && (
        <button
          type="button"
          onClick={onComplete}
          className="mt-6 px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-hover rounded-full text-white text-sm font-bold shadow-[0_4px_14px_rgba(251,119,1,0.45)]"
        >
          Keep going
        </button>
      )}
    </div>
  );
}

export function usePrizeOrchestrator(): PrizeOrchestratorApi {
  return useContext(PrizeOrchestratorContext);
}

export function dispatchAgentEventToOrchestrator(
  api: PrizeOrchestratorApi,
  event: AgentStreamEvent,
): void {
  switch (event.event) {
    case 'prize_awarded':
      api.triggerPrize(event.data);
      return;
    case 'slot_spin_triggered':
      api.triggerSpin(event.data);
      return;
    case 'powerup_gifted':
      api.triggerPowerup(event.data);
      return;
    default:
      return;
  }
}
