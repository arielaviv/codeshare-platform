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
import type { BookArtifactShape } from './sections/DownloadsSection';
import { streamBookFormat } from '../../services/bookFormatStream';
import { streamBookBundle } from '../../services/bookBundleStream';
import BookReadyCard from './BookReadyCard';
import EditSection from './sections/EditSection';
import type { OutlineChapter } from './editor/OutlineEditor';
import type { ProseVariant } from './editor/ChapterProseEditor';
import type { MatterValue } from './editor/FrontBackMatterEditor';

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
  /**
   * Fired when the Bundler finishes and a downloadable zip is ready. Used by
   * AIChatPage to enable the unified top-toolbar Share button for this book.
   */
  onBookReady?: (info: {
    bookId: string;
    title: string;
    author?: string;
    coverImageUrl?: string;
    bundleUrl: string;
    bundleSizeBytes: number;
    wordCount?: number;
  }) => void;
}

export interface BookChapterRecord {
  n: number;
  title: string;
  beat: string;
  estimatedWords: number;
  status?: string;
  draftPath?: string;
  editedPath?: string;
  proofedPath?: string;
  wordCount?: number;
  editingNotes?: string;
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
  /**
   * Authoritative per-chapter state after drafting/editing/proofing begins.
   * Carries status + path pointers used by ChaptersStrip and the Raw/Edited/Final
   * toggle in ChaptersSection. Mirrors backend IBookChapter.
   */
  chapters?: BookChapterRecord[];
  coverVariants?: BookCoverVariantRecord[];
  selectedCoverIdx?: number;
  /** Every file the Formatter / Bundler produced (Slice 7+). */
  artifacts?: BookArtifactShape[];
  bundleUrl?: string;
  /** Inline-editor fields (Slice 10j). */
  bio?: string;
  dedication?: string;
  epigraph?: string;
  acknowledgements?: string;
  copyrightPageText?: string;
  status: string;
  updatedAt: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function BookStudioPanel({ bookId, liveMode, liveReaderRef, initialSection, refreshTick, onBookReady }: Props): JSX.Element {
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
    async (
      patch: Partial<
        Pick<
          BookRecord,
          | 'title'
          | 'author'
          | 'themeId'
          | 'bio'
          | 'dedication'
          | 'epigraph'
          | 'acknowledgements'
          | 'copyrightPageText'
        >
      >
    ) => {
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

  // Replace chapters array (Outline editor — reorder / rename / insert / delete).
  const replaceChapters = useCallback(
    async (chapters: OutlineChapter[]) => {
      if (!book) return;
      setSaveStatus('saving');
      // Optimistic: rewrite the client copy with the new chapters.
      setBook((prev) => {
        if (!prev) return prev;
        const outlineChapters = chapters.map((c) => ({
          n: c.n,
          title: c.title,
          beat: c.beat,
          estimatedWords: c.estimatedWords,
        }));
        return {
          ...prev,
          chapters: chapters.map((c) => ({
            n: c.n,
            title: c.title,
            beat: c.beat,
            estimatedWords: c.estimatedWords,
            status: c.status,
            draftPath: c.draftPath,
            editedPath: c.editedPath,
            proofedPath: c.proofedPath,
            wordCount: c.wordCount,
          })),
          outline: prev.outline
            ? { ...prev.outline, chapters: outlineChapters }
            : prev.outline,
        };
      });
      try {
        await api.put(`/books/${bookId}/chapters`, { chapters });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
      } catch {
        setSaveStatus('error');
      }
    },
    [book, bookId]
  );

  // Save one chapter's prose (ChapterProseEditor).
  const saveChapterProse = useCallback(
    async (n: number, variant: ProseVariant, text: string) => {
      if (!book) return;
      setSaveStatus('saving');
      try {
        await api.patch(`/books/${bookId}/chapter/${n}/prose`, { text, variant });
        // Reflect the manual edit locally so the Stepper / Reader / Downloads
        // can see an updated word count.
        const wordCount = text.trim().match(/\S+/g)?.length ?? 0;
        setBook((prev) => {
          if (!prev || !prev.chapters) return prev;
          return {
            ...prev,
            chapters: prev.chapters.map((c) =>
              c.n === n ? { ...c, wordCount } : c
            ),
          };
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
      } catch {
        setSaveStatus('error');
      }
    },
    [book, bookId]
  );

  const matterPatch = useCallback(
    async (patch: Partial<MatterValue>) => {
      await patchBook(patch);
    },
    [patchBook]
  );

  const metadataPatch = useCallback(
    async (patch: {
      title?: string;
      author?: string;
      themeId?: BookThemeId;
      bio?: string;
    }) => {
      await patchBook(patch);
    },
    [patchBook]
  );

  // Export chain state. A single click walks Format → Bundle → BookReadyCard,
  // so the user gets one button and one "done" moment.
  const [exportRunning, setExportRunning] = useState(false);
  const [bookReady, setBookReady] = useState<{
    bundleUrl: string;
    bundleSizeBytes: number;
  } | null>(null);

  const draftedChapterCount = (book?.chapters ?? []).filter(
    (c) => c.status === 'drafted' || c.status === 'edited' || c.status === 'proofed'
  ).length;
  const outlineChapterCount = book?.outline?.chapters.length ?? 0;
  const exportReady =
    outlineChapterCount > 0 && draftedChapterCount === outlineChapterCount;
  const exportDisabledReason = !book
    ? 'Loading…'
    : !exportReady
      ? 'Draft all chapters before exporting'
      : undefined;

  // Whether the last build's artifacts are out of date relative to the book's
  // most recent edit. Drives the toolbar's stale-badge + tooltip.
  const artifactsStale = useMemo(() => {
    if (!book) return false;
    const arts = book.artifacts ?? [];
    if (arts.length === 0) return false;
    const lastBuild = arts.reduce<number>((max, a) => {
      const t = a.builtAt ? new Date(a.builtAt).getTime() : 0;
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (lastBuild === 0) return false;
    const bookUpdated = new Date(book.updatedAt).getTime();
    return bookUpdated > lastBuild;
  }, [book]);

  const appendArtifact = useCallback(
    (a: { kind: BookArtifactShape['kind']; url: string; sizeBytes: number }) => {
      setBook((prev) => {
        if (!prev) return prev;
        const without = (prev.artifacts ?? []).filter((x) => x.kind !== a.kind);
        return {
          ...prev,
          artifacts: [
            ...without,
            {
              kind: a.kind,
              url: a.url,
              sizeBytes: a.sizeBytes,
              builtAt: new Date().toISOString(),
              lang: 'en',
            },
          ],
        };
      });
    },
    []
  );

  const runBundleStage = useCallback((bookId: string) => {
    setBook((prev) => (prev ? { ...prev, status: 'bundling' } : prev));
    streamBookBundle(
      { bookId },
      {
        onProgress: () => {},
        onBundleReady: (data) => {
          appendArtifact({ kind: 'bundle-zip', url: data.bundleUrl, sizeBytes: data.sizeBytes });
          setBook((prev) => {
            const next = prev
              ? {
                  ...prev,
                  bundleUrl: data.bundleUrl,
                  status: 'done' as const,
                }
              : prev;
            if (next && onBookReady) {
              const cover =
                next.selectedCoverIdx != null && next.coverVariants
                  ? next.coverVariants.find((c) => c.idx === next.selectedCoverIdx)?.imageUrl
                  : next.coverVariants?.[0]?.imageUrl;
              const wordCount = (next.chapters ?? []).reduce<number>(
                (sum, c) => sum + (typeof c.wordCount === 'number' ? c.wordCount : 0),
                0
              );
              onBookReady({
                bookId: next._id,
                title: next.title,
                author: next.author,
                coverImageUrl: cover,
                bundleUrl: data.bundleUrl,
                bundleSizeBytes: data.sizeBytes,
                wordCount: wordCount > 0 ? wordCount : undefined,
              });
            }
            return next;
          });
          setBookReady({ bundleUrl: data.bundleUrl, bundleSizeBytes: data.sizeBytes });
        },
        onStageComplete: () => {
          setExportRunning(false);
          setSection('downloads');
        },
        onError: (message) => {
          console.error('[book-bundle] error:', message);
          setExportRunning(false);
          setBook((prev) => (prev ? { ...prev, status: 'formatting' } : prev));
        },
      }
    );
  }, [appendArtifact]);

  const startExport = useCallback(() => {
    if (!book || exportRunning) return;
    setExportRunning(true);
    setBookReady(null);

    // Fast path — PDF + EPUB + DOCX already built AND content has NOT been
    // edited since the last build: skip format, bundle directly. If the user
    // edited prose, chapter order, metadata, or front/back matter after the
    // artifacts were built, we fall through to a fresh format so the bundle
    // reflects the current state.
    const artifacts = book.artifacts ?? [];
    const hasCore =
      artifacts.some((a) => a.kind === 'pdf') &&
      artifacts.some((a) => a.kind === 'epub') &&
      artifacts.some((a) => a.kind === 'docx');
    const lastBuild = artifacts.reduce<number>((max, a) => {
      const t = a.builtAt ? new Date(a.builtAt).getTime() : 0;
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    const bookUpdated = new Date(book.updatedAt).getTime();
    const stale = lastBuild > 0 && bookUpdated > lastBuild;

    if (hasCore && !stale) {
      runBundleStage(book._id);
      return;
    }

    // Otherwise: format → then bundle on format stage_complete.
    setBook((prev) => (prev ? { ...prev, status: 'formatting' } : prev));
    streamBookFormat(
      { bookId: book._id },
      {
        onStageStarted: () => {},
        onBuilding: () => {},
        onReady: (data) => {
          appendArtifact({ kind: data.kind, url: data.url, sizeBytes: data.sizeBytes });
        },
        onCoverReady: (data) => {
          appendArtifact({ kind: data.kind, url: data.url, sizeBytes: data.sizeBytes });
        },
        onStageComplete: () => {
          runBundleStage(book._id);
        },
        onError: (message) => {
          console.error('[book-format] error:', message);
          setExportRunning(false);
          setBook((prev) => (prev ? { ...prev, status: 'editing' } : prev));
        },
      }
    );
  }, [book, exportRunning, appendArtifact, runBundleStage]);

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

  // Prefer book.chapters[] (authoritative per-chapter state once drafting begins);
  // fall back to outline.chapters for the pre-draft phase when paths don't exist yet.
  // Chapters[] carries the actual status + draft/edited/proofed path pointers.
  const chapters = book.chapters && book.chapters.length > 0 ? book.chapters : (book.outline?.chapters ?? []);
  const activeChapter = chapters.find((c) => c.n === activeChapterN) ?? chapters[0] ?? null;
  const selectedCover = book.coverVariants?.find((v) => v.idx === book.selectedCoverIdx) ?? null;

  const totalWordCount = (book.chapters ?? [])
    .map((c) => c.wordCount ?? 0)
    .reduce((a, b) => a + b, 0);

  return (
    <div className={`h-full flex flex-col bg-white dark:bg-[#0A0A0A] book-theme-${theme.id} relative`}>
      <BookStudioToolbar
        title={book.title}
        saveStatus={saveStatus}
        themeId={book.themeId}
        onTitleChange={(t) => patchBook({ title: t })}
        onThemeChange={(id) => patchBook({ themeId: id })}
        onExport={startExport}
        exportRunning={exportRunning}
        exportDisabledReason={exportDisabledReason}
        artifactsStale={artifactsStale}
      />
      {bookReady && (
        <div
          className="absolute top-14 right-6 z-30"
          style={{ animation: 'mr8-fade-in-soft 0.35s ease-out' }}
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setBookReady(null)}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface-secondary dark:bg-[#1A1A1A] border border-edge dark:border-[#2A2A2A] text-ink-tertiary dark:text-[#888] hover:text-ink dark:hover:text-[#E8E8E8] flex items-center justify-center text-xs z-10"
              aria-label="Dismiss"
            >
              ×
            </button>
            <BookReadyCard
              title={book.title}
              author={book.author}
              coverImageUrl={selectedCover?.imageUrl}
              bundleUrl={bookReady.bundleUrl}
              bundleSizeBytes={bookReady.bundleSizeBytes}
              wordCount={totalWordCount}
            />
          </div>
        </div>
      )}
      <BookStageStepper book={book} />
      <div className="flex-1 min-h-0 flex">
        {section !== 'edit' && (
          <ChaptersStrip
            chapters={chapters}
            activeChapterN={activeChapterN}
            onSelect={setActiveChapterN}
          />
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <BookStudioSegmented section={section} onChange={setSection} />
          {section === 'edit' ? (
            <EditSection
              book={{
                _id: book._id,
                title: book.title,
                author: book.author,
                themeId: book.themeId,
                bio: book.bio,
                dedication: book.dedication,
                epigraph: book.epigraph,
                acknowledgements: book.acknowledgements,
                copyrightPageText: book.copyrightPageText,
                chapters: book.chapters as OutlineChapter[] | undefined,
                outline: book.outline
                  ? { chapters: book.outline.chapters as OutlineChapter[] }
                  : undefined,
              }}
              activeChapterN={activeChapterN}
              onActiveChapterChange={setActiveChapterN}
              onMetadataPatch={metadataPatch}
              onMatterPatch={matterPatch}
              onChaptersReplace={replaceChapters}
              onChapterProseSave={saveChapterProse}
            />
          ) : (
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
              {section === 'downloads' && <DownloadsSection book={book} />}
            </div>
          )}
        </div>
        {section !== 'edit' && (
          <BookPropertiesPanel
            book={book}
            section={section}
            activeChapter={activeChapter}
            selectedCover={selectedCover}
            theme={theme}
            onAuthorChange={(a) => patchBook({ author: a })}
          />
        )}
      </div>
    </div>
  );
}

