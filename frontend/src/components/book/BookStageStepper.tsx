/**
 * Stepper strip — 7 stage pips across the top of the Book Studio panel.
 * Derives status from the book's current shape in Slice 4a (presence of
 * outline, coverVariants, selectedCoverIdx), and from book.stages[] in
 * Slice 4b once the Producer lands.
 */
import { BookOpen, Image as ImageIcon, Mic, PenLine, Sparkles, Package, Download } from 'lucide-react';

type StageStatus = 'pending' | 'running' | 'done' | 'awaiting-approval' | 'error';

interface Stage {
  id: 'outline' | 'cover' | 'voice' | 'draft' | 'polish' | 'format' | 'export';
  label: string;
  icon: JSX.Element;
  subtext: string;
  status: StageStatus;
}

interface BookShape {
  outline?: { chapters: Array<unknown>; totalEstimatedWords: number };
  coverVariants?: Array<unknown>;
  selectedCoverIdx?: number;
  chapters?: Array<{ n?: number; status?: string }>;
  auditIssues?: Array<{ resolved?: boolean }>;
  editingChoices?: { aggressiveness?: string };
  status: string;
}

interface Props {
  book: BookShape;
}

const ICON_SIZE = 14;

export default function BookStageStepper({ book }: Props): JSX.Element {
  const stages = computeStages(book);

  return (
    <div className="flex items-center gap-0 px-4 py-2.5 border-b border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0F0F0F] overflow-x-auto flex-shrink-0">
      {stages.map((s, i) => (
        <div key={s.id} className="flex items-center flex-shrink-0">
          <StagePip stage={s} />
          {i < stages.length - 1 && <StageConnector fromStatus={s.status} toStatus={stages[i + 1].status} />}
        </div>
      ))}
    </div>
  );
}

function computeStages(book: BookShape): Stage[] {
  const hasOutline = Boolean(book.outline?.chapters?.length);
  const chapterCount = book.outline?.chapters?.length ?? 0;
  const words = book.outline?.totalEstimatedWords ?? 0;
  const hasCovers = (book.coverVariants?.length ?? 0) > 0;
  const coverPicked = typeof book.selectedCoverIdx === 'number' && book.selectedCoverIdx > 0;

  // Draft / Polish state from book.chapters[] (authoritative per-chapter status).
  const chapters = book.chapters ?? [];
  const totalChapters = chapters.length || chapterCount;
  const drafted = chapters.filter((c) => c.status === 'drafted' || c.status === 'editing' || c.status === 'edited' || c.status === 'proofing' || c.status === 'proofed').length;
  const edited = chapters.filter((c) => c.status === 'edited' || c.status === 'proofing' || c.status === 'proofed').length;
  const proofed = chapters.filter((c) => c.status === 'proofed').length;
  const drafting = chapters.some((c) => c.status === 'drafting');
  const editing = chapters.some((c) => c.status === 'editing');
  const proofing = chapters.some((c) => c.status === 'proofing');
  const ch1Drafted = chapters.find((c) => c.n === 1)?.status === 'drafted' ||
    chapters.find((c) => c.n === 1)?.status === 'edited' ||
    chapters.find((c) => c.n === 1)?.status === 'proofed';

  const auditCount = book.auditIssues?.length ?? 0;
  const auditResolved = (book.auditIssues ?? []).filter((i) => i.resolved).length;
  const hasAudit = Array.isArray(book.auditIssues);

  const draftStatus: Stage['status'] =
    totalChapters > 0 && drafted === totalChapters ? 'done'
    : drafting ? 'running'
    : ch1Drafted ? 'running'
    : 'pending';

  const polishStatus: Stage['status'] =
    totalChapters > 0 && proofed === totalChapters ? 'done'
    : proofing || editing ? 'running'
    : hasAudit && drafted === totalChapters ? 'running'
    : 'pending';

  const polishSub = (() => {
    if (totalChapters === 0) return 'Audit · line · copy';
    if (proofed === totalChapters) return `All ${totalChapters} polished`;
    if (proofing) return `Copy-editing ${proofed + 1} of ${totalChapters}`;
    if (editing) return `Line-editing ${edited + 1} of ${totalChapters}`;
    if (hasAudit) return auditCount === 0 ? 'Audit clean · starting line-edit' : `Audit found ${auditCount} (${auditResolved} resolved)`;
    return 'Audit · line · copy';
  })();

  return [
    {
      id: 'outline',
      label: 'Outline',
      icon: <BookOpen size={ICON_SIZE} />,
      subtext: hasOutline ? `${chapterCount} chapters · ~${words.toLocaleString()} words` : 'Pending',
      status: hasOutline ? 'done' : book.status === 'outline-pending' ? 'running' : 'pending',
    },
    {
      id: 'cover',
      label: 'Cover',
      icon: <ImageIcon size={ICON_SIZE} />,
      subtext: coverPicked
        ? `Picked #${book.selectedCoverIdx}`
        : hasCovers
          ? 'Pick one'
          : hasOutline
            ? 'Ready'
            : 'Pending',
      status: coverPicked ? 'done' : hasCovers ? 'awaiting-approval' : hasOutline ? 'pending' : 'pending',
    },
    {
      id: 'voice',
      label: 'Voice',
      icon: <Mic size={ICON_SIZE} />,
      subtext: ch1Drafted ? 'Approved' : coverPicked ? 'Drafting' : 'Pending',
      status: drafted > 1 || edited > 0 || proofed > 0 ? 'done' : ch1Drafted ? 'awaiting-approval' : drafting ? 'running' : 'pending',
    },
    {
      id: 'draft',
      label: 'Draft',
      icon: <PenLine size={ICON_SIZE} />,
      subtext: totalChapters > 0 ? `${drafted} of ${totalChapters}` : 'Pending',
      status: draftStatus,
    },
    {
      id: 'polish',
      label: 'Polish',
      icon: <Sparkles size={ICON_SIZE} />,
      subtext: polishSub,
      status: polishStatus,
    },
    {
      id: 'format',
      label: 'Format',
      icon: <Package size={ICON_SIZE} />,
      subtext: 'PDF · EPUB · DOCX',
      status: 'pending',
    },
    {
      id: 'export',
      label: 'Export',
      icon: <Download size={ICON_SIZE} />,
      subtext: 'Zip + KDP kit',
      status: 'pending',
    },
  ];
}

function StagePip({ stage }: { stage: Stage }): JSX.Element {
  const { status, icon, label, subtext } = stage;

  const circleClasses = {
    pending: 'bg-surface-tertiary dark:bg-[#1A1A1A] text-ink-tertiary dark:text-[#555]',
    running:
      'bg-brand-orange text-white shadow-[0_0_0_4px_rgba(255,77,0,0.16)] animate-[mr8-logo-pulse-keyframes_1.6s_ease-in-out_infinite]',
    'awaiting-approval':
      'bg-brand-orange text-white ring-2 ring-offset-2 ring-offset-surface-secondary dark:ring-offset-[#0F0F0F] ring-brand-orange/40',
    done: 'bg-emerald-500 text-white',
    error: 'bg-red-600 text-white',
  } as const;

  const labelClasses = {
    pending: 'text-ink-tertiary dark:text-[#666]',
    running: 'text-ink dark:text-[#E8E8E8] font-semibold',
    'awaiting-approval': 'text-ink dark:text-[#E8E8E8] font-semibold',
    done: 'text-ink dark:text-[#E8E8E8]',
    error: 'text-red-600 dark:text-red-400',
  } as const;

  return (
    <div className="flex items-center gap-2 px-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${circleClasses[status]}`}>
        {status === 'done' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          icon
        )}
      </div>
      <div className="flex flex-col leading-tight">
        <span className={`text-[11px] font-medium ${labelClasses[status]}`}>{label}</span>
        <span className="text-[10px] text-ink-tertiary dark:text-[#666] whitespace-nowrap">{subtext}</span>
      </div>
    </div>
  );
}

function StageConnector({ fromStatus, toStatus }: { fromStatus: StageStatus; toStatus: StageStatus }): JSX.Element {
  const isLeftSolid = fromStatus === 'done';
  const isRightSolid = toStatus === 'done';
  const bothDone = isLeftSolid && isRightSolid;
  // Show a half-filled line when only one side is done.
  return (
    <div className="w-8 h-px mx-1 flex flex-shrink-0">
      <div className={`h-full flex-1 ${bothDone || isLeftSolid ? 'bg-emerald-500' : 'bg-edge dark:bg-[#2A2A2A]'}`} />
      <div className={`h-full flex-1 ${bothDone ? 'bg-emerald-500' : 'bg-edge dark:bg-[#2A2A2A]'}`} />
    </div>
  );
}
