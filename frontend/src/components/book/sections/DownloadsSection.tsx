/**
 * Downloads section — grouped rows, one per artifact, with real states.
 *
 * Slice 4a: no deliverables exist yet; all rows render DISABLED with
 * stage-gated tooltips so the user understands the sequence ("Available
 * after chapter drafting completes", "Available after format stage", etc.)
 * and sees what their finished bundle will contain.
 *
 * When Slices 4b–9 land, the `disabled` flags flip to false and the
 * `downloadUrl` fields populate from book.buildUrls / book.audioUrl / etc.
 * The shape of this component doesn't change — we just unlock rows.
 */
import { File, FileAudio, FileText, FileImage, Package, Globe } from 'lucide-react';

interface BookShape {
  _id: string;
  title: string;
  outline?: { chapters: Array<unknown> };
  selectedCoverIdx?: number;
  status: string;
  /** Future fields — populate as stages complete. */
  buildUrls?: { pdf?: string; epub?: string; docx?: string };
  audioUrl?: string;
  bundleUrl?: string;
  translations?: Array<{ lang: string; url?: string }>;
}

interface Props {
  book: BookShape;
}

interface DownloadRow {
  key: string;
  icon: JSX.Element;
  name: string;
  meta: string;
  url?: string;
  disabledReason?: string;
}

interface DownloadGroup {
  title: string;
  rows: DownloadRow[];
}

const ICON = { size: 16, strokeWidth: 1.8 } as const;

export default function DownloadsSection({ book }: Props): JSX.Element {
  const groups = buildGroups(book);
  const ready = groups.flatMap((g) => g.rows).filter((r) => !r.disabledReason).length;
  const total = groups.flatMap((g) => g.rows).length;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Hero "Download everything" row */}
      <MasterBundleRow book={book} />

      <div className="text-[11px] text-ink-tertiary dark:text-[#666] tracking-wider uppercase">
        {ready} of {total} artifacts ready
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-tertiary dark:text-[#666] mb-2 px-1">
            {group.title}
          </div>
          <div className="rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#0F0F0F] divide-y divide-edge dark:divide-[#2A2A2A] overflow-hidden">
            {group.rows.map((row) => (
              <DownloadRowItem key={row.key} row={row} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MasterBundleRow({ book }: { book: BookShape }): JSX.Element {
  const ready = Boolean(book.bundleUrl);
  return (
    <div
      className={`rounded-lg border flex items-center gap-4 p-4 ${
        ready
          ? 'border-brand-orange bg-brand-orange-soft dark:bg-brand-orange/10'
          : 'border-dashed border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F]'
      }`}
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center ${
        ready ? 'bg-brand-orange text-white' : 'bg-surface-tertiary dark:bg-[#1A1A1A] text-ink-tertiary dark:text-[#666]'
      }`}>
        <Package {...ICON} size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink dark:text-[#E8E8E8]">
          Mr8-Book-{slugify(book.title)}.zip
        </div>
        <div className="text-[11px] text-ink-tertiary dark:text-[#888] mt-0.5">
          {ready
            ? 'Everything — print PDF, EPUB, DOCX, audiobook, cover wraps, translations, KDP kit, copyright cert.'
            : 'Your complete bundle — available once all stages finish.'}
        </div>
      </div>
      {ready && book.bundleUrl ? (
        <a
          href={book.bundleUrl}
          download
          className="flex-shrink-0 text-xs font-semibold bg-brand-orange hover:bg-brand-orange-hover text-white px-4 py-2 rounded-full transition-colors"
        >
          Download
        </a>
      ) : (
        <span className="flex-shrink-0 text-[11px] text-ink-tertiary dark:text-[#666] italic">
          Not ready
        </span>
      )}
    </div>
  );
}

function DownloadRowItem({ row }: { row: DownloadRow }): JSX.Element {
  const disabled = Boolean(row.disabledReason);
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        disabled ? 'opacity-60' : 'hover:bg-surface-secondary dark:hover:bg-[#0A0A0A]'
      }`}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded bg-surface-tertiary dark:bg-[#1A1A1A] flex items-center justify-center text-ink-tertiary dark:text-[#888]">
        {row.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${disabled ? 'text-ink-tertiary dark:text-[#888]' : 'text-ink dark:text-[#E8E8E8]'}`}>
          {row.name}
        </div>
        <div className="text-[11px] text-ink-tertiary dark:text-[#666] truncate mt-0.5">
          {disabled ? row.disabledReason : row.meta}
        </div>
      </div>
      {disabled ? (
        <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-ink-tertiary dark:text-[#666]">
          Locked
        </span>
      ) : row.url ? (
        <a
          href={row.url}
          download
          className="flex-shrink-0 text-xs font-medium text-brand-orange hover:text-brand-orange-hover"
        >
          Download
        </a>
      ) : null}
    </div>
  );
}

function buildGroups(book: BookShape): DownloadGroup[] {
  const hasOutline = Boolean(book.outline?.chapters?.length);
  const coverPicked = typeof book.selectedCoverIdx === 'number';
  const draftsReady = false; // Slice 4b
  const polishReady = false; // Slice 5
  const formatReady = Boolean(book.buildUrls?.pdf); // Slice 7
  const audioReady = Boolean(book.audioUrl); // Slice 8
  // Slice 9 — unlocks the per-language rows individually via `url` presence;
  // no aggregate flag needed here.

  const reasonByStage = {
    outline: 'Available after outline is approved.',
    cover: 'Available after you pick a cover.',
    draft: 'Available after chapter drafting completes.',
    polish: 'Available after the editing pass finishes.',
    format: 'Available after formatting completes.',
    audio: 'Available after narration completes.',
    translations: 'Available after translations complete.',
  } as const;

  const stage = !hasOutline
    ? 'outline'
    : !coverPicked
      ? 'cover'
      : !draftsReady
        ? 'draft'
        : !polishReady
          ? 'polish'
          : 'format';

  return [
    {
      title: 'Print',
      rows: [
        {
          key: 'pdf',
          icon: <FileText {...ICON} />,
          name: 'book.pdf',
          meta: 'Print-ready · 6×9 · chapter breaks on right pages',
          url: book.buildUrls?.pdf,
          disabledReason: formatReady ? undefined : reasonByStage[stage],
        },
        {
          key: 'cover-wrap-pb',
          icon: <FileImage {...ICON} />,
          name: 'cover-wrap-paperback.pdf',
          meta: 'Full KDP wrap · spine-width correct · bleeds set',
          disabledReason: formatReady ? undefined : reasonByStage.format,
        },
        {
          key: 'cover-wrap-hc',
          icon: <FileImage {...ICON} />,
          name: 'cover-wrap-hardcover.pdf',
          meta: 'Hardcover KDP wrap · wider spine math',
          disabledReason: formatReady ? undefined : reasonByStage.format,
        },
      ],
    },
    {
      title: 'Digital',
      rows: [
        {
          key: 'epub',
          icon: <File {...ICON} />,
          name: 'book.epub',
          meta: 'Kindle · Apple Books · drop caps + embedded cover',
          url: book.buildUrls?.epub,
          disabledReason: formatReady ? undefined : reasonByStage[stage],
        },
        {
          key: 'docx',
          icon: <FileText {...ICON} />,
          name: 'book.docx',
          meta: 'Editable · Word reference styles applied',
          url: book.buildUrls?.docx,
          disabledReason: formatReady ? undefined : reasonByStage[stage],
        },
      ],
    },
    {
      title: 'Audio',
      rows: [
        {
          key: 'full-mp3',
          icon: <FileAudio {...ICON} />,
          name: 'full.mp3',
          meta: 'Complete audiobook · ElevenLabs · your chosen voice',
          url: book.audioUrl,
          disabledReason: audioReady ? undefined : reasonByStage.audio,
        },
      ],
    },
    {
      title: 'Translations',
      // v1: Spanish + French only. Arabic + Hebrew deferred to v2 (RTL +
      // Hebrew biblical-resonance craft work).
      rows: ['es', 'fr'].map((lang) => {
        const url = book.translations?.find((t) => t.lang === lang)?.url;
        return {
          key: `xl-${lang}`,
          icon: <Globe {...ICON} />,
          name: `${lang}-book.epub`,
          meta: `${LANG_LABEL[lang] ?? lang} · full translation · typeset in the same theme`,
          url,
          disabledReason: url ? undefined : reasonByStage.translations,
        };
      }),
    },
    {
      title: 'Kit',
      rows: [
        {
          key: 'copyright',
          icon: <FileText {...ICON} />,
          name: 'copyright-certificate.pdf',
          meta: 'Author name · timestamp · manuscript SHA-256 hash',
          disabledReason: formatReady ? undefined : reasonByStage.format,
        },
        {
          key: 'kdp',
          icon: <FileText {...ICON} />,
          name: 'kdp-upload-guide.pdf',
          meta: 'Personalized 10-minute walkthrough for KDP',
          disabledReason: formatReady ? undefined : reasonByStage.format,
        },
        {
          key: 'meta',
          icon: <FileText {...ICON} />,
          name: 'metadata.csv',
          meta: 'Pre-filled title, description, keywords, BISAC categories',
          disabledReason: polishReady ? undefined : reasonByStage.polish,
        },
      ],
    },
  ];
}

const LANG_LABEL: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'book';
}
