/**
 * Segmented control switching the Studio's center pane between
 * Cover / Chapters / Edit / Downloads. Sticky under the stepper.
 */
import { Image as ImageIcon, BookOpen, PenSquare, Download } from 'lucide-react';

export type BookStudioSection = 'cover' | 'chapters' | 'edit' | 'downloads';

interface Props {
  section: BookStudioSection;
  onChange: (s: BookStudioSection) => void;
}

const ITEMS: Array<{ id: BookStudioSection; label: string; icon: JSX.Element }> = [
  { id: 'cover', label: 'Cover', icon: <ImageIcon size={14} /> },
  { id: 'chapters', label: 'Chapters', icon: <BookOpen size={14} /> },
  { id: 'edit', label: 'Edit', icon: <PenSquare size={14} /> },
  { id: 'downloads', label: 'Downloads', icon: <Download size={14} /> },
];

export default function BookStudioSegmented({ section, onChange }: Props): JSX.Element {
  return (
    <div className="flex items-center justify-center border-b border-edge dark:border-[#1A1A1A] bg-white dark:bg-[#0A0A0A] py-1.5 flex-shrink-0">
      <div className="flex items-center gap-0.5 bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded-full p-0.5">
        {ITEMS.map((it) => {
          const active = it.id === section;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onChange(it.id)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-colors ${
                active
                  ? 'bg-white dark:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] font-semibold shadow-sm'
                  : 'text-ink-tertiary dark:text-[#888] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
