import { useState } from 'react';
import { usePrizeOrchestrator } from '../contexts/PrizeOrchestratorContext';
import type {
  PowerupGiftedEvent,
  PrizeAwardedEvent,
  SlotSpinTriggeredEvent,
} from '../types/agent-events';

const SPIN_EVENT: SlotSpinTriggeredEvent = {
  reason: 'First prompt of the day',
  tierWeights: { polish: 0.7, brains: 0.25, power: 0.05 },
};

const PRIZE_EVENT: PrizeAwardedEvent = {
  amountCents: 75,
  newBalanceCents: 425,
  reason: 'You shipped three features without a single revision',
};

const POWERUP_EVENT: PowerupGiftedEvent = {
  tier: 'polish',
  reason: 'Your UI deserves a glow-up',
  featureName: 'Dark mode toggle',
};

const BRAINS_POWERUP_EVENT: PowerupGiftedEvent = {
  tier: 'brains',
  reason: 'Building a CRM without a DB is cruel',
  featureName: 'Mongo persistence',
};

export default function DebugPrizeOrchestratorPage(): JSX.Element {
  const orchestrator = usePrizeOrchestrator();
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => {
    const stamped = `${new Date().toLocaleTimeString()}  ${line}`;
    setLog((prev) => [stamped, ...prev].slice(0, 40));
  };

  const buttons: Array<{ label: string; onClick: () => void; accent: string }> = [
    {
      label: 'triggerSpin — weighted',
      onClick: () => {
        orchestrator.triggerSpin(SPIN_EVENT);
        note('enqueued: spin (polish/brains/power = 0.7 / 0.25 / 0.05)');
      },
      accent: '#FB7701',
    },
    {
      label: 'triggerPrize — $0.75',
      onClick: () => {
        orchestrator.triggerPrize(PRIZE_EVENT);
        note('enqueued: prize ($0.75)');
      },
      accent: '#FFB800',
    },
    {
      label: 'triggerPowerup — Polish',
      onClick: () => {
        orchestrator.triggerPowerup(POWERUP_EVENT);
        note('enqueued: powerup (Polish)');
      },
      accent: '#FFB800',
    },
    {
      label: 'triggerPowerup — Brains',
      onClick: () => {
        orchestrator.triggerPowerup(BRAINS_POWERUP_EVENT);
        note('enqueued: powerup (Brains)');
      },
      accent: '#FB7701',
    },
    {
      label: 'triggerJackpot',
      onClick: () => {
        orchestrator.triggerJackpot();
        note('enqueued: jackpot');
      },
      accent: '#0B8800',
    },
    {
      label: 'spin → prize → powerup (burst)',
      onClick: () => {
        orchestrator.triggerSpin(SPIN_EVENT);
        orchestrator.triggerPrize(PRIZE_EVENT);
        orchestrator.triggerPowerup(POWERUP_EVENT);
        note('enqueued burst: spin, prize, powerup');
      },
      accent: '#FFFFFF',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black tracking-tight mb-1">Prize Orchestrator — debug</h1>
        <p className="text-sm text-[#A0A0A0] mb-8">
          Dev-only harness. Buttons synthesize SSE events and push them through{' '}
          <code className="text-brand-orange">usePrizeOrchestrator()</code>. Queue is FIFO, one
          overlay at a time.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          {buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.onClick}
              className="rounded-xl border border-[#2A2A2A] bg-[#141414] hover:bg-[#1A1A1A] transition-colors px-4 py-3 text-left"
            >
              <div
                className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1"
                style={{ color: b.accent }}
              >
                fire
              </div>
              <div className="text-sm font-semibold">{b.label}</div>
            </button>
          ))}
        </div>

        <h2 className="text-xs uppercase tracking-[0.25em] text-[#666] font-bold mb-2">
          Event log
        </h2>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#0F0F0F] p-3 min-h-[120px] font-mono text-[12px] text-[#A0A0A0] space-y-1">
          {log.length === 0 ? (
            <div className="text-[#555] italic">No events yet. Click a button above.</div>
          ) : (
            log.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
