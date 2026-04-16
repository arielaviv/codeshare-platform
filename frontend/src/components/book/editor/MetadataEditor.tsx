/**
 * MetadataEditor — top-level book metadata. Title, author, bio, theme.
 * Debounces each field change by 800ms and PATCHes `/books/:id`. Reads
 * history on undo/redo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOOK_THEMES, type BookThemeId } from '../../../themes/book';
import { useEditorHistory } from './useEditorHistory';

interface MetadataShape {
  title: string;
  author: string;
  bio: string;
  themeId: BookThemeId;
}

interface Props {
  value: MetadataShape;
  onPatch: (patch: Partial<MetadataShape>) => Promise<void> | void;
}

const SAVE_DEBOUNCE_MS = 800;

export default function MetadataEditor({ value, onPatch }: Props): JSX.Element {
  const [local, setLocal] = useState<MetadataShape>(value);
  const history = useEditorHistory<MetadataShape>(value, { quiesceMs: 500, max: 50 });
  const lastSavedRef = useRef<MetadataShape>(value);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External value syncs (e.g. parent refetch after optimistic save).
  useEffect(() => {
    setLocal(value);
    history.reset(value);
    lastSavedRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.title, value.author, value.bio, value.themeId]);

  const diff = useMemo(() => {
    const result: Partial<MetadataShape> = {};
    if (local.title !== lastSavedRef.current.title) result.title = local.title;
    if (local.author !== lastSavedRef.current.author) result.author = local.author;
    if (local.bio !== lastSavedRef.current.bio) result.bio = local.bio;
    if (local.themeId !== lastSavedRef.current.themeId) result.themeId = local.themeId;
    return result;
  }, [local]);

  // Debounced save.
  useEffect(() => {
    if (Object.keys(diff).length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await onPatch(diff);
        lastSavedRef.current = local;
      } catch {
        // leave local state — user can retry via Cmd+S flush
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff]);

  const set = useCallback(
    <K extends keyof MetadataShape>(key: K, val: MetadataShape[K]) => {
      setLocal((prev) => {
        const next = { ...prev, [key]: val };
        history.push(next);
        return next;
      });
    },
    [history]
  );

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <Field label="Title" hint="Displayed on the cover, running head, and PDF metadata.">
        <input
          type="text"
          value={local.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={200}
          className="w-full text-base font-medium text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#3A3A3A] focus:border-brand-orange focus:outline-none rounded px-3 py-2 transition-colors"
          placeholder="Untitled Book"
        />
      </Field>

      <Field label="Author" hint="Printed on the cover, copyright page, and KDP metadata.">
        <input
          type="text"
          value={local.author}
          onChange={(e) => set('author', e.target.value)}
          maxLength={120}
          className="w-full text-sm text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#3A3A3A] focus:border-brand-orange focus:outline-none rounded px-3 py-2 transition-colors"
          placeholder="Your name"
        />
      </Field>

      <Field label="Author bio" hint="Back-cover + about-the-author page. ~2–3 sentences.">
        <textarea
          value={local.bio}
          onChange={(e) => set('bio', e.target.value)}
          maxLength={500}
          rows={4}
          className="w-full text-sm text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#3A3A3A] focus:border-brand-orange focus:outline-none rounded px-3 py-2 leading-relaxed transition-colors resize-none"
          placeholder="Born in… lives in… writes about…"
        />
        <div className="text-[10px] text-ink-tertiary dark:text-[#777] mt-1 text-right tabular-nums">
          {local.bio.length} / 500
        </div>
      </Field>

      <Field label="Theme" hint="Picks body font, heading style, drop cap, margins, scene break.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.values(BOOK_THEMES).map((t) => {
            const active = t.id === local.themeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => set('themeId', t.id)}
                className={`flex items-start gap-3 p-3 rounded-md border text-left transition-colors ${
                  active
                    ? 'border-brand-orange bg-brand-orange/5'
                    : 'border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#3A3A3A] bg-white dark:bg-[#141414]'
                }`}
              >
                <span className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                  {t.previewPalette.map((hex, i) => (
                    <span key={i} className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: hex }} />
                  ))}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${active ? 'text-brand-orange font-semibold' : 'text-ink dark:text-[#E8E8E8]'}`}>
                    {t.displayName}
                  </div>
                  <div className="text-[11px] text-ink-tertiary dark:text-[#888] mt-0.5 leading-snug">
                    {t.tagline}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#777] font-medium">
          {label}
        </label>
      </div>
      {children}
      {hint && <div className="text-[11px] text-ink-tertiary dark:text-[#777] mt-1">{hint}</div>}
    </div>
  );
}
