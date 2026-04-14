import { memo, useEffect, useRef, useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import type { BlueprintSpec, PricingEstimate, PermissionMode } from '../types/blueprint';
import { formatUsd } from '../utils/formatUsd';

type SlotKind = 'primary' | 'discovery' | 'spin' | 'feedback';

interface SlotChoice {
  kind: SlotKind;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface PlanApprovalWidgetProps {
  plan: BlueprintSpec;
  pricing: PricingEstimate;
  collapsed?: boolean;
  onAcceptBuild: (mode: PermissionMode, clearContext: boolean) => void;
  onSpinForDiscount: () => void;
  onTellMr8: () => void;
  contextPercent?: number;
}

function PlanApprovalWidgetBase({
  plan,
  pricing,
  collapsed,
  onAcceptBuild,
  onSpinForDiscount,
  onTellMr8,
  contextPercent,
}: PlanApprovalWidgetProps): JSX.Element {
  const [expanded, setExpanded] = useState(!collapsed);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedIdxRef = useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;

  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  const stepCount = phases.reduce((s, p) => s + (p.steps?.length ?? 0), 0);
  const savingsPct =
    pricing.anchorCents > 0
      ? Math.round(((pricing.anchorCents - pricing.dealerCents) / pricing.anchorCents) * 100)
      : 0;

  const choices: SlotChoice[] = [
    {
      kind: 'primary',
      label: `Accept & Build — ${formatUsd(pricing.dealerCents)}`,
      sublabel: `Claim Free Power-Up · ${tierLabel(pricing.tier)} build`,
    },
    {
      kind: 'discovery',
      label: 'Discovery upsell',
      sublabel: 'Mr8 will suggest a feature during build (W4)',
      disabled: true,
    },
    {
      kind: 'spin',
      label: 'Spin for discount',
      sublabel: `Wheel could drop price as low as ${formatUsd(Math.max(15, Math.round(pricing.dealerCents * 0.1)))}`,
    },
    {
      kind: 'feedback',
      label: 'Tell Mr8 what to change...',
      sublabel: 'Open the input to revise the plan',
    },
  ];

  const runAction = (choice: SlotChoice) => {
    if (choice.disabled) return;
    if (choice.kind === 'primary') onAcceptBuild('auto', false);
    else if (choice.kind === 'spin') onSpinForDiscount();
    else if (choice.kind === 'feedback') onTellMr8();
  };

  useEffect(() => {
    if (collapsed && !expanded) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const enabledIndices = choices
        .map((c, i) => (c.disabled ? -1 : i))
        .filter((i) => i >= 0);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentPos = enabledIndices.indexOf(selectedIdxRef.current);
        const nextPos = Math.min(currentPos + 1, enabledIndices.length - 1);
        setSelectedIdx(enabledIndices[nextPos] ?? enabledIndices[0]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentPos = enabledIndices.indexOf(selectedIdxRef.current);
        const prevPos = Math.max(currentPos - 1, 0);
        setSelectedIdx(enabledIndices[prevPos] ?? enabledIndices[0]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const choice = choices[selectedIdxRef.current];
        if (choice) runAction(choice);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, expanded]);

  if (collapsed && !expanded) {
    return (
      <div className="px-3 py-1">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 bg-transparent text-left text-[11px] text-zinc-400 hover:text-zinc-200"
        >
          <ChevronRight size={11} className="text-zinc-500" />
          <Brain size={12} className="text-zinc-300" />
          <span className="font-medium">Plan({plan.title})</span>
          <span className="text-[10px] text-zinc-500">
            {phases.length} phase{phases.length === 1 ? '' : 's'} · {stepCount} step
            {stepCount === 1 ? '' : 's'}
          </span>
          <span className="ml-auto text-[10px] text-zinc-500">
            {formatUsd(pricing.dealerCents)}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-md border border-zinc-800 bg-black/40 text-[11px]"
      style={{ maxHeight: '70vh' }}
    >
      <div className="flex-shrink-0 border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          {collapsed && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="bg-transparent p-0 text-zinc-500 hover:text-zinc-300"
              aria-label="Collapse plan"
            >
              <ChevronDown size={11} />
            </button>
          )}
          <Brain size={13} className="text-zinc-300" />
          <span className="font-semibold text-zinc-100">{plan.title}</span>
          <span className="ml-auto font-mono text-[9px] text-zinc-500 opacity-60">
            plans/{plan.id}.md
          </span>
        </div>
        <p className="mt-1 text-zinc-300">{plan.summary}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          {phases.map((phase, phaseIdx) => (
            <div key={`phase-${String(phaseIdx)}`} className="mb-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Phase {phaseIdx + 1}: {phase.name.replace(/^Phase\s*\d+\s*[—–:-]\s*/i, '')}
              </div>
              <div className="pl-2">
                {(phase.steps ?? []).map((step, stepIdx) => (
                  <div
                    key={step.id || `step-${String(stepIdx)}`}
                    className="flex items-start gap-2 text-zinc-300 leading-tight"
                  >
                    <span className="mt-0.5 text-zinc-600">-</span>
                    <span>{step.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Price</span>
            {pricing.anchorCents > pricing.dealerCents && (
              <span className="text-[11px] text-zinc-500 line-through">
                {formatUsd(pricing.anchorCents)}
              </span>
            )}
            <span className="text-xl font-bold text-emerald-400">
              {formatUsd(pricing.dealerCents)}
            </span>
            {savingsPct > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                {savingsPct}% off
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">
            {tierLabel(pricing.tier)} · {pricing.modelTier} · ~{pricing.estimatedTurns} turns
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="flex-shrink-0 border-t border-zinc-800 p-2">
          {choices.map((choice, idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={`choice-${choice.kind}`}
                type="button"
                disabled={choice.disabled}
                onClick={() => runAction(choice)}
                onMouseEnter={() => !choice.disabled && setSelectedIdx(idx)}
                className={[
                  'mb-1 flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors',
                  choice.disabled
                    ? 'cursor-not-allowed text-zinc-600'
                    : isSelected
                      ? 'border border-white/15 bg-white/5 text-zinc-100'
                      : 'border border-transparent text-zinc-300 hover:bg-white/5',
                ].join(' ')}
              >
                <span className="w-4 flex-shrink-0 text-center text-[10px] text-zinc-500">
                  {isSelected && !choice.disabled ? '>' : idx + 1}
                </span>
                <span className="flex-1">
                  <span className="block">{choice.label}</span>
                  {choice.sublabel && (
                    <span className="mt-0.5 block text-[10px] text-zinc-500">
                      {choice.sublabel}
                    </span>
                  )}
                </span>
                {idx === 0 && !choice.disabled && (
                  <span className="text-[9px] text-zinc-500">enter</span>
                )}
              </button>
            );
          })}
          {contextPercent != null && (
            <div className="mt-1 text-right text-[9px] text-zinc-600">
              context {contextPercent}% used
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function tierLabel(tier: PricingEstimate['tier']): string {
  switch (tier) {
    case 'polish':
      return 'Polish';
    case 'brains':
      return 'Brains';
    case 'power':
      return 'Power';
    default:
      return tier;
  }
}

export const PlanApprovalWidget = memo(PlanApprovalWidgetBase);
