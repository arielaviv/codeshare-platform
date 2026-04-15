/**
 * Inline "Suggested follow-ups" card — Manus image #28.
 * Items are commerce/SOUL-driven. Click → fires the suggestion's payload.
 */
import api from '../../services/api';

export type FollowUpKind =
  | 'free_powerup'
  | 'paid_upsell'
  | 'discovery_bundle'
  | 'spin_for_discount'
  | 'related_topic'
  | 'follow_through';

export type FollowUpIcon = 'gift' | 'plus' | 'gauge' | 'sparkles' | 'compass' | 'rocket';

export type FollowUpPayload =
  | { kind: 'send_prompt'; prompt: string }
  | { kind: 'trigger_tool'; tool: string; input?: Record<string, unknown> }
  | { kind: 'open_modal'; modal: 'topup' | 'personalization' | 'plan' };

export interface FollowUpSuggestion {
  kind: FollowUpKind;
  label: string;
  icon?: FollowUpIcon;
  payload?: FollowUpPayload;
}

interface Props {
  suggestions: FollowUpSuggestion[];
  onSendPrompt: (prompt: string) => void;
  onOpenModal: (modal: 'topup' | 'personalization' | 'plan') => void;
}

export default function FollowUpsCard({ suggestions, onSendPrompt, onOpenModal }: Props): JSX.Element {
  const handleClick = async (s: FollowUpSuggestion) => {
    const p = s.payload;
    if (!p) {
      // Fallback: treat label as a prompt.
      onSendPrompt(s.label);
      return;
    }
    if (p.kind === 'send_prompt') {
      onSendPrompt(p.prompt);
      return;
    }
    if (p.kind === 'open_modal') {
      onOpenModal(p.modal);
      return;
    }
    if (p.kind === 'trigger_tool') {
      try {
        await api.post('/ai/tool', { tool: p.tool, input: p.input ?? {} });
      } catch {
        // Best-effort. Phase 8 fleshes out the tool endpoint.
      }
    }
  };

  return (
    <div className="my-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-2 px-1">
        Suggested follow-ups
      </div>
      <ul className="border border-edge dark:border-[#2A2A2A] rounded-lg overflow-hidden bg-white dark:bg-[#141414]">
        {suggestions.map((s, i) => (
          <li key={`${s.kind}-${i}`} className={i > 0 ? 'border-t border-edge dark:border-[#2A2A2A]' : ''}>
            <button
              type="button"
              onClick={() => handleClick(s)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
            >
              <FollowUpIconRender icon={s.icon} kind={s.kind} />
              <span className="flex-1 truncate">{s.label}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-tertiary dark:text-[#666] flex-shrink-0">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FollowUpIconRender({ icon, kind }: { icon?: FollowUpIcon; kind: FollowUpKind }): JSX.Element {
  // Default icon by kind if explicit icon not supplied.
  const effective: FollowUpIcon = icon ?? defaultIconFor(kind);
  const c = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0 text-ink-tertiary dark:text-[#888]',
  };
  if (effective === 'gift') {
    return <svg {...c}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>;
  }
  if (effective === 'plus') {
    return <svg {...c}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
  }
  if (effective === 'gauge') {
    return <svg {...c}><path d="M12 14l4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>;
  }
  if (effective === 'sparkles') {
    return <svg {...c}><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" /></svg>;
  }
  if (effective === 'compass') {
    return <svg {...c}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>;
  }
  // rocket
  return <svg {...c}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>;
}

function defaultIconFor(kind: FollowUpKind): FollowUpIcon {
  if (kind === 'free_powerup') return 'gift';
  if (kind === 'paid_upsell') return 'plus';
  if (kind === 'discovery_bundle') return 'gauge';
  if (kind === 'spin_for_discount') return 'sparkles';
  if (kind === 'related_topic') return 'compass';
  return 'rocket';
}
