import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type {
  PrizeAwardedEvent,
  SlotSpinTriggeredEvent,
  PowerupGiftedEvent,
} from '../types/agent-events';

export interface PrizeOrchestratorApi {
  triggerSpin: (spin: SlotSpinTriggeredEvent) => void;
  triggerPrize: (prize: PrizeAwardedEvent) => void;
  triggerPowerup: (powerup: PowerupGiftedEvent) => void;
  triggerJackpot: () => void;
}

const stubApi: PrizeOrchestratorApi = {
  triggerSpin: () => {
    console.warn('[PrizeOrchestrator] triggerSpin called before provider mounted (W3 stub)');
  },
  triggerPrize: () => {
    console.warn('[PrizeOrchestrator] triggerPrize called before provider mounted (W3 stub)');
  },
  triggerPowerup: () => {
    console.warn('[PrizeOrchestrator] triggerPowerup called before provider mounted (W3 stub)');
  },
  triggerJackpot: () => {
    console.warn('[PrizeOrchestrator] triggerJackpot called before provider mounted (W3 stub)');
  },
};

const PrizeOrchestratorContext = createContext<PrizeOrchestratorApi>(stubApi);

export interface PrizeOrchestratorProviderProps {
  children: ReactNode;
  value?: PrizeOrchestratorApi;
}

export function PrizeOrchestratorProvider({
  children,
  value,
}: PrizeOrchestratorProviderProps): JSX.Element {
  const resolved = useMemo(() => value ?? stubApi, [value]);
  return (
    <PrizeOrchestratorContext.Provider value={resolved}>
      {children}
    </PrizeOrchestratorContext.Provider>
  );
}

export function usePrizeOrchestrator(): PrizeOrchestratorApi {
  return useContext(PrizeOrchestratorContext);
}
