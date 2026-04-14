import type { Slide, SlideTheme } from '../../types/deck';
import SlideCanvas from './SlideCanvas';

interface Props {
  slides: Slide[];
  theme: SlideTheme;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDelete: (index: number) => void;
}

export default function SlideThumbnailStrip({
  slides,
  theme,
  activeIndex,
  onSelect,
  onAdd,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props) {
  return (
    <div className="w-44 flex-shrink-0 border-r border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0A0A0A] flex flex-col">
      <div className="px-3 py-2 border-b border-edge dark:border-[#2A2A2A] flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-medium">
          Slides
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="p-1 text-ink-tertiary hover:text-ink dark:text-[#666] dark:hover:text-white transition-colors"
          title="Add slide"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 subtle-scrollbar">
        {slides.map((slide, idx) => (
          <div key={slide.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(idx)}
              className={`w-full rounded border-2 overflow-hidden transition-colors ${
                idx === activeIndex
                  ? 'border-accent dark:border-white'
                  : 'border-transparent hover:border-edge dark:hover:border-[#2A2A2A]'
              }`}
            >
              <div className="text-[9px] absolute top-0.5 left-0.5 bg-black/60 text-white px-1 rounded z-10">
                {idx + 1}
              </div>
              <div className="pointer-events-none">
                <SlideCanvas
                  slide={slide}
                  theme={theme}
                  selectedId={null}
                  editingTextId={null}
                  interactive={false}
                  onSelect={() => {}}
                  onEnterEditText={() => {}}
                  onExitEditText={() => {}}
                  onChange={() => {}}
                  onDeleteSelected={() => {}}
                  onDuplicateSelected={() => {}}
                />
              </div>
            </button>
            <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {idx > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveUp(idx);
                  }}
                  className="p-1 bg-white/90 dark:bg-black/70 rounded text-ink dark:text-white text-[10px]"
                  title="Move up"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              )}
              {idx < slides.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveDown(idx);
                  }}
                  className="p-1 bg-white/90 dark:bg-black/70 rounded text-ink dark:text-white text-[10px]"
                  title="Move down"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              )}
              {slides.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this slide?')) onDelete(idx);
                  }}
                  className="p-1 bg-white/90 dark:bg-black/70 rounded text-status-error text-[10px]"
                  title="Delete slide"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14H7L5 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
