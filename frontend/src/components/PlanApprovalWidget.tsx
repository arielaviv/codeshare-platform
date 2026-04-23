import { memo, useEffect, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { BlueprintSpec, PermissionMode } from '../types/blueprint';

type SlotKind = 'primary' | 'feedback';

interface SlotChoice {
  kind: SlotKind;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface PlanApprovalWidgetProps {
  plan: BlueprintSpec;
  collapsed?: boolean;
  onAcceptBuild: (mode: PermissionMode, clearContext: boolean) => void;
  onTellMr8: () => void;
  contextPercent?: number;
  /** When true, card renders as a compact "Plan accepted" banner instead
   *  of the interactive approval UI. */
  accepted?: boolean;
}

function PlanApprovalWidgetBase({
  plan,
  collapsed,
  onAcceptBuild,
  onTellMr8,
  contextPercent,
  accepted,
}: PlanApprovalWidgetProps): JSX.Element {
  const [expanded, setExpanded] = useState(!collapsed);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedIdxRef = useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;

  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  const stepCount = phases.reduce((s, p) => s + (p.steps?.length ?? 0), 0);
  const phaseLabel = `${phases.length} phase${phases.length === 1 ? '' : 's'} · ${stepCount} step${stepCount === 1 ? '' : 's'}`;

  const choices: SlotChoice[] = [
    {
      kind: 'primary',
      label: 'Accept & Build',
      sublabel: phaseLabel,
    },
    {
      kind: 'feedback',
      label: 'Refine plan...',
      sublabel: 'Tell Mr8 what to change',
    },
  ];

  const runAction = (choice: SlotChoice) => {
    if (choice.disabled) return;
    if (choice.kind === 'primary') onAcceptBuild('auto', false);
    else if (choice.kind === 'feedback') onTellMr8();
  };

  useEffect(() => {
    if (accepted) return;
    if (collapsed && !expanded) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inEditable = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;

      if (e.key === 'Enter') {
        if (inEditable) {
          if (tag !== 'TEXTAREA') return;
          const ta = target as HTMLTextAreaElement;
          if (ta.value.trim().length > 0) return;
        }
        e.preventDefault();
        const choice = choices[selectedIdxRef.current];
        if (choice) runAction(choice);
        return;
      }

      if (inEditable) return;
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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, expanded, accepted]);

  if (accepted) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-brand-green/40 bg-brand-green-soft dark:bg-brand-green/15 px-3 py-2 text-[12px] my-2">
        <Check size={14} strokeWidth={2.5} className="text-brand-green flex-shrink-0" />
        <div className="flex-1 min-w-0 text-ink dark:text-[#E8E8E8]">
          <span className="font-semibold">Plan accepted</span>
          <span className="text-ink-tertiary dark:text-[#888] truncate ml-2">{plan.title}</span>
        </div>
      </div>
    );
  }

  if (collapsed && !expanded) {
    return (
      <div className="px-3 py-1">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 bg-transparent text-left text-[11px] text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8]"
        >
          <ChevronRight size={11} className="text-ink-tertiary" />
          <Brain size={12} className="text-brand-green" />
          <span className="font-medium">Plan({plan.title})</span>
          <span className="text-[10px] text-ink-tertiary">{phaseLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] text-[12px] shadow-sm"
      style={{ maxHeight: '70vh' }}
    >
      <div className="flex-shrink-0 bg-brand-green text-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          {collapsed && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="bg-transparent p-0 text-white/80 hover:text-white"
              aria-label="Collapse plan"
            >
              <ChevronDown size={13} />
            </button>
          )}
          <Brain size={14} className="text-white" />
          <span className="font-semibold text-[13px] text-white truncate">{plan.title}</span>
        </div>
      </div>

      <div className="flex-shrink-0 border-b border-edge dark:border-[#2A2A2A] px-4 py-2.5 bg-surface-secondary dark:bg-[#0F0F0F]">
        <p className="text-ink dark:text-[#E8E8E8] leading-snug">{plan.summary}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {phases.map((phase, phaseIdx) => (
          <div key={`phase-${String(phaseIdx)}`} className="mb-3 last:mb-0">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-green">
              Phase {phaseIdx + 1}: {phase.name.replace(/^Phase\s*\d+\s*[—–:-]\s*/i, '')}
            </div>
            <div className="pl-3 space-y-1">
              {(phase.steps ?? []).map((step, stepIdx) => (
                <div
                  key={step.id || `step-${String(stepIdx)}`}
                  className="flex items-start gap-2 text-ink dark:text-[#D4D4D4] leading-snug"
                >
                  <span className="mt-1 text-ink-tertiary">·</span>
                  <span>{step.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!collapsed && (
        <div className="flex-shrink-0 border-t border-edge dark:border-[#2A2A2A] p-2 bg-surface-secondary dark:bg-[#0F0F0F]">
          {choices.map((choice, idx) => {
            const isSelected = idx === selectedIdx;
            const isPrimary = choice.kind === 'primary';
            return (
              <button
                key={`choice-${choice.kind}`}
                type="button"
                disabled={choice.disabled}
                onClick={() => runAction(choice)}
                onMouseEnter={() => !choice.disabled && setSelectedIdx(idx)}
                className={[
                  'mb-1 flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors',
                  choice.disabled
                    ? 'cursor-not-allowed text-ink-muted'
                    : isPrimary && isSelected
                      ? 'bg-brand-green text-white shadow-sm'
                      : isPrimary
                        ? 'bg-brand-green/90 text-white hover:bg-brand-green'
                        : isSelected
                          ? 'bg-brand-green-soft dark:bg-brand-green/15 text-ink dark:text-[#E8E8E8] border border-brand-green/40'
                          : 'text-ink dark:text-[#D4D4D4] border border-transparent hover:bg-white dark:hover:bg-[#1A1A1A]',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-4 flex-shrink-0 text-center text-[11px] font-semibold mt-0.5',
                    choice.disabled
                      ? 'text-ink-muted'
                      : isPrimary
                        ? 'text-white/80'
                        : isSelected
                          ? 'text-brand-green'
                          : 'text-ink-tertiary',
                  ].join(' ')}
                >
                  {isSelected && !choice.disabled ? '>' : idx + 1}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{choice.label}</span>
                  {choice.sublabel && (
                    <span
                      className={[
                        'mt-0.5 block text-[11px]',
                        choice.disabled
                          ? 'text-ink-muted'
                          : isPrimary
                            ? 'text-white/80'
                            : 'text-ink-secondary dark:text-[#A0A0A0]',
                      ].join(' ')}
                    >
                      {choice.sublabel}
                    </span>
                  )}
                </span>
                {idx === 0 && !choice.disabled && (
                  <span
                    className={[
                      'text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0',
                      isPrimary ? 'bg-white/20 text-white' : 'bg-edge text-ink-secondary',
                    ].join(' ')}
                  >
                    enter
                  </span>
                )}
              </button>
            );
          })}
          {contextPercent != null && (
            <div className="mt-1 text-right text-[10px] text-ink-tertiary dark:text-[#666]">
              context {contextPercent}% used
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const PlanApprovalWidget = memo(PlanApprovalWidgetBase);
