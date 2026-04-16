/**
 * Manus-style mode chip row + "More" popover (Manus image #61).
 *
 * Primary chips (always visible):
 *   Develop apps · Create slides · Spreadsheet · Design · More
 *
 * "More" hover popover:
 *   Develop apps · Schedule task · Wide Research · Spreadsheet ·
 *   Visualization · Video · Audio · Chat mode · Slide deck · Design · Playbook
 *
 * Click on any chip → calls `onSelect(mode)`. Caller decides whether to
 * just set the mode and focus the input, or auto-submit.
 */
import { useEffect, useRef, useState } from 'react';
import type { ForceMode } from '../../types/modes';

interface Props {
  onSelect: (mode: ForceMode) => void;
  selectedMode?: ForceMode;
}

interface ChipDef {
  mode: ForceMode;
  label: string;
  icon: JSX.Element;
}

const PRIMARY: ChipDef[] = [
  { mode: 'code',   label: 'Develop apps',   icon: <CodeIcon /> },
  { mode: 'deck',   label: 'Create slides',  icon: <DeckIcon /> },
  { mode: 'sheet',  label: 'Spreadsheet',    icon: <SheetIcon /> },
  { mode: 'design', label: 'Design',         icon: <DesignIcon /> },
];

const MORE_MENU: ChipDef[] = [
  { mode: 'code',          label: 'Develop apps',  icon: <CodeIcon /> },
  { mode: 'schedule',      label: 'Schedule task', icon: <CalendarIcon /> },
  { mode: 'research',      label: 'Wide Research', icon: <SearchIcon /> },
  { mode: 'sheet',         label: 'Spreadsheet',   icon: <SheetIcon /> },
  { mode: 'visualization', label: 'Visualization', icon: <ChartIcon /> },
  { mode: 'video',         label: 'Video',         icon: <VideoIcon /> },
  { mode: 'audio',         label: 'Audio',         icon: <AudioIcon /> },
  { mode: 'chat',          label: 'Chat mode',     icon: <ChatIcon /> },
  { mode: 'deck',          label: 'Slide deck',    icon: <DeckIcon /> },
  { mode: 'design',        label: 'Design',        icon: <DesignIcon /> },
  { mode: 'book',          label: 'Write a book',  icon: <BookIcon /> },
];

export default function ModeChips({ onSelect, selectedMode }: Props): JSX.Element {
  const [moreOpen, setMoreOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMoreOpen(true);
  };
  const handleLeave = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setMoreOpen(false), 200);
  };

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {PRIMARY.map((chip) => (
        <Chip
          key={chip.mode}
          chip={chip}
          selected={chip.mode === selectedMode}
          onClick={() => onSelect(chip.mode)}
        />
      ))}
      <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <button
          type="button"
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] text-ink-secondary dark:text-[#A0A0A0] hover:border-ink-tertiary dark:hover:border-[#444] hover:text-ink dark:hover:text-[#E8E8E8] transition-colors"
        >
          More
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {moreOpen && (
          <div
            className="absolute z-50 right-0 bottom-full mb-2 w-[240px] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg shadow-xl py-1.5"
            role="menu"
          >
            {MORE_MENU.map((chip) => (
              <button
                key={chip.mode}
                type="button"
                onClick={() => {
                  onSelect(chip.mode);
                  setMoreOpen(false);
                }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors ${
                  chip.mode === selectedMode
                    ? 'text-brand-orange'
                    : 'text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]'
                }`}
              >
                <span className="flex-shrink-0 text-ink-tertiary dark:text-[#888]">
                  {chip.icon}
                </span>
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ chip, selected, onClick }: { chip: ChipDef; selected: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border transition-colors ${
        selected
          ? 'border-brand-orange text-brand-orange bg-brand-orange-soft dark:bg-brand-orange/15'
          : 'border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] text-ink-secondary dark:text-[#A0A0A0] hover:border-ink-tertiary dark:hover:border-[#444] hover:text-ink dark:hover:text-[#E8E8E8]'
      }`}
    >
      <span className="flex-shrink-0">{chip.icon}</span>
      {chip.label}
    </button>
  );
}

// --- icons ---
const I = (props: { children: React.ReactNode }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {props.children}
  </svg>
);
function CodeIcon() { return <I><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></I>; }
function DeckIcon() { return <I><rect x="3" y="4" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></I>; }
function SheetIcon() { return <I><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></I>; }
function DesignIcon() { return <I><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><line x1="2" y1="2" x2="9" y2="9" /></I>; }
function CalendarIcon() { return <I><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></I>; }
function SearchIcon() { return <I><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></I>; }
function ChartIcon() { return <I><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></I>; }
function VideoIcon() { return <I><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></I>; }
function AudioIcon() { return <I><path d="M3 12h2l3-9 4 18 3-9h6" /></I>; }
function ChatIcon() { return <I><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></I>; }
function BookIcon() { return <I><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></I>; }
