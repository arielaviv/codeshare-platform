/**
 * FrontBackMatterEditor — the four book-front/back fields that turn a
 * generated manuscript into a published book: dedication, epigraph,
 * acknowledgements, and (advanced) a copyright-page override. Each field
 * debounces 800ms and PATCHes `/books/:id`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MatterValue {
  dedication: string;
  epigraph: string;
  acknowledgements: string;
  copyrightPageText: string;
}

interface Props {
  value: MatterValue;
  onPatch: (patch: Partial<MatterValue>) => Promise<void> | void;
}

const SAVE_DEBOUNCE_MS = 800;

export default function FrontBackMatterEditor({ value, onPatch }: Props): JSX.Element {
  const [local, setLocal] = useState<MatterValue>(value);
  const lastSavedRef = useRef<MatterValue>(value);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
    lastSavedRef.current = value;
  }, [value.dedication, value.epigraph, value.acknowledgements, value.copyrightPageText]);

  useEffect(() => {
    const diff: Partial<MatterValue> = {};
    if (local.dedication !== lastSavedRef.current.dedication) diff.dedication = local.dedication;
    if (local.epigraph !== lastSavedRef.current.epigraph) diff.epigraph = local.epigraph;
    if (local.acknowledgements !== lastSavedRef.current.acknowledgements) diff.acknowledgements = local.acknowledgements;
    if (local.copyrightPageText !== lastSavedRef.current.copyrightPageText) diff.copyrightPageText = local.copyrightPageText;
    if (Object.keys(diff).length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await onPatch(diff);
        lastSavedRef.current = local;
      } catch {
        // ignore
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [local, onPatch]);

  const set = useCallback(<K extends keyof MatterValue>(key: K, v: MatterValue[K]) => {
    setLocal((prev) => ({ ...prev, [key]: v }));
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <MatterField
        label="Dedication"
        hint="One short line, printed alone on its own page before chapter 1. Blank = no dedication page."
        max={500}
        value={local.dedication}
        onChange={(v) => set('dedication', v)}
        rows={2}
        placeholder="For my grandmother, who told the first story."
      />

      <MatterField
        label="Epigraph"
        hint="A quote + attribution, printed on its own page after the dedication."
        max={500}
        value={local.epigraph}
        onChange={(v) => set('epigraph', v)}
        rows={3}
        placeholder={'"We tell ourselves stories in order to live."\n— Joan Didion'}
      />

      <MatterField
        label="Acknowledgements"
        hint="Back-matter page after the final chapter. Editor, early readers, support, coffee shops."
        max={2000}
        value={local.acknowledgements}
        onChange={(v) => set('acknowledgements', v)}
        rows={6}
        placeholder="Thanks to…"
      />

      <details className="group">
        <summary className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#777] font-medium cursor-pointer hover:text-ink-secondary dark:hover:text-[#A0A0A0]">
          Advanced — copyright page override
        </summary>
        <div className="mt-3">
          <MatterField
            label=""
            hint="Leave blank to use the default © year + author + rights-reserved block. Override only if you need specific language (publishing imprint, ISBN, lawyer boilerplate)."
            max={2000}
            value={local.copyrightPageText}
            onChange={(v) => set('copyrightPageText', v)}
            rows={6}
            placeholder="© 2026 Your Name. All rights reserved…"
          />
        </div>
      </details>
    </div>
  );
}

function MatterField({
  label,
  hint,
  value,
  onChange,
  rows,
  max,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  max: number;
  placeholder?: string;
}): JSX.Element {
  return (
    <div>
      {label && (
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#777] font-medium">
            {label}
          </label>
          <span className="text-[10px] text-ink-tertiary dark:text-[#666] tabular-nums">
            {value.length} / {max}
          </span>
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
        className="w-full text-sm text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#3A3A3A] focus:border-brand-orange focus:outline-none rounded px-3 py-2 leading-relaxed transition-colors resize-y font-serif"
      />
      {hint && <div className="text-[11px] text-ink-tertiary dark:text-[#777] mt-1">{hint}</div>}
    </div>
  );
}
