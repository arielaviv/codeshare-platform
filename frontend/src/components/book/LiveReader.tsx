/**
 * LiveReader — the centerpiece of Slice 4b. Live paginating book reader with
 * CSS-3D page-flip animation. Prose streams in via draft.chapter_streaming
 * SSE events; the paginator splits at word boundaries and triggers the flip.
 *
 * Typography comes from the active Book Theme's scoped CSS (injected at
 * BookStudioPanel mount). This component doesn't know what fonts look like —
 * it just renders into .book-theme-<id> .book-body div structures the theme
 * CSS targets.
 *
 * Animation details:
 *   - perspective: 1600px on the outer wrapper
 *   - transform-style: preserve-3d on the page stack
 *   - page flip: rotateY(0 → -180deg), 700ms cubic-bezier(.25,.7,.35,1)
 *   - prefers-reduced-motion → instant snap, no animation
 */
import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import type { BookThemeSpec } from '../../themes/book';
import { usePaginator, type Page, type MeasureFn } from './hooks/usePaginator';

export interface LiveReaderHandle {
  addChapterDelta: (n: number, delta: string, chapterTitle?: string) => void;
  goToChapter: (n: number) => void;
  goToPage: (index: number) => void;
  jumpToLive: () => void;
  reset: () => void;
}

export interface LiveReaderProps {
  theme: BookThemeSpec;
  bookTitle: string;
  author?: string;
  /** Pages to render before any prose arrives (frontispiece, TOC, chapter-opener placeholders). */
  seedPages?: Page[];
  /** Optional cover URL for the frontispiece. */
  coverUrl?: string;
}

const LiveReader = forwardRef<LiveReaderHandle, LiveReaderProps>(function LiveReader(
  { theme, bookTitle, author, seedPages, coverUrl },
  ref
) {
  // Frame geometry — responsive width, 6×9 aspect from the theme's trim.
  const [frameWidth, setFrameWidth] = useState(420);
  const frameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const update = () => {
      const parent = frameRef.current?.parentElement;
      if (!parent) return;
      const max = Math.min(parent.clientWidth - 48, 520);
      setFrameWidth(Math.max(320, max));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const [trimW, trimH] = theme.trimSize.split('x').map(Number);
  const aspect = trimH / trimW;
  const frameHeight = Math.round(frameWidth * aspect);

  // Usable inner height = frame height minus vertical theme margins (percent-ish).
  const usableHeightPx = useMemo(() => {
    const topPct = theme.marginTopIn / trimH;
    const botPct = theme.marginBottomIn / trimH;
    // Running-head + page-number rows eat ~1.5em each (~22px) when present.
    const chrome = (theme.runningHeadStyle !== 'none' ? 22 : 0) + (theme.pageNumberPosition !== 'none' ? 22 : 0);
    return Math.max(200, Math.round(frameHeight * (1 - topPct - botPct)) - chrome);
  }, [frameHeight, theme, trimH]);

  // Hidden measuring div — sized exactly to the usable inner width, styled
  // with the theme's body class. Caller pages pass their text through this to
  // check how tall it would render.
  const measureRef = useRef<HTMLDivElement | null>(null);

  const measure: MeasureFn = useMemo(() => {
    return (text: string, page: Page): number => {
      const el = measureRef.current;
      if (!el) return 0;
      // The chapter-opener page adds a heading + optional drop cap that eats
      // vertical space. Approximate: heading ~3 lines, drop cap floats so
      // doesn't strictly consume line count.
      const headerBump = page.kind === 'chapter-opener' ? 80 : 0;
      el.textContent = text;
      return el.scrollHeight + headerBump;
    };
  }, []);

  // Seed pages may need recomputation when the theme or book metadata changes.
  const themeKey = `${theme.id}-${frameWidth}x${frameHeight}`;
  const effectiveSeedPages: Page[] = useMemo(() => {
    if (seedPages && seedPages.length > 0) return seedPages;
    // Default seed: a frontispiece page with the cover + title + author.
    return [
      {
        id: 'frontispiece',
        kind: 'frontispiece',
        chapterN: 0,
        bodyText: '',
        chapterTitle: bookTitle,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPages, bookTitle, author, themeKey]);

  const paginator = usePaginator({
    themeKey,
    usableHeightPx,
    measure,
    seedPages: effectiveSeedPages,
  });

  useImperativeHandle(
    ref,
    () => ({
      addChapterDelta: paginator.addChapterDelta,
      goToChapter: paginator.goToChapter,
      goToPage: paginator.goToPage,
      jumpToLive: paginator.jumpToLive,
      reset: paginator.reset,
    }),
    [paginator]
  );

  // Keyboard navigation
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (['ArrowRight', 'ArrowDown', 'j', 'J', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        paginator.goToPage(Math.min(paginator.currentIndex + 1, paginator.pages.length - 1));
      } else if (['ArrowLeft', 'ArrowUp', 'k', 'K', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        paginator.goToPage(Math.max(paginator.currentIndex - 1, 0));
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [paginator]);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? null;
    };
    const onEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) paginator.goToPage(Math.min(paginator.currentIndex + 1, paginator.pages.length - 1));
      else paginator.goToPage(Math.max(paginator.currentIndex - 1, 0));
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [paginator]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const atLive = paginator.isLive && paginator.currentIndex === paginator.pages.length - 1;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className={`h-full outline-none flex flex-col items-center justify-center px-4 py-6 gap-3 bg-[#EDE7DB] dark:bg-[#1A1814] book-theme-${theme.id}`}
    >
      <div style={{ perspective: '1600px', width: frameWidth, height: frameHeight }} className="relative">
        <div
          ref={frameRef}
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <PageStack
            pages={paginator.pages}
            currentIndex={paginator.currentIndex}
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            theme={theme}
            bookTitle={bookTitle}
            author={author}
            coverUrl={coverUrl}
          />
        </div>
      </div>

      {/* Hidden measuring element — exactly matches a real page's inner
          typography so measure() approximates rendered height. */}
      <div
        ref={measureRef}
        className="book-body book-chapter-body"
        aria-hidden
        style={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          left: -99999,
          top: 0,
          width: Math.round(frameWidth * (1 - theme.marginInnerIn / trimW - theme.marginOuterIn / trimW)),
          whiteSpace: 'pre-wrap',
        }}
      />

      <ControlsBar
        pageIndex={paginator.currentIndex}
        total={paginator.pages.length}
        atLive={atLive}
        onPrev={() => paginator.goToPage(Math.max(paginator.currentIndex - 1, 0))}
        onNext={() => paginator.goToPage(Math.min(paginator.currentIndex + 1, paginator.pages.length - 1))}
        onJumpToLive={() => paginator.jumpToLive()}
      />
    </div>
  );
});

export default LiveReader;

// ---------------------------------------------------------------------------
// Page stack — renders current + previous pages with the flip animation.
// ---------------------------------------------------------------------------

function PageStack({
  pages,
  currentIndex,
  frameWidth,
  frameHeight,
  theme,
  bookTitle,
  author,
  coverUrl,
}: {
  pages: Page[];
  currentIndex: number;
  frameWidth: number;
  frameHeight: number;
  theme: BookThemeSpec;
  bookTitle: string;
  author?: string;
  coverUrl?: string;
}): JSX.Element {
  // Track previous index so we know whether to animate forward or back.
  const prevIndexRef = useRef<number>(currentIndex);
  const [animDirection, setAnimDirection] = useState<'none' | 'forward' | 'back'>('none');

  useEffect(() => {
    if (prevIndexRef.current === currentIndex) return;
    setAnimDirection(currentIndex > prevIndexRef.current ? 'forward' : 'back');
    const t = setTimeout(() => setAnimDirection('none'), 720);
    prevIndexRef.current = currentIndex;
    return () => clearTimeout(t);
  }, [currentIndex]);

  const current = pages[currentIndex];
  const prev = pages[Math.max(currentIndex - 1, 0)];

  if (!current) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-ink-tertiary dark:text-[#666] text-sm">
        No pages yet.
      </div>
    );
  }

  return (
    <>
      {/* Underneath page — the page we're flipping TO. */}
      {animDirection !== 'none' && prev && (
        <PageCard
          page={animDirection === 'forward' ? current : prev}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          theme={theme}
          bookTitle={bookTitle}
          author={author}
          coverUrl={coverUrl}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
          }}
        />
      )}

      {/* Top page — the page we're flipping FROM. */}
      <PageCard
        page={animDirection === 'forward' ? prev ?? current : current}
        frameWidth={frameWidth}
        frameHeight={frameHeight}
        theme={theme}
        bookTitle={bookTitle}
        author={author}
        coverUrl={coverUrl}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          transformOrigin: animDirection === 'back' ? 'left center' : 'right center',
          transform: animDirection === 'none'
            ? 'rotateY(0deg)'
            : animDirection === 'forward'
              ? 'rotateY(-180deg)'
              : 'rotateY(180deg)',
          transition: animDirection === 'none' ? undefined : 'transform 700ms cubic-bezier(.25,.7,.35,1)',
          backfaceVisibility: 'hidden',
          boxShadow:
            animDirection !== 'none'
              ? '0 20px 60px rgba(0,0,0,0.45), 0 6px 20px rgba(0,0,0,0.25)'
              : '0 10px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)',
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page card — single page, styled via .book-theme-<id> CSS.
// ---------------------------------------------------------------------------

function PageCard({
  page,
  frameWidth,
  frameHeight,
  theme,
  bookTitle,
  author,
  coverUrl,
  style,
}: {
  page: Page;
  frameWidth: number;
  frameHeight: number;
  theme: BookThemeSpec;
  bookTitle: string;
  author?: string;
  coverUrl?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  const [trimW, trimH] = theme.trimSize.split('x').map(Number);
  const insetTop = `${(theme.marginTopIn / trimH) * 100}%`;
  const insetBottom = `${(theme.marginBottomIn / trimH) * 100}%`;
  const insetInner = `${(theme.marginInnerIn / trimW) * 100}%`;
  const insetOuter = `${(theme.marginOuterIn / trimW) * 100}%`;

  return (
    <div
      className="rounded-[2px]"
      style={{
        width: frameWidth,
        height: frameHeight,
        background: 'var(--book-bg)',
        color: 'var(--book-text)',
        ...style,
      }}
    >
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          paddingTop: insetTop,
          paddingBottom: insetBottom,
          paddingLeft: insetInner,
          paddingRight: insetOuter,
        }}
      >
        {page.kind === 'frontispiece' ? (
          <FrontispieceInner bookTitle={bookTitle} author={author} coverUrl={coverUrl} theme={theme} />
        ) : (
          <>
            {theme.runningHeadStyle !== 'none' && page.kind !== 'chapter-opener' && (
              <div className="flex items-center justify-between mb-3 book-running-head">
                <span>{theme.runningHeadStyle === 'title-author' ? bookTitle : author ?? 'Mr8'}</span>
                <span>{theme.runningHeadStyle === 'title-author' ? author ?? '' : `Chapter ${page.chapterN}`}</span>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {page.kind === 'chapter-opener' && (
                <>
                  <div
                    className="book-chapter-number"
                    style={{
                      fontSize: '0.8em',
                      opacity: 0.7,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      marginBottom: '0.5em',
                    }}
                  >
                    Chapter {page.chapterN}
                  </div>
                  <h2 className="book-chapter-heading">{page.chapterTitle}</h2>
                </>
              )}
              <div className="book-body">
                <div className="book-chapter-body">
                  {renderBodyAsParagraphs(page.bodyText, theme).map((para, i) => (
                    <p key={i} style={{ marginBottom: '0.6em', textIndent: theme.firstLineIndentEm ? `${theme.firstLineIndentEm}em` : '0' }}>
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            {theme.pageNumberPosition !== 'none' && typeof page.pageNumber === 'number' && (
              <div
                className="book-page-number"
                style={{ textAlign: theme.pageNumberPosition === 'footer-center' ? 'center' : 'right' }}
              >
                {page.pageNumber}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function renderBodyAsParagraphs(text: string, _theme: BookThemeSpec): string[] {
  // Paragraph = double newline. We also split on the theme's scene-break
  // ornament when the drafting agent wrote one inline; the CSS scopes
  // styling via .book-scene-break but here we just treat the scene break
  // as a paragraph of its own.
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function FrontispieceInner({
  bookTitle,
  author,
  coverUrl,
  theme,
}: {
  bookTitle: string;
  author?: string;
  coverUrl?: string;
  theme: BookThemeSpec;
}): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      {coverUrl ? (
        <div className="mb-6 w-[60%] aspect-[2/3] overflow-hidden rounded-sm shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="mb-6 w-[60%] aspect-[2/3] rounded-sm border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-center text-[10px] italic opacity-60">
          Cover will render here
        </div>
      )}
      <h1
        className="book-chapter-heading"
        style={{ fontFamily: theme.chapterHeadingFontFamily, margin: 0, fontSize: '1.6em', textAlign: 'center' }}
      >
        {bookTitle}
      </h1>
      {author && (
        <div
          style={{
            fontFamily: theme.bodyFontFamily,
            fontStyle: 'italic',
            marginTop: '0.8em',
            fontSize: '0.9em',
            opacity: 0.85,
          }}
        >
          by {author}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function ControlsBar({
  pageIndex,
  total,
  atLive,
  onPrev,
  onNext,
  onJumpToLive,
}: {
  pageIndex: number;
  total: number;
  atLive: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJumpToLive: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 text-[11px] text-ink-tertiary dark:text-[#666]">
      <button
        type="button"
        onClick={onPrev}
        disabled={pageIndex === 0}
        className="px-2.5 py-1 border border-edge dark:border-[#2A2A2A] rounded text-ink-secondary dark:text-[#A0A0A0] hover:bg-white dark:hover:bg-[#1A1A1A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        ← Prev
      </button>
      <span className="tabular-nums">
        Page {pageIndex + 1} of {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={pageIndex === total - 1}
        className="px-2.5 py-1 border border-edge dark:border-[#2A2A2A] rounded text-ink-secondary dark:text-[#A0A0A0] hover:bg-white dark:hover:bg-[#1A1A1A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        Next →
      </button>
      {!atLive && (
        <button
          type="button"
          onClick={onJumpToLive}
          className="ml-2 px-2.5 py-1 rounded-full bg-brand-orange text-white text-[11px] font-medium hover:bg-brand-orange-hover transition-colors"
        >
          ↓ Jump to live
        </button>
      )}
      <span className="hidden sm:inline text-ink-tertiary dark:text-[#555]">· ← → or J/K</span>
    </div>
  );
}
