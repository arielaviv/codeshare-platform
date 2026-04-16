/**
 * Left-rail chapter list. Matches SlideThumbnailStrip ergonomics — fixed
 * width, UPPERCASE header, subtle scrollbar. Click a chapter to focus it
 * in the center reader.
 *
 * Slice 4a: shows outline chapters (beat as preview). Status dots default
 * to 'pending' until drafting lands in 4b. Hover actions (regen, up/down)
 * placeholders shown as disabled — they activate in 4b when chapters exist
 * as files.
 */
import type { BookChapterRecord } from './BookStudioPanel';

interface Props {
  chapters: BookChapterRecord[];
  activeChapterN: number | null;
  onSelect: (n: number) => void;
}

export default function ChaptersStrip({ chapters, activeChapterN, onSelect }: Props): JSX.Element {
  return (
    <div className="w-[176px] flex-shrink-0 border-r border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0A0A0A] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-edge dark:border-[#1A1A1A] flex-shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-[#666]">
          Chapters{chapters.length > 0 ? ` · ${chapters.length}` : ''}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto subtle-scrollbar py-1">
        {chapters.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-ink-tertiary dark:text-[#666] leading-relaxed">
            Chapters will appear here as Mr8 drafts the outline.
          </div>
        ) : (
          chapters.map((ch) => {
            const isActive = ch.n === activeChapterN;
            const status = (ch.status as ChapterStatus) ?? 'pending';
            return (
              <button
                key={ch.n}
                type="button"
                onClick={() => onSelect(ch.n)}
                className={`group w-full text-left px-3 py-2 border-l-2 transition-colors ${
                  isActive
                    ? 'border-brand-orange bg-white dark:bg-[#141414]'
                    : 'border-transparent hover:bg-white/50 dark:hover:bg-[#141414]/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <StatusDot status={status} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] font-medium leading-snug ${
                      isActive ? 'text-ink dark:text-[#E8E8E8]' : 'text-ink-secondary dark:text-[#D4D4D4]'
                    }`}>
                      <span className="text-ink-tertiary dark:text-[#666] font-mono text-[11px] mr-1">{ch.n}.</span>
                      {ch.title}
                    </div>
                    <div className="text-[10px] text-ink-tertiary dark:text-[#666] mt-0.5 tabular-nums">
                      ~{ch.estimatedWords.toLocaleString()}w
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

type ChapterStatus = 'pending' | 'drafting' | 'drafted' | 'editing' | 'edited' | 'proofing' | 'proofed' | 'error';

function StatusDot({ status }: { status: ChapterStatus }): JSX.Element {
  if (status === 'proofed') {
    return (
      <span className="w-3 h-3 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5" title="Proofed">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (status === 'edited' || status === 'drafted') {
    return (
      <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${status === 'edited' ? 'bg-emerald-500/60' : 'bg-amber-500/60'}`} title={status} />
    );
  }
  if (status === 'drafting' || status === 'editing' || status === 'proofing') {
    return (
      <span className="w-3 h-3 rounded-full border border-brand-orange flex items-center justify-center flex-shrink-0 mt-0.5" title={status}>
        <span className="w-1 h-1 rounded-full bg-brand-orange animate-pulse" />
      </span>
    );
  }
  if (status === 'error') {
    return <span className="w-3 h-3 rounded-full bg-red-500/70 flex-shrink-0 mt-0.5" title="Error" />;
  }
  return <span className="w-3 h-3 rounded-full border border-edge dark:border-[#333] flex-shrink-0 mt-0.5" title="Pending" />;
}
