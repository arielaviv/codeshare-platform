/**
 * ReaderModeSegmented — Raw / Edited / Final toggle for the Chapters
 * section. Determines which sandbox path ChaptersSection reads from:
 *   raw     → chapters/chXX.md
 *   edited  → edited/chXX.md   (falls back to raw)
 *   final   → proofed/chXX.md  (falls back to edited, then raw)
 *
 * Modes automatically disable when upstream state doesn't exist —
 * if no chapter has editedPath, Edited is disabled; if none has
 * proofedPath, Final is disabled.
 */

export type ReaderMode = 'raw' | 'edited' | 'final';

interface Props {
  mode: ReaderMode;
  onChange: (mode: ReaderMode) => void;
  /** True if at least one chapter has editedPath — enables the Edited button. */
  hasEdited: boolean;
  /** True if at least one chapter has proofedPath — enables the Final button. */
  hasFinal: boolean;
}

const ORDER: ReaderMode[] = ['raw', 'edited', 'final'];

const LABEL: Record<ReaderMode, string> = {
  raw: 'Raw',
  edited: 'Edited',
  final: 'Final',
};

export default function ReaderModeSegmented({ mode, onChange, hasEdited, hasFinal }: Props): JSX.Element {
  const disabledFor = (m: ReaderMode): boolean => {
    if (m === 'edited') return !hasEdited;
    if (m === 'final') return !hasFinal;
    return false;
  };

  return (
    <div className="inline-flex items-center bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded-full p-0.5 text-[11px]">
      {ORDER.map((m) => {
        const active = m === mode;
        const disabled = disabledFor(m);
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(m)}
            title={
              disabled
                ? m === 'edited'
                  ? 'Available after the Line Editor pass'
                  : 'Available after the Copy Editor pass'
                : `Show the ${LABEL[m].toLowerCase()} draft`
            }
            className={`px-2.5 py-0.5 rounded-full transition-colors ${
              active
                ? 'bg-white dark:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] font-semibold shadow-sm'
                : disabled
                  ? 'text-ink-tertiary dark:text-[#555] cursor-not-allowed opacity-50'
                  : 'text-ink-tertiary dark:text-[#888] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
            }`}
          >
            {LABEL[m]}
            {m === 'final' && active && <span className="ml-1 text-emerald-500">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
