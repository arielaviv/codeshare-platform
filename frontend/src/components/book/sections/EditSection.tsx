/**
 * EditSection — host for the inline Book Editor (Slice 10j).
 *
 * Tabs: Metadata · Outline · Prose · Matter. Each tab renders a dedicated
 * editor (see ../editor/*.tsx). A left rail is the live chapter strip —
 * clicking a chapter scopes Prose; other tabs ignore it.
 *
 * Wiring: receives `book` + patch handlers from BookStudioPanel so every
 * edit is optimistic locally, debounced + PATCHed to the server, and the
 * Studio's Save pill reflects the in-flight state.
 */
import { useMemo, useState } from 'react';
import api from '../../../services/api';
import type { BookThemeId } from '../../../themes/book';
import MetadataEditor from '../editor/MetadataEditor';
import OutlineEditor, { type OutlineChapter } from '../editor/OutlineEditor';
import ChapterProseEditor, { type ProseChapter, type ProseVariant } from '../editor/ChapterProseEditor';
import FrontBackMatterEditor, { type MatterValue } from '../editor/FrontBackMatterEditor';

type EditTab = 'metadata' | 'outline' | 'prose' | 'matter';

const TAB_ITEMS: Array<{ id: EditTab; label: string }> = [
  { id: 'metadata', label: 'Metadata' },
  { id: 'outline', label: 'Outline' },
  { id: 'prose', label: 'Prose' },
  { id: 'matter', label: 'Front / Back' },
];

export interface EditSectionBook {
  _id: string;
  title: string;
  author?: string;
  themeId: BookThemeId;
  bio?: string;
  dedication?: string;
  epigraph?: string;
  acknowledgements?: string;
  copyrightPageText?: string;
  chapters?: OutlineChapter[];
  outline?: { chapters: OutlineChapter[] };
}

interface Props {
  book: EditSectionBook;
  activeChapterN: number | null;
  onActiveChapterChange: (n: number | null) => void;
  onMetadataPatch: (patch: {
    title?: string;
    author?: string;
    themeId?: BookThemeId;
    bio?: string;
  }) => Promise<void>;
  onMatterPatch: (patch: Partial<MatterValue>) => Promise<void>;
  onChaptersReplace: (chapters: OutlineChapter[]) => Promise<void>;
  onChapterProseSave: (n: number, variant: ProseVariant, text: string) => Promise<void>;
}

export default function EditSection({
  book,
  activeChapterN,
  onActiveChapterChange,
  onMetadataPatch,
  onMatterPatch,
  onChaptersReplace,
  onChapterProseSave,
}: Props): JSX.Element {
  const [tab, setTab] = useState<EditTab>('metadata');

  const outlineChapters: OutlineChapter[] = useMemo(() => {
    const source = book.chapters && book.chapters.length > 0 ? book.chapters : book.outline?.chapters ?? [];
    return source.map((c) => ({ ...c }));
  }, [book.chapters, book.outline?.chapters]);

  const activeChapter: ProseChapter | null = useMemo(() => {
    if (!activeChapterN) return outlineChapters[0] ?? null;
    const found = outlineChapters.find((c) => c.n === activeChapterN);
    return found ?? outlineChapters[0] ?? null;
  }, [activeChapterN, outlineChapters]);

  const fetchChapterFallback = async (
    n: number,
    variant: ProseVariant
  ): Promise<string | null> => {
    // Map variant → the `mode` query the existing GET endpoint expects.
    const mode = variant === 'proofed' ? 'final' : variant === 'edited' ? 'edited' : 'raw';
    try {
      const { data } = await api.get<{ content: string }>(`/books/${book._id}/chapter/${n}?mode=${mode}`);
      return data.content ?? '';
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <EditTabBar tab={tab} onChange={setTab} />

      <div className="flex-1 min-h-0 flex">
        {/* Left rail — chapter picker (only meaningful in Prose) */}
        {tab === 'prose' && (
          <ChapterRail
            chapters={outlineChapters}
            activeChapterN={activeChapter?.n ?? null}
            onSelect={(n) => onActiveChapterChange(n)}
          />
        )}

        <div className="flex-1 min-w-0 overflow-auto bg-white dark:bg-[#0A0A0A]">
          {tab === 'metadata' && (
            <MetadataEditor
              value={{
                title: book.title,
                author: book.author ?? '',
                bio: book.bio ?? '',
                themeId: book.themeId,
              }}
              onPatch={async (p) => {
                await onMetadataPatch(p);
              }}
            />
          )}

          {tab === 'outline' && (
            <OutlineEditor chapters={outlineChapters} onReplace={onChaptersReplace} />
          )}

          {tab === 'prose' && activeChapter && (
            <ChapterProseEditor
              chapter={activeChapter}
              fallbackText={(variant) => fetchChapterFallback(activeChapter.n, variant)}
              onSave={(variant, text) => onChapterProseSave(activeChapter.n, variant, text)}
            />
          )}

          {tab === 'prose' && !activeChapter && (
            <div className="h-full flex items-center justify-center text-sm text-ink-tertiary dark:text-[#777]">
              No chapters yet. Add chapters in the Outline tab.
            </div>
          )}

          {tab === 'matter' && (
            <FrontBackMatterEditor
              value={{
                dedication: book.dedication ?? '',
                epigraph: book.epigraph ?? '',
                acknowledgements: book.acknowledgements ?? '',
                copyrightPageText: book.copyrightPageText ?? '',
              }}
              onPatch={onMatterPatch}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EditTabBar({
  tab,
  onChange,
}: {
  tab: EditTab;
  onChange: (t: EditTab) => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-center border-b border-edge dark:border-[#1A1A1A] bg-white dark:bg-[#0A0A0A] py-1.5 flex-shrink-0">
      <div className="flex items-center gap-0.5 bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded-full p-0.5">
        {TAB_ITEMS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                active
                  ? 'bg-white dark:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] font-semibold shadow-sm'
                  : 'text-ink-tertiary dark:text-[#888] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChapterRail({
  chapters,
  activeChapterN,
  onSelect,
}: {
  chapters: OutlineChapter[];
  activeChapterN: number | null;
  onSelect: (n: number) => void;
}): JSX.Element {
  return (
    <div className="w-56 flex-shrink-0 border-r border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0F0F0F] overflow-y-auto">
      <div className="p-2 text-[10px] uppercase tracking-wider text-ink-tertiary dark:text-[#777] font-medium sticky top-0 bg-surface-secondary dark:bg-[#0F0F0F]">
        Chapters · {chapters.length}
      </div>
      <div className="pb-3">
        {chapters.map((c) => {
          const active = c.n === activeChapterN;
          return (
            <button
              key={c.n}
              type="button"
              onClick={() => onSelect(c.n)}
              className={`w-full text-left px-3 py-2 border-l-2 transition-colors ${
                active
                  ? 'border-brand-orange bg-white dark:bg-[#141414]'
                  : 'border-transparent hover:bg-white/60 dark:hover:bg-[#141414]/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-ink-tertiary dark:text-[#666] flex-shrink-0">
                  {c.n}
                </span>
                <span className="text-[12px] text-ink dark:text-[#E8E8E8] truncate">{c.title}</span>
              </div>
              {typeof c.wordCount === 'number' && c.wordCount > 0 && (
                <div className="text-[10px] text-ink-tertiary dark:text-[#666] mt-0.5 ml-5">
                  {c.wordCount.toLocaleString()} words
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
