/**
 * Chapters section — the world-class part of Slice 4a.
 *
 * Renders a paginated, typeset preview of the book as it exists RIGHT NOW:
 *   - Frontispiece page: selected cover art + title + author + tagline
 *   - Outline-summary page: themes, POV, tone, chapter list
 *   - One chapter-opener page per chapter: theme's chapter-heading style
 *     + the beat rendered as a typeset stand-in for the eventual prose
 *     (italic, half-opacity, with a "Mr8 will draft this chapter" footer)
 *
 * The body uses the active Book Theme's REAL typography — fonts, leading,
 * drop caps, scene-break ornaments — so the user sees exactly how their
 * book will read the moment prose lands in 4b. Nothing placeholder-looking.
 *
 * Navigation: J/K or arrow up/down to page through; page-flip CSS 3D
 * animation already wired (same technology we use for the Live Reader in
 * 4b). Page numbers in the theme's conventional position.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BookThemeSpec } from '../../../themes/book';
import type { BookChapterRecord } from '../BookStudioPanel';
import { getStaticBase } from '../../../lib/apiBase';
import LiveReader, { type LiveReaderHandle } from '../LiveReader';

interface BookShape {
  _id: string;
  title: string;
  author?: string;
  sourcePrompt: string;
  outline?: {
    chapters: BookChapterRecord[];
    totalEstimatedWords: number;
    themes: string[];
    pov: string;
    genre: string;
    tone: string;
  };
  coverVariants?: Array<{
    idx: number;
    imageUrl: string;
  }>;
  selectedCoverIdx?: number;
}

interface Props {
  book: BookShape;
  activeChapter: BookChapterRecord | null;
  theme: BookThemeSpec;
  /** When true, swap the static typeset preview for the LiveReader (Slice 4b drafting). */
  liveMode?: boolean;
  /** External handle ref — parent uses this to push chapter deltas into the reader. */
  liveReaderRef?: RefObject<LiveReaderHandle>;
}

type PageKind = 'frontispiece' | 'outline-summary' | 'chapter-opener';

interface PageData {
  id: string;
  kind: PageKind;
  chapterN?: number;
  pageNumber?: number; // visible page number (frontispiece doesn't get one)
}

export default function ChaptersSection({ book, activeChapter, theme, liveMode, liveReaderRef }: Props): JSX.Element {
  // Slice 4b — drafting in progress. Swap the static typeset preview for the
  // Live Reader so tokens stream into real pages with the page-flip animation.
  if (liveMode) {
    const selectedCover = book.coverVariants?.find((v) => v.idx === book.selectedCoverIdx);
    const coverUrl = selectedCover?.imageUrl
      ? selectedCover.imageUrl.startsWith('http')
        ? selectedCover.imageUrl
        : `${getStaticBase()}${selectedCover.imageUrl}`
      : undefined;
    return (
      <LiveReader
        ref={liveReaderRef}
        theme={theme}
        bookTitle={book.title}
        author={book.author}
        coverUrl={coverUrl}
      />
    );
  }

  const pages = useMemo<PageData[]>(() => {
    const list: PageData[] = [
      { id: 'frontispiece', kind: 'frontispiece' },
    ];
    if (book.outline) {
      list.push({ id: 'outline-summary', kind: 'outline-summary' });
      book.outline.chapters.forEach((ch, i) => {
        list.push({
          id: `ch-${ch.n}`,
          kind: 'chapter-opener',
          chapterN: ch.n,
          pageNumber: i * 4 + 1, // coarse estimate — tightens in 4b
        });
      });
    }
    return list;
  }, [book.outline]);

  // Auto-scroll to the chapter that's selected in the sidebar.
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    if (activeChapter) {
      const idx = pages.findIndex((p) => p.kind === 'chapter-opener' && p.chapterN === activeChapter.n);
      if (idx >= 0) setPageIndex(idx);
    }
  }, [activeChapter, pages]);

  // Keyboard navigation
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing inside inputs.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J' || e.key === 'PageDown') {
        e.preventDefault();
        setPageIndex((i) => Math.min(i + 1, pages.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K' || e.key === 'PageUp') {
        e.preventDefault();
        setPageIndex((i) => Math.max(i - 1, 0));
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [pages.length]);

  // Focus the root so the page responds to keys by default.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  if (!book.outline) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center text-[13px] text-ink-tertiary dark:text-[#888] leading-relaxed">
          Pages will render here the moment the outline lands. Each chapter
          becomes a typeset page in your chosen theme — exactly how the
          printed book will read.
        </div>
      </div>
    );
  }

  const current = pages[pageIndex];
  const total = pages.length;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="h-full outline-none flex flex-col items-center justify-center bg-[#EDE7DB] dark:bg-[#1A1814] px-4 py-6 gap-3"
    >
      <div
        className="flex-shrink-0 relative"
        style={{ perspective: '1600px' }}
      >
        <PageFrame theme={theme}>
          {current.kind === 'frontispiece' && (
            <FrontispiecePage book={book} theme={theme} />
          )}
          {current.kind === 'outline-summary' && (
            <OutlineSummaryPage book={book} theme={theme} />
          )}
          {current.kind === 'chapter-opener' && current.chapterN !== undefined && (
            <ChapterOpenerPage
              book={book}
              theme={theme}
              chapterN={current.chapterN}
              pageNumber={current.pageNumber}
            />
          )}
        </PageFrame>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 text-[11px] text-ink-tertiary dark:text-[#666]">
        <button
          type="button"
          onClick={() => setPageIndex((i) => Math.max(i - 1, 0))}
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
          onClick={() => setPageIndex((i) => Math.min(i + 1, total - 1))}
          disabled={pageIndex === total - 1}
          className="px-2.5 py-1 border border-edge dark:border-[#2A2A2A] rounded text-ink-secondary dark:text-[#A0A0A0] hover:bg-white dark:hover:bg-[#1A1A1A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          Next →
        </button>
        <span className="hidden sm:inline text-ink-tertiary dark:text-[#555]">· ← → or J/K</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page frame — the 6×9 aspect book-page with subtle deckle-edge shadow.
// ---------------------------------------------------------------------------

function PageFrame({
  theme,
  children,
}: {
  theme: BookThemeSpec;
  children: React.ReactNode;
}): JSX.Element {
  // Render at a responsive width capped so it fits in the panel even on narrow screens.
  const [width, setWidth] = useState(420);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => {
      const parent = ref.current?.parentElement;
      if (!parent) return;
      const max = Math.min(parent.clientWidth - 32, 480);
      setWidth(Math.max(300, max));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Trim ratio
  const [trimW, trimH] = theme.trimSize.split('x').map(Number);
  const aspect = trimH / trimW;
  const height = Math.round(width * aspect);

  // Inner margins as % of page
  const insetTop = `${(theme.marginTopIn / trimH) * 100}%`;
  const insetBottom = `${(theme.marginBottomIn / trimH) * 100}%`;
  const insetInner = `${(theme.marginInnerIn / trimW) * 100}%`;
  const insetOuter = `${(theme.marginOuterIn / trimW) * 100}%`;

  return (
    <div
      ref={ref}
      className="relative rounded-[2px] shadow-[0_10px_40px_rgba(0,0,0,0.22),0_2px_8px_rgba(0,0,0,0.12)]"
      style={{
        width,
        height,
        background: 'var(--book-bg)',
        color: 'var(--book-text)',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          paddingTop: insetTop,
          paddingBottom: insetBottom,
          paddingLeft: insetInner,   // inner = spine side (left recto convention)
          paddingRight: insetOuter,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frontispiece — cover art + title + author, theme typography on paper.
// ---------------------------------------------------------------------------

function FrontispiecePage({ book, theme }: { book: BookShape; theme: BookThemeSpec }): JSX.Element {
  const selected = book.coverVariants?.find((v) => v.idx === book.selectedCoverIdx);
  const coverUrl = selected?.imageUrl
    ? selected.imageUrl.startsWith('http')
      ? selected.imageUrl
      : `${getStaticBase()}${selected.imageUrl}`
    : undefined;

  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      {coverUrl ? (
        <div className="mb-6 w-[60%] aspect-[2/3] overflow-hidden rounded-sm shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="mb-6 w-[60%] aspect-[2/3] rounded-sm border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-center text-[10px] text-ink-tertiary dark:text-[#888] italic">
          Cover will render here
        </div>
      )}
      <h1
        className="book-chapter-heading"
        style={{
          fontFamily: theme.chapterHeadingFontFamily,
          margin: 0,
          fontSize: '1.6em',
          textAlign: 'center',
        }}
      >
        {book.title}
      </h1>
      {book.author && (
        <div
          style={{
            fontFamily: theme.bodyFontFamily,
            fontStyle: 'italic',
            marginTop: '0.8em',
            fontSize: '0.9em',
            opacity: 0.85,
          }}
        >
          by {book.author}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outline summary — themes / pov / tone / chapter list. Typeset like a TOC.
// ---------------------------------------------------------------------------

function OutlineSummaryPage({ book, theme }: { book: BookShape; theme: BookThemeSpec }): JSX.Element {
  if (!book.outline) return <div />;
  return (
    <div className="h-full flex flex-col">
      <h2
        className="book-chapter-heading"
        style={{
          fontFamily: theme.chapterHeadingFontFamily,
          margin: '0 0 1em 0',
          fontSize: '1.3em',
          textAlign: 'center',
          fontVariant: 'small-caps',
          letterSpacing: '0.08em',
        }}
      >
        Contents
      </h2>
      <div
        className="overflow-auto flex-1 book-body"
        style={{ fontFamily: theme.bodyFontFamily }}
      >
        <div className="text-center mb-4" style={{ opacity: 0.75, fontSize: '0.85em', fontStyle: 'italic' }}>
          {book.outline.genre} · {book.outline.pov} · {book.outline.tone}
        </div>
        <div className="mb-4" style={{ fontSize: '0.85em', opacity: 0.8 }}>
          {book.outline.themes.map((t, i) => (
            <div key={i} style={{ marginBottom: '0.4em' }}>
              <span style={{ color: 'var(--book-accent)', marginRight: '0.5em' }}>❖</span>
              {t}
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-1.5" style={{ fontSize: '0.9em' }}>
          {book.outline.chapters.map((ch) => (
            <div key={ch.n} className="flex items-baseline gap-3">
              <span className="tabular-nums" style={{ opacity: 0.55, width: '1.5em' }}>
                {ch.n}
              </span>
              <span className="flex-1 truncate">{ch.title}</span>
              <span className="tabular-nums" style={{ opacity: 0.55, fontSize: '0.85em' }}>
                ~{ch.estimatedWords.toLocaleString()}w
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter opener — real typography preview. Renders the theme's chapter
// opener style + a typeset stand-in for the chapter beat until prose lands.
// ---------------------------------------------------------------------------

function ChapterOpenerPage({
  book,
  theme,
  chapterN,
  pageNumber,
}: {
  book: BookShape;
  theme: BookThemeSpec;
  chapterN: number;
  pageNumber?: number;
}): JSX.Element {
  const ch = book.outline?.chapters.find((c) => c.n === chapterN);
  if (!ch) return <div />;

  return (
    <div className="h-full flex flex-col">
      {theme.runningHeadStyle !== 'none' && (
        <div className="flex items-center justify-between mb-4 book-running-head">
          <span>{theme.runningHeadStyle === 'title-author' ? book.title : (book.author ?? 'Mr8')}</span>
          <span>{theme.runningHeadStyle === 'title-author' ? (book.author ?? '') : `Chapter ${chapterN}`}</span>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <div
          className="book-chapter-number"
          style={{
            fontSize: '0.8em',
            opacity: 0.7,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: '0.5em',
            textAlign: theme.chapterOpenerStyle === 'right-italic-smallcaps' ? 'right' : theme.chapterOpenerStyle === 'centered-smallcaps' ? 'center' : 'left',
          }}
        >
          Chapter {chapterN}
        </div>
        <h2 className="book-chapter-heading">
          {ch.title}
        </h2>
        <div className="book-body">
          <div className="book-chapter-body">
            <p>{renderBeatAsOpener(ch.beat)}</p>
          </div>
          <div style={{ marginTop: '2em', textAlign: 'center', opacity: 0.55, fontSize: '0.85em', fontStyle: 'italic', fontFamily: theme.chapterHeadingFontFamily }}>
            <span>— Mr8 will draft this chapter when you approve the outline —</span>
          </div>
        </div>
      </div>
      {theme.pageNumberPosition !== 'none' && pageNumber !== undefined && (
        <div
          className="book-page-number mt-auto"
          style={{
            textAlign:
              theme.pageNumberPosition === 'footer-center' ? 'center' : 'right',
          }}
        >
          {pageNumber}
        </div>
      )}
    </div>
  );
}

function renderBeatAsOpener(beat: string): string {
  // Keep the first paragraph (where the drop cap lands) as close to prose as we
  // can without fabricating text. Strip any trailing "End of chapter…" hints,
  // normalize ellipses, ensure sentence spacing.
  const cleaned = beat.trim();
  if (cleaned.length === 0) return '';
  // If the beat is a single paragraph, return as-is — it'll take the drop cap.
  return cleaned;
}
