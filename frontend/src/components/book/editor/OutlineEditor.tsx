/**
 * OutlineEditor — chapter list editor. Rename, reorder (HTML5 drag), edit
 * beat, edit target length, insert a new chapter between rows, delete.
 * Persists via PUT `/books/:id/chapters` with the full reordered array.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

export interface OutlineChapter {
  n: number;
  title: string;
  beat: string;
  estimatedWords: number;
  status?: string;
  wordCount?: number;
  draftPath?: string;
  editedPath?: string;
  proofedPath?: string;
}

interface Props {
  chapters: OutlineChapter[];
  onReplace: (next: OutlineChapter[]) => Promise<void> | void;
}

const SAVE_DEBOUNCE_MS = 1000;
const MAX_CHAPTERS = 60;

export default function OutlineEditor({ chapters, onReplace }: Props): JSX.Element {
  const [local, setLocal] = useState<OutlineChapter[]>(chapters);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(JSON.stringify(chapters));

  useEffect(() => {
    setLocal(chapters);
    lastSavedRef.current = JSON.stringify(chapters);
  }, [chapters]);

  const schedulePersist = useCallback(
    (next: OutlineChapter[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const snapshot = JSON.stringify(next);
        if (snapshot === lastSavedRef.current) return;
        try {
          await onReplace(next);
          lastSavedRef.current = snapshot;
        } catch {
          // ignore — user can retry
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [onReplace]
  );

  const renumber = (list: OutlineChapter[]): OutlineChapter[] =>
    list.map((c, i) => ({ ...c, n: i + 1 }));

  const update = (idx: number, patch: Partial<OutlineChapter>) => {
    setLocal((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      schedulePersist(next);
      return next;
    });
  };

  const insert = (afterIdx: number) => {
    setLocal((prev) => {
      if (prev.length >= MAX_CHAPTERS) return prev;
      const blank: OutlineChapter = {
        n: 0,
        title: 'New chapter',
        beat: '',
        estimatedWords: 300,
      };
      const next = renumber([...prev.slice(0, afterIdx + 1), blank, ...prev.slice(afterIdx + 1)]);
      schedulePersist(next);
      return next;
    });
  };

  const remove = (idx: number) => {
    const ch = local[idx];
    const hasProse = Boolean(
      ch.draftPath || ch.editedPath || ch.proofedPath || (ch.wordCount && ch.wordCount > 0)
    );
    if (hasProse) {
      const ok = window.confirm(
        `Chapter ${ch.n} "${ch.title}" has drafted prose. Delete it anyway? (The prose is archived on the server and can be recovered.)`
      );
      if (!ok) return;
    }
    setLocal((prev) => {
      if (prev.length <= 1) return prev;
      const next = renumber(prev.filter((_, i) => i !== idx));
      schedulePersist(next);
      return next;
    });
  };

  const onDragStart = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const onDragOver = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };
  const onDrop = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const from = dragIdx;
    setDragIdx(null);
    setOverIdx(null);
    if (from === null || from === idx) return;
    setLocal((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      const renumbered = renumber(next);
      schedulePersist(renumbered);
      return renumbered;
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-2">
      <div className="text-[11px] text-ink-tertiary dark:text-[#777] mb-3">
        Drag the handle to reorder. Click a title or beat to edit. Chapter numbers renumber automatically.
      </div>
      {local.map((ch, idx) => (
        <div key={`${ch.n}-${idx}`} className="group">
          <div
            className={`flex items-start gap-2 p-3 rounded-md border bg-white dark:bg-[#141414] transition-colors ${
              overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? 'border-brand-orange ring-2 ring-brand-orange/20'
                : 'border-edge dark:border-[#2A2A2A]'
            } ${dragIdx === idx ? 'opacity-50' : ''}`}
            draggable
            onDragStart={onDragStart(idx)}
            onDragOver={onDragOver(idx)}
            onDrop={onDrop(idx)}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
          >
            <div className="flex flex-col items-center pt-1.5 flex-shrink-0 w-7">
              <GripVertical
                size={16}
                className="text-ink-tertiary dark:text-[#555] cursor-grab active:cursor-grabbing"
              />
              <span className="text-[10px] text-ink-tertiary dark:text-[#666] mt-1 tabular-nums">
                {ch.n}
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <input
                type="text"
                value={ch.title}
                onChange={(e) => update(idx, { title: e.target.value })}
                maxLength={200}
                className="w-full text-sm font-semibold text-ink dark:text-[#E8E8E8] bg-transparent border-0 border-b border-transparent hover:border-edge dark:hover:border-[#2A2A2A] focus:border-brand-orange focus:outline-none pb-0.5 transition-colors"
              />
              <textarea
                value={ch.beat}
                onChange={(e) => update(idx, { beat: e.target.value })}
                maxLength={3000}
                rows={2}
                className="w-full text-[12px] text-ink-secondary dark:text-[#B0B0B0] bg-transparent border border-transparent hover:border-edge dark:hover:border-[#2A2A2A] focus:border-brand-orange focus:outline-none rounded px-2 py-1.5 leading-relaxed transition-colors resize-none"
                placeholder="Beat — what happens in this chapter?"
              />
              <div className="flex items-center gap-3 text-[11px] text-ink-tertiary dark:text-[#777]">
                <label className="flex items-center gap-1.5">
                  Target
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={ch.estimatedWords}
                    onChange={(e) => update(idx, { estimatedWords: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    className="w-20 text-right tabular-nums bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded px-1.5 py-0.5 text-ink dark:text-[#E8E8E8]"
                  />
                  <span className="text-ink-tertiary dark:text-[#777]">words</span>
                </label>
                {typeof ch.wordCount === 'number' && ch.wordCount > 0 && (
                  <span className="text-ink-tertiary dark:text-[#777]">
                    · drafted {ch.wordCount.toLocaleString()}
                  </span>
                )}
                {ch.status && ch.status !== 'pending' && (
                  <span className="px-1.5 py-0.5 rounded bg-surface-secondary dark:bg-[#1A1A1A] uppercase tracking-wider text-[9px]">
                    {ch.status}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={local.length <= 1}
              title="Delete chapter"
              className="flex-shrink-0 w-7 h-7 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-ink-tertiary dark:text-[#555] hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={`Delete chapter ${ch.n}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {idx < local.length - 1 && (
            <button
              type="button"
              onClick={() => insert(idx)}
              className="w-full h-4 flex items-center justify-center text-ink-tertiary dark:text-[#555] hover:text-brand-orange transition-colors opacity-0 group-hover:opacity-100 hover:opacity-100"
              aria-label={`Insert chapter after ${ch.n}`}
            >
              <span className="inline-flex items-center gap-1 text-[11px]">
                <Plus size={12} /> Insert
              </span>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => insert(local.length - 1)}
        disabled={local.length >= MAX_CHAPTERS}
        className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-md border border-dashed border-edge dark:border-[#2A2A2A] text-ink-tertiary dark:text-[#777] hover:text-brand-orange hover:border-brand-orange transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={14} /> Add chapter
      </button>
    </div>
  );
}
