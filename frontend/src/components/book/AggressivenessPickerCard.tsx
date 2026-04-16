/**
 * AggressivenessPickerCard — a pre-Polish chat card shown after chapter
 * drafting finishes. User picks Light / Standard / Heavy + optional
 * directive note. Clicking "Let Mr8 edit →" kicks off the Polish pipeline;
 * "Skip editing" advances the stepper past Polish without running the
 * subagents.
 *
 * NOT a formal approval gate — doesn't block the agent loop. Just a
 * UX-scoped choice card.
 */
import { useState } from 'react';
import type { EditAggressiveness } from '../../services/bookPolishStream';

export interface AggressivenessPickerProps {
  /** Locked when the user has already clicked one of the CTAs. */
  status: 'pending' | 'answered-polish' | 'answered-skip';
  chosenAggressiveness?: EditAggressiveness;
  onContinue(aggressiveness: EditAggressiveness, directives: string): void;
  onSkip(): void;
}

interface LevelOption {
  id: EditAggressiveness;
  label: string;
  blurb: string;
  badge?: string;
}

const OPTIONS: LevelOption[] = [
  {
    id: 'light',
    label: 'Light',
    blurb: 'Only cuts dead words (very, just, really) and fixes obvious awkwardness. Voice stays verbatim.',
  },
  {
    id: 'standard',
    label: 'Standard',
    blurb: 'Tightens rhythm, varies openers, trims dialogue tags, removes echo words. Voice preserved.',
    badge: 'Recommended',
  },
  {
    id: 'heavy',
    label: 'Heavy',
    blurb: 'Replaces weak verb+adverb pairs, restructures sprawl, unifies tense. Still your voice — sharper.',
  },
];

export default function AggressivenessPickerCard({
  status,
  chosenAggressiveness,
  onContinue,
  onSkip,
}: AggressivenessPickerProps): JSX.Element {
  const [level, setLevel] = useState<EditAggressiveness>(chosenAggressiveness ?? 'standard');
  const [directive, setDirective] = useState('');

  const locked = status !== 'pending';

  return (
    <div className="animate-fade-slide-up my-3 max-w-2xl">
      <div className="rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-orange-soft dark:bg-brand-orange/15 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-brand-orange">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary dark:text-[#888] mb-1">
              Editing preference
            </div>
            <div className="text-[14px] text-ink dark:text-[#E8E8E8] leading-relaxed">
              How aggressive should Mr8 be while polishing? Changes are chapter-by-chapter and voice-preserving at every level.
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {OPTIONS.map((opt) => {
            const active = level === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={locked}
                onClick={() => setLevel(opt.id)}
                className={`text-left rounded-md border px-3 py-2 transition-colors ${
                  active
                    ? 'border-brand-orange bg-brand-orange-soft/50 dark:bg-brand-orange/10'
                    : 'border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#444]'
                } ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[13px] font-semibold ${active ? 'text-brand-orange' : 'text-ink dark:text-[#E8E8E8]'}`}>
                    {opt.label}
                  </span>
                  {opt.badge && (
                    <span className="text-[9px] uppercase tracking-wider text-ink-tertiary dark:text-[#888]">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-tertiary dark:text-[#888] leading-snug">
                  {opt.blurb}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-3">
          <label className="text-[11px] text-ink-tertiary dark:text-[#888] block mb-1">
            Optional note for the editor
          </label>
          <input
            type="text"
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            disabled={locked}
            placeholder={'e.g. "tighter dialogue", "less lyrical", "preserve the profanity"'}
            className="w-full px-2.5 py-1.5 text-[12px] border border-edge dark:border-[#2A2A2A] rounded bg-white dark:bg-[#0F0F0F] text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-brand-orange disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F]">
          {!locked ? (
            <>
              <button
                type="button"
                onClick={() => onContinue(level, directive.trim())}
                className="text-[12px] font-medium bg-brand-orange hover:bg-brand-orange-hover text-white px-3 py-1.5 rounded transition-colors"
              >
                Let Mr8 edit →
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="text-[12px] font-medium border border-edge dark:border-[#2A2A2A] text-ink-secondary dark:text-[#A0A0A0] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] px-3 py-1.5 rounded transition-colors"
              >
                Skip editing
              </button>
            </>
          ) : (
            <div className="text-[12px] text-ink-tertiary dark:text-[#888]">
              {status === 'answered-skip'
                ? 'Editing skipped.'
                : `Editing with ${chosenAggressiveness ?? level} aggressiveness.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
