import { useState } from 'react';

interface ActionStep {
  id: string;
  label: string;
  path?: string;
  status: 'pending' | 'active' | 'done';
  isCommand?: boolean;
  output?: string;
}

interface ActionCardProps {
  title: string;
  steps: ActionStep[];
  expanded: boolean;
  onToggle: () => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'done') {
    return (
      <div className="w-5 h-5 rounded-full bg-[#22C55E]/10 flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === 'active') {
    return (
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin" stroke="#3B82F6" fill="none" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <div className="w-3 h-3 rounded-full border-2 border-[#444]" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-[#3B82F6]/10 text-[#60A5FA] border-[#3B82F6]/20',
    done: 'bg-[#22C55E]/10 text-[#4ADE80] border-[#22C55E]/20',
    pending: 'bg-[#666]/10 text-[#888] border-[#666]/20',
  };
  const labels: Record<string, string> = {
    active: 'in-progress',
    done: 'complete',
    pending: 'pending',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${colors[status] || colors.pending}`}>
      {labels[status] || status}
    </span>
  );
}

export type { ActionStep };

export default function ActionCard({ title, steps, expanded, onToggle }: ActionCardProps) {
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);

  // Until real `plan_proposed` events from the agent populate steps (Phase 3),
  // render nothing — the prior fabricated checklist was misleading.
  if (steps.length === 0) return null;

  const overallStatus = steps.every((s) => s.status === 'done') ? 'done' : steps.some((s) => s.status === 'active') ? 'active' : 'pending';

  return (
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden my-4">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#1A1A1A] transition-colors"
      >
        <div className="flex items-center gap-3">
          <StatusIcon status={overallStatus} />
          <span className="text-sm font-medium text-[#E8E8E8]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={overallStatus} />
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4">
          <div className="relative">
            <div className="absolute left-[9px] top-0 bottom-0 w-px bg-[#2A2A2A]" />

            {steps.map((step, i) => (
              <div
                key={step.id}
                className={`relative flex items-start gap-3 py-1.5 transition-colors ${
                  hoveredStep === step.id ? 'bg-[#1A1A1A] -mx-2 px-2 rounded' : ''
                }`}
                onMouseEnter={() => setHoveredStep(step.id)}
                onMouseLeave={() => setHoveredStep(null)}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="relative z-10 bg-[#141414]">
                  <StatusIcon status={step.status} />
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  {step.isCommand ? (
                    <div>
                      <span className="text-xs text-[#A0A0A0]">{step.label}</span>
                      {step.output && (
                        <div className="mt-1.5 bg-[#0F0F0F] border border-[#222] rounded-lg px-3 py-2 font-mono text-[11px] text-[#888] max-h-16 overflow-y-auto subtle-scrollbar">
                          {step.output}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className={`text-xs ${step.status === 'done' ? 'text-[#888]' : 'text-[#D4D4D4]'}`}>
                      {step.path ? (
                        <>
                          {step.label.replace(step.path, '')}
                          <span className={step.label.startsWith('Update') ? 'text-[#22C55E]' : 'text-[#60A5FA]'}>
                            {step.path}
                          </span>
                        </>
                      ) : (
                        step.label
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
