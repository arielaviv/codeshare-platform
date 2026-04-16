/**
 * ChapterProseEditor — textarea-based prose editor for a single chapter.
 *
 * Notes on choice: we use a plain `<textarea>` (not contentEditable) for
 * reliability. Rich-text contentEditable interacts poorly with the
 * Formatter's markdown expectations (a stray `<span style>` from a paste
 * can derail pandoc), and book prose is overwhelmingly plain text with
 * occasional emphasis. Em-dash autocorrect (`--` → `—`) and smart-quote
 * normalization run on blur + on paste. Italic / bold are accessible via
 * markdown syntax (`*…*`, `**…**`) which pandoc renders correctly.
 *
 * Debounces 1500ms and PATCHes `/books/:id/chapter/:n/prose` with
 * `{ text, variant }`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorHistory } from './useEditorHistory';

export type ProseVariant = 'draft' | 'edited' | 'proofed';

export interface ProseChapter {
  n: number;
  title: string;
  wordCount?: number;
  /** Manually-authored prose per variant (Mongo source of truth, Slice 10j). */
  manualText?: { draft?: string; edited?: string; proofed?: string };
  /** Sandbox paths — fetched via GET /books/:id/chapter/:n when manualText is empty. */
  draftPath?: string;
  editedPath?: string;
  proofedPath?: string;
}

interface Props {
  chapter: ProseChapter;
  /** Fallback prose from the sandbox when `chapter.manualText[variant]` is empty. */
  fallbackText: (variant: ProseVariant) => Promise<string | null>;
  /** Save the current variant. */
  onSave: (variant: ProseVariant, text: string) => Promise<void> | void;
}

const SAVE_DEBOUNCE_MS = 1500;

function bestVariantAvailable(chapter: ProseChapter): ProseVariant {
  if (chapter.proofedPath || chapter.manualText?.proofed) return 'proofed';
  if (chapter.editedPath || chapter.manualText?.edited) return 'edited';
  return 'draft';
}

function applyTypographicPolish(s: string): string {
  return s
    .replace(/--/g, '—')
    .replace(/(^|[\s(])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s(])'/g, '$1‘')
    .replace(/'/g, '’');
}

export default function ChapterProseEditor({ chapter, fallbackText, onSave }: Props): JSX.Element {
  const [variant, setVariant] = useState<ProseVariant>(() => bestVariantAvailable(chapter));
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const history = useEditorHistory<string>('', { quiesceMs: 600, max: 50 });

  const lastSavedRef = useRef<{ variant: ProseVariant; text: string }>({ variant, text: '' });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load the chapter prose when the chapter or variant changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let next = chapter.manualText?.[variant] ?? '';
      if (!next) {
        const remote = await fallbackText(variant);
        next = remote ?? '';
      }
      if (cancelled) return;
      setText(next);
      history.reset(next);
      lastSavedRef.current = { variant, text: next };
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.n, variant]);

  // Debounced save — only if the variant matches what we loaded.
  useEffect(() => {
    if (loading) return;
    if (text === lastSavedRef.current.text && variant === lastSavedRef.current.variant) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await onSave(variant, text);
        lastSavedRef.current = { variant, text };
      } catch {
        // ignore; user can retry
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [text, variant, loading, onSave]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setText(v);
      history.push(v);
    },
    [history]
  );

  const onBlur = useCallback(() => {
    setText((t) => applyTypographicPolish(t));
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = history.undo();
        if (prev !== null) setText(prev);
      } else if (mod && (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        const next = history.redo();
        if (next !== null) setText(next);
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Flush pending debounce immediately.
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        void onSave(variant, text);
        lastSavedRef.current = { variant, text };
      }
    },
    [history, onSave, text, variant]
  );

  const wordCount = text.trim().match(/\S+/g)?.length ?? 0;

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <div className="px-6 pt-6 pb-3 flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary dark:text-[#777] font-medium">
            Chapter {chapter.n}
          </div>
          <div className="text-base font-semibold text-ink dark:text-[#E8E8E8] truncate">
            {chapter.title}
          </div>
        </div>
        <VariantSwitcher
          value={variant}
          onChange={setVariant}
          availability={{
            draft: Boolean(chapter.manualText?.draft || chapter.draftPath),
            edited: Boolean(chapter.manualText?.edited || chapter.editedPath),
            proofed: Boolean(chapter.manualText?.proofed || chapter.proofedPath),
          }}
        />
      </div>

      <div className="flex-1 min-h-0 px-6 pb-3">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-ink-tertiary dark:text-[#777]">
            Loading chapter…
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            placeholder="Type or paste the chapter prose here. Em-dash `--` autocorrects on blur. Use `*italic*` and `**bold**` sparingly."
            className="w-full h-full text-[15px] leading-relaxed text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] focus:border-brand-orange focus:outline-none rounded-md px-4 py-3 font-serif resize-none"
            spellCheck
          />
        )}
      </div>

      <div className="px-6 pb-5 pt-1 flex items-center justify-between flex-shrink-0 text-[11px] text-ink-tertiary dark:text-[#777]">
        <div>
          {wordCount.toLocaleString()} words
          {typeof chapter.wordCount === 'number' && chapter.wordCount !== wordCount && (
            <span className="ml-2 opacity-70">(was {chapter.wordCount.toLocaleString()})</span>
          )}
        </div>
        <div className="hidden sm:block opacity-75">Cmd/Ctrl+Z undo · Cmd/Ctrl+Shift+Z redo · Cmd/Ctrl+S save now</div>
      </div>
    </div>
  );
}

function VariantSwitcher({
  value,
  onChange,
  availability,
}: {
  value: ProseVariant;
  onChange: (v: ProseVariant) => void;
  availability: Record<ProseVariant, boolean>;
}): JSX.Element {
  const items: Array<{ id: ProseVariant; label: string }> = [
    { id: 'draft', label: 'Raw' },
    { id: 'edited', label: 'Edited' },
    { id: 'proofed', label: 'Final' },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded-full p-0.5 flex-shrink-0">
      {items.map((it) => {
        const active = it.id === value;
        const available = availability[it.id] || active;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            title={available ? `Edit the ${it.label} variant` : `No ${it.label} variant yet — editing will create one`}
            className={`px-3 py-1 text-[11px] rounded-full transition-colors ${
              active
                ? 'bg-white dark:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] font-semibold shadow-sm'
                : available
                  ? 'text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8]'
                  : 'text-ink-tertiary dark:text-[#555]'
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
