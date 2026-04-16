/**
 * usePaginator — headless paginator for the Live Reader.
 *
 * Contract:
 *   - Callers stream text in per-chapter via `addChapterDelta(n, text)`.
 *   - A new chapter (n changes) forces a chapter-opener page.
 *   - Each page's content is measured against its theme-specific geometry;
 *     on overflow we split at the nearest word boundary and move the tail
 *     to a new page. The split is deterministic — re-running with the same
 *     inputs always produces the same break points.
 *
 * Returns Page[] + currentIndex + navigation handles. The viewer component
 * (LiveReader.tsx) decides how to animate between pages — this hook knows
 * nothing about CSS, DOM, or animation.
 *
 * CRITICAL IMPLEMENTATION NOTE — stream-safe synchronous state:
 *   Anthropic streams prose at 30–50 deltas/second. React's dispatch is
 *   asynchronous (batched for render). If addChapterDelta reads pages from
 *   useState/useReducer's CURRENT closure value, rapid-fire calls all see
 *   the same stale base state — each computes `grown = lastPage + its own
 *   delta` from the same starting point, the last dispatch wins, and
 *   earlier deltas are silently dropped (observed as garbled chapter prose
 *   + wrong chapter headers).
 *
 *   Fix: keep authoritative pages in a ref that updates synchronously
 *   inside addChapterDelta. Dispatch only drives re-render; the ref is
 *   the truth.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

export type PageKind = 'frontispiece' | 'outline-summary' | 'chapter-opener' | 'chapter-body';

export interface Page {
  id: string;
  kind: PageKind;
  /** Associated chapter number; frontispiece/outline-summary set to 0. */
  chapterN: number;
  /** Human-visible page number (starts from 1 at the first chapter opener). */
  pageNumber?: number;
  /** Plain text content rendered in the body slot. */
  bodyText: string;
  /** For chapter-opener pages: the chapter title (rendered in the theme's heading style). */
  chapterTitle?: string;
}

export type MeasureFn = (htmlOrText: string, page: Page) => number;

interface State {
  pages: Page[];
  currentIndex: number;
  /** Whether auto-advance should follow new pages as they're appended. */
  isLive: boolean;
}

type Action =
  | { type: 'set-pages'; pages: Page[]; currentIndex?: number; isLive?: boolean }
  | { type: 'set-current'; index: number; isLive: boolean }
  | { type: 'reset'; seedPages: Page[] };

const initialState: State = {
  pages: [],
  currentIndex: 0,
  isLive: true,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set-pages': {
      return {
        ...state,
        pages: action.pages,
        currentIndex: action.currentIndex ?? state.currentIndex,
        isLive: action.isLive ?? state.isLive,
      };
    }
    case 'set-current': {
      return { ...state, currentIndex: action.index, isLive: action.isLive };
    }
    case 'reset':
      return { pages: action.seedPages, currentIndex: 0, isLive: true };
    default:
      return state;
  }
}

export interface UsePaginatorOptions {
  /** Stable key that changes when typography/trim changes, forcing a full re-paginate. */
  themeKey: string;
  /** Usable inner height in px for measuring overflow. Pass the container's computed inner height. */
  usableHeightPx: number;
  /** Measure the rendered height of a page's body text. Caller provides this. */
  measure: MeasureFn;
  /** Pages to start with — frontispiece, outline-summary, etc. */
  seedPages?: Page[];
}

export interface UsePaginator {
  pages: Page[];
  currentIndex: number;
  isLive: boolean;

  /** Append text to the current chapter. If chapterN is new, force a new chapter-opener page. */
  addChapterDelta(n: number, delta: string, chapterTitle?: string): void;

  /** Jump to a specific page by index. Disables isLive. */
  goToPage(index: number): void;

  /** Jump to the first page of a given chapter. Disables isLive. */
  goToChapter(n: number): void;

  /** Resume following the writer's head. */
  jumpToLive(): void;

  /** Reset all pages. Caller typically passes new seedPages after reset. */
  reset(): void;
}

function makeId(): string {
  return `pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function usePaginator(opts: UsePaginatorOptions): UsePaginator {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Authoritative pages state — mutated synchronously inside addChapterDelta
  // so rapid-fire SSE deltas see each other's writes. state.pages is only for
  // triggering re-renders.
  const pagesRef = useRef<Page[]>([]);
  const highestChapterRef = useRef<number>(0);
  const isLiveRef = useRef<boolean>(true);
  const currentIndexRef = useRef<number>(0);

  // Keep refs in sync with the reducer state for paths that might bypass
  // addChapterDelta (goToPage / goToChapter / jumpToLive all go through
  // dispatch but also update refs directly below).
  useEffect(() => {
    pagesRef.current = state.pages;
    currentIndexRef.current = state.currentIndex;
    isLiveRef.current = state.isLive;
  }, [state.pages, state.currentIndex, state.isLive]);

  // Seed / re-seed when themeKey changes (full re-paginate trigger).
  useEffect(() => {
    const seed = opts.seedPages ?? [];
    pagesRef.current = seed;
    highestChapterRef.current = 0;
    currentIndexRef.current = 0;
    isLiveRef.current = true;
    dispatch({ type: 'reset', seedPages: seed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.themeKey]);

  const addChapterDelta = useCallback(
    (n: number, delta: string, chapterTitle?: string) => {
      if (!delta) return;

      // Snapshot the ref — this is the synchronous truth.
      let pages = pagesRef.current;
      const nextPages = pages.slice();
      const usableHeightPx = opts.usableHeightPx;
      const measure = opts.measure;

      // Determine if we need a new chapter-opener page.
      const lastBodyPage = findLastBodyOrOpener(nextPages);
      const needNewOpener = n > highestChapterRef.current;

      if (needNewOpener) {
        // Push a chapter-opener page containing the first delta.
        const openerPage: Page = {
          id: makeId(),
          kind: 'chapter-opener',
          chapterN: n,
          chapterTitle: chapterTitle ?? `Chapter ${n}`,
          bodyText: delta,
          pageNumber: nextPageNumber(nextPages),
        };
        highestChapterRef.current = n;

        // Does the opener + delta fit on one page?
        const measured = measure(openerPage.bodyText, openerPage);
        if (measured <= usableHeightPx) {
          nextPages.push(openerPage);
        } else {
          const { fit, overflow } = splitByMeasure(openerPage.bodyText, usableHeightPx, (text) =>
            measure(text, openerPage)
          );
          nextPages.push({ ...openerPage, bodyText: fit });
          if (overflow) {
            spillIntoBodyPages(overflow, n, nextPages, usableHeightPx, measure);
          }
        }
      } else if (!lastBodyPage || lastBodyPage.chapterN !== n) {
        // Same-chapter edge: deltas arrived for n but last page is a
        // different chapter (shouldn't happen if deltas arrive in order,
        // but guard defensively). Open a body page for the current chapter.
        const bodyPage: Page = {
          id: makeId(),
          kind: 'chapter-body',
          chapterN: n,
          bodyText: delta,
          pageNumber: nextPageNumber(nextPages),
        };
        const measured = measure(bodyPage.bodyText, bodyPage);
        if (measured <= usableHeightPx) {
          nextPages.push(bodyPage);
        } else {
          const { fit, overflow } = splitByMeasure(bodyPage.bodyText, usableHeightPx, (text) =>
            measure(text, bodyPage)
          );
          nextPages.push({ ...bodyPage, bodyText: fit });
          if (overflow) {
            spillIntoBodyPages(overflow, n, nextPages, usableHeightPx, measure);
          }
        }
      } else {
        // Same chapter → grow the last page. If it overflows, split.
        const lastIdx = nextPages.lastIndexOf(lastBodyPage);
        if (lastIdx < 0) return; // defensive
        const grown: Page = { ...lastBodyPage, bodyText: lastBodyPage.bodyText + delta };
        const measured = measure(grown.bodyText, grown);
        if (measured <= usableHeightPx) {
          nextPages[lastIdx] = grown;
        } else {
          const { fit, overflow } = splitByMeasure(grown.bodyText, usableHeightPx, (text) =>
            measure(text, grown)
          );
          nextPages[lastIdx] = { ...grown, bodyText: fit };
          if (overflow) {
            spillIntoBodyPages(overflow, n, nextPages, usableHeightPx, measure);
          }
        }
      }

      // SYNCHRONOUS ref write — critical for stream safety.
      pagesRef.current = nextPages;
      const nextIndex = isLiveRef.current ? nextPages.length - 1 : currentIndexRef.current;
      currentIndexRef.current = nextIndex;

      // Trigger a re-render with the new pages.
      dispatch({
        type: 'set-pages',
        pages: nextPages,
        currentIndex: nextIndex,
        isLive: isLiveRef.current,
      });
    },
    [opts.measure, opts.usableHeightPx]
  );

  const goToPage = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, pagesRef.current.length - 1));
    currentIndexRef.current = clamped;
    isLiveRef.current = false;
    dispatch({ type: 'set-current', index: clamped, isLive: false });
  }, []);

  const goToChapter = useCallback((n: number) => {
    const idx = pagesRef.current.findIndex((p) => p.chapterN === n && p.kind === 'chapter-opener');
    if (idx >= 0) {
      currentIndexRef.current = idx;
      isLiveRef.current = false;
      dispatch({ type: 'set-current', index: idx, isLive: false });
    }
  }, []);

  const jumpToLive = useCallback(() => {
    const idx = pagesRef.current.length - 1;
    currentIndexRef.current = idx;
    isLiveRef.current = true;
    dispatch({ type: 'set-current', index: idx, isLive: true });
  }, []);

  const reset = useCallback(() => {
    const seed = opts.seedPages ?? [];
    pagesRef.current = seed;
    highestChapterRef.current = 0;
    currentIndexRef.current = 0;
    isLiveRef.current = true;
    dispatch({ type: 'reset', seedPages: seed });
  }, [opts.seedPages]);

  return useMemo(
    () => ({
      pages: state.pages,
      currentIndex: state.currentIndex,
      isLive: state.isLive,
      addChapterDelta,
      goToPage,
      goToChapter,
      jumpToLive,
      reset,
    }),
    [state.pages, state.currentIndex, state.isLive, addChapterDelta, goToPage, goToChapter, jumpToLive, reset]
  );
}

// ---------------------------------------------------------------------------
// Split + measurement helpers
// ---------------------------------------------------------------------------

function findLastBodyOrOpener(pages: Page[]): Page | null {
  for (let i = pages.length - 1; i >= 0; i--) {
    const p = pages[i];
    if (p.kind === 'chapter-opener' || p.kind === 'chapter-body') return p;
  }
  return null;
}

function splitByMeasure(
  text: string,
  maxHeight: number,
  measure: (candidate: string) => number
): { fit: string; overflow: string } {
  if (measure(text) <= maxHeight) return { fit: text, overflow: '' };

  // Binary search on token boundaries (whitespace-preserving split so we
  // don't lose spacing or mid-word content).
  const words = text.split(/(\s+)/);
  let lo = 0;
  let hi = words.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = words.slice(0, mid).join('');
    if (measure(candidate) <= maxHeight) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Walk back to a whitespace token boundary so we never split a word.
  let end = best;
  while (end > 0 && !/^\s+$/.test(words[end - 1])) end -= 1;
  if (end === 0) end = best; // no whitespace found — hard boundary fallback

  const fit = words.slice(0, end).join('').replace(/\s+$/, '');
  const overflow = words.slice(end).join('').replace(/^\s+/, '');
  return { fit, overflow };
}

function nextPageNumber(pages: Page[]): number {
  let max = 0;
  for (const p of pages) {
    if (typeof p.pageNumber === 'number' && p.pageNumber > max) max = p.pageNumber;
  }
  return max + 1;
}

function spillIntoBodyPages(
  overflow: string,
  chapterN: number,
  nextPages: Page[],
  usableHeightPx: number,
  measure: MeasureFn
): void {
  let remaining = overflow;
  let iterations = 0;
  const MAX_ITERS = 30;
  while (remaining.length > 0 && iterations < MAX_ITERS) {
    iterations += 1;
    const trial: Page = {
      id: makeId(),
      kind: 'chapter-body',
      chapterN,
      bodyText: remaining,
      pageNumber: nextPageNumber(nextPages),
    };
    const measured = measure(trial.bodyText, trial);
    if (measured <= usableHeightPx) {
      nextPages.push(trial);
      return;
    }
    const { fit, overflow: next } = splitByMeasure(remaining, usableHeightPx, (text) =>
      measure(text, trial)
    );
    nextPages.push({ ...trial, bodyText: fit });
    remaining = next;
  }
}
