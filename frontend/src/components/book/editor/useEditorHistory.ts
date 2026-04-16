import { useCallback, useRef, useState } from 'react';

/**
 * Minimal undo/redo hook for the inline Book Editor. Stores full snapshots
 * of the editor's tracked value (string, array, or plain object) up to a
 * configurable cap. Pushes are quiescence-debounced so a burst of typing
 * collapses to a single history entry instead of 200.
 *
 * Keep the tracked value small — this isn't designed for large DOM trees.
 * For chapter prose it's plain markdown strings, which is fine.
 */
export interface EditorHistory<T> {
  push(next: T): void;
  undo(): T | null;
  redo(): T | null;
  canUndo: boolean;
  canRedo: boolean;
  reset(initial: T): void;
}

export function useEditorHistory<T>(initial: T, opts?: { quiesceMs?: number; max?: number }): EditorHistory<T> {
  const quiesceMs = opts?.quiesceMs ?? 500;
  const max = opts?.max ?? 50;

  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const currentRef = useRef<T>(initial);
  const pendingRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  const commitPending = useCallback(() => {
    if (pendingRef.current === null) return;
    pastRef.current.push(currentRef.current);
    if (pastRef.current.length > max) pastRef.current.shift();
    currentRef.current = pendingRef.current;
    pendingRef.current = null;
    futureRef.current = []; // any new change invalidates the redo stack
    rerender();
  }, [max, rerender]);

  const push = useCallback(
    (next: T) => {
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        commitPending();
        timerRef.current = null;
      }, quiesceMs);
    },
    [commitPending, quiesceMs]
  );

  const undo = useCallback((): T | null => {
    // Flush any pending burst so the "undo" unwinds the latest visible state.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      commitPending();
    }
    const prev = pastRef.current.pop();
    if (prev === undefined) return null;
    futureRef.current.push(currentRef.current);
    currentRef.current = prev;
    rerender();
    return prev;
  }, [commitPending, rerender]);

  const redo = useCallback((): T | null => {
    const next = futureRef.current.pop();
    if (next === undefined) return null;
    pastRef.current.push(currentRef.current);
    currentRef.current = next;
    rerender();
    return next;
  }, [rerender]);

  const reset = useCallback(
    (initialValue: T) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pastRef.current = [];
      futureRef.current = [];
      currentRef.current = initialValue;
      pendingRef.current = null;
      rerender();
    },
    [rerender]
  );

  return {
    push,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    reset,
  };
}
