import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PowerupGiftedEvent, PrizeAwardedEvent, SlotSpinTriggeredEvent } from '../types/agent-events';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

vi.mock('../components/SlotMachine', () => ({
  __esModule: true,
  default: ({ onWinReveal }: { onWinReveal: () => void }) => (
    <div data-testid="slot-machine">
      <button type="button" onClick={onWinReveal}>
        slot-win
      </button>
    </div>
  ),
}));

vi.mock('../components/PrizeModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="prize-modal">
      <button type="button" onClick={onClose}>
        prize-close
      </button>
    </div>
  ),
}));

vi.mock('../components/PowerupCardPicker', () => ({
  __esModule: true,
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="powerup-picker">
      <button type="button" onClick={onComplete}>
        powerup-done
      </button>
    </div>
  ),
}));

import {
  PrizeOrchestratorProvider,
  usePrizeOrchestrator,
  type PrizeOrchestratorApi,
} from './PrizeOrchestratorContext';

const SPIN: SlotSpinTriggeredEvent = {
  reason: 'test',
  tierWeights: { polish: 1, brains: 0, power: 0 },
};

const PRIZE: PrizeAwardedEvent = {
  amountCents: 50,
  newBalanceCents: 350,
  reason: 'test prize',
};

const POWERUP: PowerupGiftedEvent = {
  tier: 'polish',
  reason: 'test powerup',
  featureName: 'Test Feature',
};

function Harness({ onReady }: { onReady: (api: PrizeOrchestratorApi) => void }) {
  const api = usePrizeOrchestrator();
  onReady(api);
  return null;
}

function mount(): PrizeOrchestratorApi {
  const ref: { api: PrizeOrchestratorApi | null } = { api: null };
  render(
    <PrizeOrchestratorProvider>
      <Harness
        onReady={(api) => {
          ref.api = api;
        }}
      />
    </PrizeOrchestratorProvider>,
  );
  if (ref.api === null) throw new Error('api not captured');
  return ref.api;
}

describe('PrizeOrchestratorProvider', () => {
  beforeEach(() => {
    // matchMedia stub for prefersReducedMotion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('plays nothing until an event is triggered', () => {
    mount();
    expect(screen.queryByTestId('slot-machine')).toBeNull();
    expect(screen.queryByTestId('prize-modal')).toBeNull();
    expect(screen.queryByTestId('powerup-picker')).toBeNull();
  });

  it('serializes spin then prize — only one overlay on screen at a time', async () => {
    const user = userEvent.setup();
    const api = mount();

    act(() => {
      api.triggerSpin(SPIN);
      api.triggerPrize(PRIZE);
    });

    expect(screen.getByTestId('slot-machine')).toBeInTheDocument();
    expect(screen.queryByTestId('prize-modal')).toBeNull();

    // finish the spin → Keep-going button should appear
    await user.click(screen.getByText('slot-win'));
    await user.click(screen.getByRole('button', { name: /keep going/i }));

    expect(screen.queryByTestId('slot-machine')).toBeNull();
    expect(screen.getByTestId('prize-modal')).toBeInTheDocument();

    // close prize → queue drains completely
    await user.click(screen.getByText('prize-close'));
    expect(screen.queryByTestId('prize-modal')).toBeNull();
  });

  it('plays a powerup after a spin in FIFO order', async () => {
    const user = userEvent.setup();
    const api = mount();

    act(() => {
      api.triggerSpin(SPIN);
      api.triggerPowerup(POWERUP);
    });

    expect(screen.getByTestId('slot-machine')).toBeInTheDocument();
    expect(screen.queryByTestId('powerup-picker')).toBeNull();

    await user.click(screen.getByText('slot-win'));
    await user.click(screen.getByRole('button', { name: /keep going/i }));

    expect(screen.queryByTestId('slot-machine')).toBeNull();
    expect(screen.getByTestId('powerup-picker')).toBeInTheDocument();

    await user.click(screen.getByText('powerup-done'));
    expect(screen.queryByTestId('powerup-picker')).toBeNull();
  });

  it('treats triggerJackpot as a slot spin', async () => {
    const user = userEvent.setup();
    const api = mount();

    act(() => {
      api.triggerJackpot();
    });

    expect(screen.getByTestId('slot-machine')).toBeInTheDocument();
    expect(screen.getByText(/jackpot time/i)).toBeInTheDocument();

    await user.click(screen.getByText('slot-win'));
    await user.click(screen.getByRole('button', { name: /keep going/i }));

    expect(screen.queryByTestId('slot-machine')).toBeNull();
  });
});
