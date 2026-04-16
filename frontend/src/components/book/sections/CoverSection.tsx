/**
 * Cover section of the Book Studio.
 *
 * Two modes:
 *   - Picker mode (pre-select): 6-cell grid, reuses CoverPickerCard's
 *     composited-title rendering.
 *   - Focus mode (post-select): single large cover (hardcover-proportioned),
 *     centered, with inline Change / Regenerate actions and the cover's
 *     concept name + palette shown below.
 *
 * Both modes render with full Book Theme typography via CSS variables
 * already injected at BookStudioPanel root.
 */
import { useState } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import CoverPickerCard, { type CoverCellData } from '../../chat/CoverPickerCard';
import type { BookThemeSpec } from '../../../themes/book';
import { getStaticBase } from '../../../lib/apiBase';
import api from '../../../services/api';
import { streamBookCoverGeneration, type BookTitleTreatment, type BookTitlePosition } from '../../../services/bookCoverStream';

interface Props {
  bookId: string;
  title: string;
  author?: string;
  cells: CoverCellData[];
  selectedIdx?: number;
  theme: BookThemeSpec;
}

export default function CoverSection({
  bookId,
  title,
  author,
  cells,
  selectedIdx,
  theme,
}: Props): JSX.Element {
  const [localSelected, setLocalSelected] = useState(selectedIdx);
  const [generating, setGenerating] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | undefined>();

  const hasCovers = cells.some((c) => c.status === 'ready');
  const focused = localSelected ? cells.find((c) => c.idx === localSelected) : undefined;

  const handleSelect = async (idx: number) => {
    setLocalSelected(idx);
    try {
      await api.patch(`/books/${bookId}/cover`, { selectedCoverIdx: idx });
    } catch {
      setLocalSelected(selectedIdx);
    }
  };

  const handleRegenerate = (idx: number) => {
    setRegeneratingIdx(idx);
    streamBookCoverGeneration(
      { bookId, regenerateIdx: idx, author },
      {
        onBookLoaded() {},
        onCoverGenerating() {},
        onCoverReady() {
          // parent re-fetches via its own useEffect when book record changes;
          // regenerate is fire-and-forget here.
        },
        onCoversComplete() {
          setRegeneratingIdx(undefined);
        },
        onError() {
          setRegeneratingIdx(undefined);
        },
      }
    );
  };

  // Not-yet-generated state: show an empty-state prompting the user to design covers.
  if (!hasCovers && !generating) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-sm font-semibold text-ink dark:text-[#E8E8E8] mb-2">No covers yet</div>
          <div className="text-[13px] text-ink-tertiary dark:text-[#888] leading-relaxed mb-6">
            Mr8 will brief 6 distinct art concepts, generate them in parallel,
            and composite your title + author in the theme's typography.
          </div>
          <button
            type="button"
            onClick={() => {
              setGenerating(true);
              streamBookCoverGeneration(
                { bookId, author },
                {
                  onBookLoaded() {},
                  onCoverGenerating() {},
                  onCoverReady() {},
                  onCoversComplete() {
                    setGenerating(false);
                  },
                  onError() {
                    setGenerating(false);
                  },
                }
              );
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-orange hover:bg-brand-orange-hover text-white rounded-full transition-colors"
          >
            <Sparkles size={14} />
            Design 6 covers
          </button>
        </div>
      </div>
    );
  }

  // Focus mode — one large cover after selection.
  if (focused && focused.imageUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 gap-4">
        <LargeCover cell={focused} title={title} author={author} />
        <div className="flex items-center gap-2 text-[11px] text-ink-tertiary dark:text-[#666]">
          <span className="font-medium text-ink-secondary dark:text-[#A0A0A0]">{focused.conceptName}</span>
          <span>·</span>
          <PaletteSwatches hexes={focused.paletteHexes ?? []} />
          <span>·</span>
          <span>{theme.displayName} typography</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocalSelected(undefined)}
            className="text-xs px-3 py-1.5 border border-edge dark:border-[#2A2A2A] rounded-full text-ink-secondary dark:text-[#A0A0A0] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => handleRegenerate(focused.idx)}
            disabled={regeneratingIdx === focused.idx}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-edge dark:border-[#2A2A2A] rounded-full text-ink-secondary dark:text-[#A0A0A0] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors disabled:opacity-50"
          >
            <RotateCcw size={12} />
            {regeneratingIdx === focused.idx ? 'Regenerating…' : 'Regenerate art'}
          </button>
        </div>
      </div>
    );
  }

  // Picker mode — 6-cell grid
  return (
    <div className="h-full overflow-auto p-6 flex items-start justify-center">
      <CoverPickerCard
        title={title}
        author={author}
        cells={cells}
        selectedIdx={localSelected}
        regeneratingIdx={regeneratingIdx}
        onSelect={handleSelect}
        onRegenerate={handleRegenerate}
      />
    </div>
  );
}

function LargeCover({
  cell,
  title,
  author,
}: {
  cell: CoverCellData;
  title: string;
  author?: string;
}): JSX.Element {
  const resolvedUrl = cell.imageUrl
    ? cell.imageUrl.startsWith('http')
      ? cell.imageUrl
      : `${getStaticBase()}${cell.imageUrl}`
    : undefined;

  return (
    <div
      className="relative overflow-hidden rounded-lg shadow-2xl"
      style={{
        width: 360,
        height: 540,
        containerType: 'inline-size',
        backgroundColor: '#111',
      }}
    >
      {resolvedUrl && (
        <img
          src={resolvedUrl}
          alt={cell.conceptName ?? 'Cover'}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <CoverText
        title={title}
        author={author}
        treatment={(cell.titleTreatment as BookTitleTreatment | undefined) ?? 'bold-sans'}
        position={(cell.titlePosition as BookTitlePosition | undefined) ?? 'center'}
        titleColor={cell.titleColor ?? '#FFFFFF'}
        authorColor={cell.authorColor ?? cell.titleColor ?? '#FFFFFF'}
      />
    </div>
  );
}

function CoverText({
  title,
  author,
  treatment,
  position,
  titleColor,
  authorColor,
}: {
  title: string;
  author?: string;
  treatment: BookTitleTreatment;
  position: BookTitlePosition;
  titleColor: string;
  authorColor: string;
}): JSX.Element {
  // Mirror the CoverPickerCard's typography math but at a larger base.
  const font = TREATMENT_FONT[treatment];
  const tStyle = TREATMENT_TITLE_STYLE[treatment];
  const align = POSITION_ALIGN[position];
  const titleLen = title.length;
  const titleSize = titleLen > 30 ? '10cqw' : titleLen > 20 ? '12cqw' : '15cqw';
  const authorSize = titleLen > 30 ? '4cqw' : '5cqw';
  const shadow = treatment === 'distressed'
    ? '0 0 3px rgba(0,0,0,0.75), 1px 1px 0 rgba(0,0,0,0.5)'
    : '0 2px 16px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3)';

  return (
    <div
      className="absolute inset-0 flex flex-col pointer-events-none"
      style={{
        justifyContent: align.justifyContent,
        paddingTop: align.paddingTop,
        paddingBottom: align.paddingBottom,
        paddingLeft: '8%',
        paddingRight: '8%',
      }}
    >
      <div
        className="w-full text-center"
        style={{
          color: titleColor,
          fontFamily: font,
          fontWeight: tStyle.fontWeight,
          letterSpacing: tStyle.letterSpacing,
          textTransform: tStyle.textTransform,
          lineHeight: tStyle.lineHeight,
          fontSize: titleSize,
          textShadow: shadow,
          wordBreak: 'break-word',
        }}
      >
        {title}
      </div>
      {author && author.trim().length > 0 && (
        <div
          className="w-full text-center"
          style={{
            color: authorColor,
            fontFamily: font,
            fontWeight: Math.max(400, tStyle.fontWeight - 300),
            letterSpacing: tStyle.letterSpacing,
            textTransform: treatment === 'display-script' ? 'none' : 'uppercase',
            fontSize: authorSize,
            marginTop: '4cqw',
            textShadow: shadow,
          }}
        >
          {author}
        </div>
      )}
    </div>
  );
}

// Keep these in sync with CoverPickerCard.tsx — identical tables.
const TREATMENT_FONT: Record<BookTitleTreatment, string> = {
  'bold-sans': "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  'serif-elegant': "'Playfair Display', 'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  'display-script': "'Great Vibes', 'Dancing Script', 'Pinyon Script', cursive",
  'condensed-tall': "'Bebas Neue', 'Oswald', 'Arial Narrow', sans-serif-condensed, sans-serif",
  'distressed': "'Special Elite', 'Courier New', 'IBM Plex Mono', monospace",
  'modern-mono': "'IBM Plex Mono', 'JetBrains Mono', 'Roboto Mono', 'Menlo', monospace",
};

const TREATMENT_TITLE_STYLE: Record<BookTitleTreatment, {
  letterSpacing: string;
  textTransform: 'uppercase' | 'none';
  fontWeight: number;
  lineHeight: number;
}> = {
  'bold-sans': { letterSpacing: '-0.02em', textTransform: 'uppercase', fontWeight: 900, lineHeight: 0.95 },
  'serif-elegant': { letterSpacing: '0.01em', textTransform: 'none', fontWeight: 700, lineHeight: 1.0 },
  'display-script': { letterSpacing: '0em', textTransform: 'none', fontWeight: 400, lineHeight: 1.0 },
  'condensed-tall': { letterSpacing: '0.03em', textTransform: 'uppercase', fontWeight: 700, lineHeight: 0.95 },
  'distressed': { letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, lineHeight: 1.0 },
  'modern-mono': { letterSpacing: '0em', textTransform: 'uppercase', fontWeight: 600, lineHeight: 1.0 },
};

const POSITION_ALIGN: Record<BookTitlePosition, { justifyContent: string; paddingTop: string; paddingBottom: string }> = {
  top: { justifyContent: 'flex-start', paddingTop: '6%', paddingBottom: '0' },
  center: { justifyContent: 'center', paddingTop: '0', paddingBottom: '0' },
  bottom: { justifyContent: 'flex-end', paddingTop: '0', paddingBottom: '8%' },
};

function PaletteSwatches({ hexes }: { hexes: string[] }): JSX.Element {
  return (
    <span className="flex items-center gap-0.5">
      {hexes.slice(0, 4).map((h, i) => (
        <span key={i} className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: h }} title={h} />
      ))}
    </span>
  );
}
