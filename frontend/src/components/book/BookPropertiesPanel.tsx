/**
 * Right sidebar — Properties panel. Context-aware by active section + selection:
 *
 *   section='cover'     → palette / concept / title treatment / regen
 *   section='chapters'  → active chapter stats / target words / beat preview / regen
 *   section='downloads' → production settings summary (theme / trim / author / target)
 *
 * Clones DeckEditor's PropertiesPanel ergonomics — fixed width, sticky
 * headers, tight form controls. Author input lives here because the author
 * name flows everywhere (cover composite, running heads, copyright cert,
 * blurb signature).
 */
import { useState, useEffect } from 'react';
import type { BookThemeSpec } from '../../themes/book';
import type { BookChapterRecord, BookCoverVariantRecord } from './BookStudioPanel';
import type { BookStudioSection } from './BookStudioSegmented';

interface BookShape {
  _id: string;
  title: string;
  author?: string;
  sourcePrompt: string;
  targetWords: number;
  outline?: {
    totalEstimatedWords: number;
    themes: string[];
    pov: string;
    genre: string;
    tone: string;
    chapters: BookChapterRecord[];
  };
}

interface Props {
  book: BookShape;
  section: BookStudioSection;
  activeChapter: BookChapterRecord | null;
  selectedCover: BookCoverVariantRecord | null;
  theme: BookThemeSpec;
  onAuthorChange: (author: string) => void;
}

export default function BookPropertiesPanel({
  book,
  section,
  activeChapter,
  selectedCover,
  theme,
  onAuthorChange,
}: Props): JSX.Element {
  return (
    <aside className="w-64 flex-shrink-0 border-l border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0A0A0A] overflow-y-auto subtle-scrollbar flex flex-col">
      <div className="sticky top-0 z-10 px-3 py-2 border-b border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0A0A0A]">
        <div className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-[#666]">
          {sectionLabel(section)}
        </div>
      </div>

      <div className="flex-1 p-3 space-y-4">
        {/* Always-visible metadata section */}
        <PropGroup title="Author">
          <AuthorInput value={book.author ?? ''} onCommit={onAuthorChange} />
          <HelpText>
            Flows to cover, running heads, copyright cert, and the KDP metadata CSV.
          </HelpText>
        </PropGroup>

        {section === 'cover' && <CoverPropsGroup selectedCover={selectedCover} />}
        {section === 'chapters' && <ChapterPropsGroup activeChapter={activeChapter} book={book} />}
        {section === 'downloads' && <ProductionPropsGroup book={book} theme={theme} />}

        <PropGroup title="Theme">
          <FieldRow label="Current">{theme.displayName}</FieldRow>
          <FieldRow label="Body">{simplifyFont(theme.bodyFontFamily)}</FieldRow>
          <FieldRow label="Headings">{simplifyFont(theme.chapterHeadingFontFamily)}</FieldRow>
          <FieldRow label="Trim">{theme.trimSize.replace('x', '″ × ')}″</FieldRow>
          <FieldRow label="Body size">{theme.bodyFontSizePt}pt · {theme.bodyLeadingPt}pt leading</FieldRow>
          <HelpText>Change theme from the toolbar Theme dropdown.</HelpText>
        </PropGroup>
      </div>
    </aside>
  );
}

function sectionLabel(s: BookStudioSection): string {
  if (s === 'cover') return 'Cover · Properties';
  if (s === 'chapters') return 'Chapters · Properties';
  return 'Downloads · Properties';
}

// --- Sub-groups ------------------------------------------------------------

function CoverPropsGroup({ selectedCover }: { selectedCover: BookCoverVariantRecord | null }): JSX.Element {
  if (!selectedCover) {
    return (
      <PropGroup title="Selection">
        <HelpText>Pick a cover in the main panel to see its properties here.</HelpText>
      </PropGroup>
    );
  }
  return (
    <>
      <PropGroup title="Concept">
        <div className="text-[13px] text-ink dark:text-[#E8E8E8] leading-snug font-medium">
          {selectedCover.conceptName}
        </div>
        <div className="text-[11px] text-ink-tertiary dark:text-[#888] leading-relaxed mt-2 whitespace-pre-wrap">
          {selectedCover.brief}
        </div>
      </PropGroup>
      <PropGroup title="Typography">
        <FieldRow label="Treatment">{selectedCover.titleTreatment}</FieldRow>
        <FieldRow label="Position">{selectedCover.titlePosition}</FieldRow>
        <FieldRow label="Title color">
          <ColorChip hex={selectedCover.titleColor} />
        </FieldRow>
        <FieldRow label="Author color">
          <ColorChip hex={selectedCover.authorColor} />
        </FieldRow>
      </PropGroup>
      <PropGroup title="Palette">
        <div className="flex items-center gap-1 flex-wrap">
          {selectedCover.paletteHexes.map((h) => (
            <ColorChip key={h} hex={h} showHex />
          ))}
        </div>
      </PropGroup>
    </>
  );
}

function ChapterPropsGroup({
  activeChapter,
  book,
}: {
  activeChapter: BookChapterRecord | null;
  book: BookShape;
}): JSX.Element {
  if (!activeChapter) {
    return (
      <PropGroup title="Selection">
        <HelpText>Select a chapter from the left strip.</HelpText>
      </PropGroup>
    );
  }
  const target = activeChapter.estimatedWords;
  const overallTarget = book.targetWords;
  const pct = overallTarget > 0 ? Math.round((target / overallTarget) * 100) : 0;
  return (
    <>
      <PropGroup title={`Chapter ${activeChapter.n}`}>
        <div className="text-[13px] text-ink dark:text-[#E8E8E8] leading-snug font-medium">
          {activeChapter.title}
        </div>
      </PropGroup>
      <PropGroup title="Target length">
        <FieldRow label="Words">{target.toLocaleString()}</FieldRow>
        <FieldRow label="% of book">{pct}%</FieldRow>
        <HelpText>
          Actual word count reveals here once Mr8 drafts the chapter.
        </HelpText>
      </PropGroup>
      <PropGroup title="Beat">
        <div className="text-[11px] text-ink-tertiary dark:text-[#888] leading-relaxed whitespace-pre-wrap">
          {activeChapter.beat}
        </div>
      </PropGroup>
    </>
  );
}

function ProductionPropsGroup({ book, theme }: { book: BookShape; theme: BookThemeSpec }): JSX.Element {
  return (
    <>
      <PropGroup title="Production">
        <FieldRow label="Target length">{book.targetWords.toLocaleString()} words</FieldRow>
        {book.outline && (
          <FieldRow label="Outline total">~{book.outline.totalEstimatedWords.toLocaleString()}</FieldRow>
        )}
        <FieldRow label="Chapters">{book.outline?.chapters.length ?? '—'}</FieldRow>
      </PropGroup>
      <PropGroup title="Genre / tone / POV">
        <FieldRow label="Genre">{book.outline?.genre ?? '—'}</FieldRow>
        <FieldRow label="Tone">{book.outline?.tone ?? '—'}</FieldRow>
        <FieldRow label="POV">{book.outline?.pov ?? '—'}</FieldRow>
      </PropGroup>
      <PropGroup title="Page geometry">
        <FieldRow label="Trim">{theme.trimSize.replace('x', '″ × ')}″</FieldRow>
        <FieldRow label="Margins (in)">
          T {theme.marginTopIn} · B {theme.marginBottomIn} · I {theme.marginInnerIn} · O {theme.marginOuterIn}
        </FieldRow>
      </PropGroup>
    </>
  );
}

// --- Primitives -----------------------------------------------------------

function PropGroup({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-[#666] mb-2">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[12px]">
      <span className="text-ink-tertiary dark:text-[#888] flex-shrink-0">{label}</span>
      <span className="text-ink dark:text-[#E8E8E8] text-right break-words min-w-0">{children}</span>
    </div>
  );
}

function HelpText({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="text-[10.5px] text-ink-tertiary dark:text-[#666] italic leading-relaxed mt-1.5">
      {children}
    </div>
  );
}

function ColorChip({ hex, showHex }: { hex: string; showHex?: boolean }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm border border-black/15 flex-shrink-0" style={{ backgroundColor: hex }} />
      {showHex && <span className="text-[10px] font-mono text-ink-tertiary dark:text-[#888]">{hex}</span>}
    </span>
  );
}

function AuthorInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }): JSX.Element {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const trimmed = local.trim();
        if (trimmed !== value) onCommit(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      placeholder="Your name"
      className="w-full px-2 py-1 text-[12px] border border-edge dark:border-[#2A2A2A] rounded bg-white dark:bg-[#141414] text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-brand-orange"
    />
  );
}

function simplifyFont(stack: string): string {
  const first = stack.split(',')[0].trim().replace(/['"]/g, '');
  return first;
}
