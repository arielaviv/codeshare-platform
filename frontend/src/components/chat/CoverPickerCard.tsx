import { useState } from 'react';
import { getStaticBase } from '../../lib/apiBase';
import type { BookTitleTreatment, BookTitlePosition } from '../../services/bookCoverStream';

export type CoverCellStatus = 'empty' | 'generating' | 'ready' | 'failed';

export interface CoverCellData {
  idx: number;
  status: CoverCellStatus;
  conceptName?: string;
  imageUrl?: string;
  titleTreatment?: BookTitleTreatment;
  titlePosition?: BookTitlePosition;
  titleColor?: string;
  authorColor?: string;
  paletteHexes?: string[];
  failMessage?: string;
}

export interface CoverPickerCardProps {
  title: string;
  author?: string;
  cells: CoverCellData[];
  selectedIdx?: number;
  selecting?: boolean;
  regeneratingIdx?: number;
  onSelect: (idx: number) => void;
  onRegenerate: (idx: number) => void;
}

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

function resolveImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${getStaticBase()}${url}`;
}

export default function CoverPickerCard(props: CoverPickerCardProps): JSX.Element {
  const { title, author, cells, selectedIdx, selecting, regeneratingIdx, onSelect, onRegenerate } = props;

  return (
    <div className="animate-fade-slide-up my-3 max-w-3xl">
      <div className="rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
        <div className="px-4 py-3 border-b border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F]">
          <div className="text-xs text-ink-tertiary dark:text-[#888] uppercase tracking-wide mb-1">
            Cover concepts
          </div>
          <div className="text-base font-semibold text-ink dark:text-[#E8E8E8]">{title}</div>
          <div className="text-[11px] text-ink-tertiary dark:text-[#888] mt-1">
            {selectedIdx ? `Selected concept #${selectedIdx}` : 'Pick one, or regenerate an individual cover.'}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
          {cells.map((cell) => (
            <CoverCell
              key={cell.idx}
              cell={cell}
              title={title}
              author={author}
              isSelected={selectedIdx === cell.idx}
              isDimmed={Boolean(selectedIdx && selectedIdx !== cell.idx)}
              isRegenerating={regeneratingIdx === cell.idx}
              disabled={Boolean(selecting)}
              onSelect={() => onSelect(cell.idx)}
              onRegenerate={() => onRegenerate(cell.idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CellProps {
  cell: CoverCellData;
  title: string;
  author?: string;
  isSelected: boolean;
  isDimmed: boolean;
  isRegenerating: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
}

function CoverCell({ cell, title, author, isSelected, isDimmed, isRegenerating, disabled, onSelect, onRegenerate }: CellProps): JSX.Element {
  const [hover, setHover] = useState(false);
  const resolvedUrl = resolveImageUrl(cell.imageUrl);
  const isGenerating = cell.status === 'generating' || isRegenerating;
  const isReady = cell.status === 'ready' && resolvedUrl;
  const isFailed = cell.status === 'failed';

  return (
    <div
      className={`relative aspect-[2/3] rounded-md overflow-hidden border transition-all ${
        isSelected
          ? 'border-brand-orange ring-2 ring-brand-orange ring-offset-2 ring-offset-white dark:ring-offset-[#141414]'
          : 'border-edge dark:border-[#2A2A2A]'
      } ${isDimmed ? 'opacity-45' : 'opacity-100'} bg-surface-secondary dark:bg-[#0F0F0F]`}
      style={{ containerType: 'inline-size' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {isReady && (
        <>
          <img
            src={resolvedUrl}
            alt={cell.conceptName ?? `Cover variant ${cell.idx}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <CoverTextOverlay
            title={title}
            author={author}
            treatment={cell.titleTreatment ?? 'bold-sans'}
            position={cell.titlePosition ?? 'center'}
            titleColor={cell.titleColor ?? '#FFFFFF'}
            authorColor={cell.authorColor ?? cell.titleColor ?? '#FFFFFF'}
          />
        </>
      )}
      {isGenerating && <ShimmerPlaceholder />}
      {isFailed && <FailedPlaceholder message={cell.failMessage ?? 'Generation failed'} onRetry={onRegenerate} />}

      {/* idx badge top-left */}
      <div className="absolute top-2 left-2 text-[10px] font-mono bg-black/50 text-white px-1.5 py-0.5 rounded">
        #{cell.idx}
      </div>

      {/* Selected badge */}
      {isSelected && (
        <div className="absolute top-2 right-2 text-[10px] font-medium bg-brand-orange text-white px-2 py-0.5 rounded">
          Selected
        </div>
      )}

      {/* Hover actions */}
      {(isReady && (hover || isRegenerating) && !disabled) && (
        <div className="absolute inset-x-0 bottom-0 p-2 flex gap-2 bg-gradient-to-t from-black/70 to-transparent">
          {!isSelected && (
            <button
              type="button"
              onClick={onSelect}
              className="flex-1 text-[11px] font-medium bg-brand-orange hover:bg-brand-orange-hover text-white py-1.5 rounded transition-colors"
            >
              Select
            </button>
          )}
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="text-[11px] font-medium bg-white/90 hover:bg-white text-black py-1.5 px-2 rounded transition-colors disabled:opacity-50"
            title={cell.conceptName ?? 'Regenerate this cover'}
          >
            {isRegenerating ? 'Regenerating…' : 'Regen'}
          </button>
        </div>
      )}

      {/* Concept name footer on hover */}
      {isReady && hover && cell.conceptName && (
        <div className="absolute top-0 inset-x-0 px-2 py-1 bg-black/60 text-white text-[10px] truncate">
          {cell.conceptName}
        </div>
      )}
    </div>
  );
}

function ShimmerPlaceholder(): JSX.Element {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-full h-full animate-pulse bg-gradient-to-br from-surface-secondary via-surface-tertiary to-surface-secondary dark:from-[#141414] dark:via-[#1E1E1E] dark:to-[#141414]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <svg className="animate-spin h-6 w-6 text-ink-tertiary dark:text-[#666]" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeLinecap="round" />
        </svg>
        <div className="text-[10px] text-ink-tertiary dark:text-[#666]">Designing…</div>
      </div>
    </div>
  );
}

function FailedPlaceholder({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
      <div className="text-[11px] text-ink-tertiary dark:text-[#888]">Couldn't generate</div>
      <div className="text-[10px] text-ink-tertiary dark:text-[#666] line-clamp-3">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="text-[11px] font-medium text-brand-orange hover:text-brand-orange-hover mt-1"
      >
        Try again
      </button>
    </div>
  );
}

function CoverTextOverlay(props: {
  title: string;
  author?: string;
  treatment: BookTitleTreatment;
  position: BookTitlePosition;
  titleColor: string;
  authorColor: string;
}): JSX.Element {
  const { title, author, treatment, position, titleColor, authorColor } = props;
  const font = TREATMENT_FONT[treatment];
  const tStyle = TREATMENT_TITLE_STYLE[treatment];
  const align = POSITION_ALIGN[position];

  // Title size scales with container width via cqw (container query width).
  // `container-type: inline-size` is set on the parent cell; 1cqw = 1% of cell width.
  const titleLen = title.length;
  const titleSize = titleLen > 30 ? '10cqw' : titleLen > 20 ? '12cqw' : '15cqw';
  const authorSize = titleLen > 30 ? '4cqw' : '5cqw';

  // Soft text shadow helps titles remain legible against varied art.
  // Distressed treatment gets a subtle texture-shadow.
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
