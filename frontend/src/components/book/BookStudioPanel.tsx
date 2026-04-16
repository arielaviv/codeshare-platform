/**
 * BookStudioPanel — the right-panel body for `rightTab: 'book'`.
 *
 * Mounts inside the shared ArtifactPanel shell. Clones the DeckEditor +
 * PreviewPanel feature ergonomics. Three segmented sections (Cover /
 * Chapters / Downloads), stepper strip at top, chapters sidebar left,
 * properties panel right. Live Reader lands in the Chapters section in
 * Slice 4b; for 4a it shows a typographic preview of the outline.
 *
 * Data model: given a `bookId`, fetches the Book record on mount + on
 * changes. Emits PATCH calls through the api service for theme / author
 * / title changes.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import api from '../../services/api';
import type { CoverCellData } from '../chat/CoverPickerCard';
import type { BookTitleTreatment, BookTitlePosition } from '../../services/bookCoverStream';
import { BOOK_THEMES, buildBookThemeCss, buildBookThemeGoogleFontsUrl, type BookThemeId } from '../../themes/book';
import BookStudioToolbar from './BookStudioToolbar';
import BookStageStepper from './BookStageStepper';
import ChaptersStrip from './ChaptersStrip';
import BookStudioSegmented, { type BookStudioSection } from './BookStudioSegmented';
import CoverSection from './sections/CoverSection';
import ChaptersSection from './sections/ChaptersSection';
import DownloadsSection from './sections/DownloadsSection';
import BookPropertiesPanel from './BookPropertiesPanel';
import Mr8LogoLoader from '../shared/Mr8LogoLoader';
import type { LiveReaderHandle } from './LiveReader';

interface Props {
  bookId: string;
  /** When true, Chapters section renders the LiveReader instead of the static preview. */
  liveMode?: boolean;
  /** External ref to the LiveReader's imperative handle so the parent's SSE handler can push deltas. */
  liveReaderRef?: RefObject<LiveReaderHandle>;
  /** When liveMode is on, default to the Chapters section so the user sees prose arriving. */
  initialSection?: BookStudioSection;
  /**
   * Bump this number to force a book refetch. The Studio fetches once on mount
   * (before covers exist), so the parent (AIChatPage) increments this after
   * cover generation, approval, drafting, etc. so the Studio picks up the
   * freshly-persisted server state.
   */
  refreshTick?: number;
}

export interface BookChapterRecord {
  n: number;
  title: string;
  beat: string;
  estimatedWords: number;
  status?: string;
}

export interface BookCoverVariantRecord {
  idx: number;
  conceptName: string;
  brief: string;
  imageUrl: string;
  titleTreatment: BookTitleTreatment;
  titlePosition: BookTitlePosition;
  titleColor: string;
  authorColor: string;
  paletteHexes: string[];
}

interface BookRecord {
  _id: string;
  title: string;
  author?: string;
  sourcePrompt: string;
  targetWords: number;
  language: string;
  themeId: BookThemeId;
  outline?: {
    chapters: BookChapterRecord[];
    totalEstimatedWords: number;
    themes: string[];
    pov: string;
    genre: string;
    tone: string;
  };
  coverVariants?: BookCoverVariantRecord[];
  selectedCoverIdx?: number;
  status: string;
  updatedAt: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function BookStudioPanel({ bookId, liveMode, liveReaderRef, initialSection, refreshTick }: Props): JSX.Element {
  const [book, setBook] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<BookStudioSection>(initialSection ?? (liveMode ? 'chapters' : 'cover'));

  // When liveMode flips on, auto-focus the chapters section so the user sees prose arriving.
  useEffect(() => {
    if (liveMode) setSection('chapters');
  }, [liveMode]);
  const [activeChapterN, setActiveChapterN] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // Fetch the book record on mount, when bookId changes, or when the
  // parent bumps refreshTick (signals that server state has changed —
  // covers generated, cover picked, drafting finished, etc).
  useEffect(() => {
    let cancelled = false;
    // On initial load show the loader; on refetches keep the UI visible.
    if (!book) setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await api.get<{ book: BookRecord }>(`/books/${bookId}`);
        if (cancelled) return;
        setBook(res.data.book);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load book';
        setLoadError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, refreshTick]);

  // Inject the active theme's Google Fonts + scoped CSS into the DOM.
  const themeId: BookThemeId = book?.themeId ?? 'literary-classic';
  const theme = BOOK_THEMES[themeId];

  useEffect(() => {
    // Google Fonts <link> — added once per theme, idempotent.
    const href = buildBookThemeGoogleFontsUrl(theme);
    const linkId = `book-theme-font-${theme.id}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    // Scoped CSS — added once per theme, idempotent.
    const styleId = `book-theme-css-${theme.id}`;
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = buildBookThemeCss(theme);
      document.head.appendChild(style);
    }
  }, [theme]);

  // Persist PATCH updates (title, author, themeId) with a simple save-status
  // indicator that clears back to 'idle' after 1.5s of 'saved'.
  const patchBook = useCallback(
    async (patch: Partial<Pick<BookRecord, 'title' | 'author' | 'themeId'>>) => {
      if (!book) return;
      setSaveStatus('saving');
      setBook({ ...book, ...patch });
      try {
        await api.patch(`/books/${bookId}`, patch);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
      } catch {
        setSaveStatus('error');
      }
    },
    [book, bookId]
  );

  // Convert coverVariants into CoverCellData (reuses the chat picker's shape).
  const coverCells: CoverCellData[] = useMemo(() => {
    if (!book?.coverVariants || book.coverVariants.length === 0) {
      // Empty placeholders so the picker grid always renders 6 slots.
      return Array.from({ length: 6 }, (_, i) => ({ idx: i + 1, status: 'empty' as const }));
    }
    return book.coverVariants.map((v) => ({
      idx: v.idx,
      status: 'ready' as const,
      conceptName: v.conceptName,
      imageUrl: v.imageUrl,
      titleTreatment: v.titleTreatment,
      titlePosition: v.titlePosition,
      titleColor: v.titleColor,
      authorColor: v.authorColor,
      paletteHexes: v.paletteHexes,
    }));
  }, [book?.coverVariants]);

  // Default the active chapter to #1 when the outline first arrives.
  useEffect(() => {
    if (!activeChapterN && book?.outline?.chapters && book.outline.chapters.length > 0) {
      setActiveChapterN(book.outline.chapters[0].n);
    }
  }, [book?.outline?.chapters, activeChapterN]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-[#0A0A0A]">
        <Mr8LogoLoader size="md" caption="Opening your book…" />
      </div>
    );
  }

  if (loadError || !book) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#0A0A0A] px-6 text-center">
        <div className="text-sm text-ink-secondary dark:text-[#A0A0A0]">Couldn't load this book.</div>
        <div className="text-xs text-ink-tertiary dark:text-[#666] max-w-md">
          {loadError ?? 'The book record could not be fetched from the server.'}
        </div>
      </div>
    );
  }

  const chapters = book.outline?.chapters ?? [];
  const activeChapter = chapters.find((c) => c.n === activeChapterN) ?? chapters[0] ?? null;
  const selectedCover = book.coverVariants?.find((v) => v.idx === book.selectedCoverIdx) ?? null;

  return (
    <div className={`h-full flex flex-col bg-white dark:bg-[#0A0A0A] book-theme-${theme.id}`}>
      <BookStudioToolbar
        title={book.title}
        saveStatus={saveStatus}
        themeId={book.themeId}
        onTitleChange={(t) => patchBook({ title: t })}
        onThemeChange={(id) => patchBook({ themeId: id })}
      />
      <BookStageStepper book={book} />
      <div className="flex-1 min-h-0 flex">
        <ChaptersStrip
          chapters={chapters}
          activeChapterN={activeChapterN}
          onSelect={setActiveChapterN}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <BookStudioSegmented section={section} onChange={setSection} />
          <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-[#0A0A0A]">
            {section === 'cover' && (
              <CoverSection
                bookId={book._id}
                title={book.title}
                author={book.author}
                cells={coverCells}
                selectedIdx={book.selectedCoverIdx}
                theme={theme}
              />
            )}
            {section === 'chapters' && (
              <ChaptersSection
                book={book}
                activeChapter={activeChapter}
                theme={theme}
                liveMode={liveMode}
                liveReaderRef={liveReaderRef}
              />
            )}
            {section === 'downloads' && (
              <DownloadsSection book={book} />
            )}
          </div>
        </div>
        <BookPropertiesPanel
          book={book}
          section={section}
          activeChapter={activeChapter}
          selectedCover={selectedCover}
          theme={theme}
          onAuthorChange={(a) => patchBook({ author: a })}
        />
      </div>
    </div>
  );
}

