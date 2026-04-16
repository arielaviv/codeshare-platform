/**
 * Downloads section — grouped rows, one per artifact, with real states.
 *
 * Reads from `book.artifacts[]`, which is populated by the Formatter
 * (Slice 7.ii) and Bundler (Slice 7.iii). Audio artifacts arrive in
 * Slice 8, translations in Slice 9.
 */
import { useMemo } from 'react';
import { File, FileAudio, FileText, FileImage, Package, Globe } from 'lucide-react';

export type DownloadArtifactKind =
  | 'pdf'
  | 'epub'
  | 'docx'
  | 'cover-wrap-paperback'
  | 'cover-wrap-hardcover'
  | 'cover-for-epub'
  | 'copyright-cert'
  | 'kdp-guide'
  | 'bundle-zip'
  | 'audiobook'
  | 'translation-pdf'
  | 'translation-epub';

export interface BookArtifactShape {
  kind: DownloadArtifactKind;
  url: string;
  sizeBytes: number;
  builtAt?: string;
  lang?: string;
}

interface BookShape {
  _id: string;
  title: string;
  outline?: { chapters: Array<unknown> };
  selectedCoverIdx?: number;
  status: string;
  artifacts?: BookArtifactShape[];
  bundleUrl?: string;
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
  const artifactsByKey = useMemo(() => {
    const m = new Map<string, BookArtifactShape>();
    for (const a of book.artifacts ?? []) {
      const key = `${a.kind}:${a.lang ?? 'en'}`;
      m.set(key, a);
    }
    return m;
  }, [book.artifacts]);

  const groups = buildGroups(book, artifactsByKey);
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

function pick(
  map: Map<string, BookArtifactShape>,
  kind: DownloadArtifactKind,
  lang: string = 'en'
): BookArtifactShape | undefined {
  return map.get(`${kind}:${lang}`);
}

function buildGroups(
  book: BookShape,
  artifactsByKey: Map<string, BookArtifactShape>
): DownloadGroup[] {
  const hasOutline = Boolean(book.outline?.chapters?.length);
  const coverPicked = typeof book.selectedCoverIdx === 'number';
  const pdf = pick(artifactsByKey, 'pdf');
  const epub = pick(artifactsByKey, 'epub');
  const docx = pick(artifactsByKey, 'docx');
  const coverWrapPb = pick(artifactsByKey, 'cover-wrap-paperback');
  const coverWrapHc = pick(artifactsByKey, 'cover-wrap-hardcover');
  const copyrightCert = pick(artifactsByKey, 'copyright-cert');
  const kdpGuide = pick(artifactsByKey, 'kdp-guide');
  const audiobook = pick(artifactsByKey, 'audiobook');
  const formatReady = Boolean(pdf || epub || docx);

  const reasonByStage = {
    outline: 'Available after outline is approved.',
    cover: 'Available after you pick a cover.',
    draft: 'Available after chapter drafting completes.',
    polish: 'Available after the editing pass finishes.',
    format: 'Available after formatting completes.',
    wrap: 'Available after Slice 7.iii — cover wraps.',
    audio: 'Available after narration completes.',
    translations: 'Available after translations complete.',
    kit: 'Available after Slice 7.iii — kit PDFs.',
  } as const;

  const stage = !hasOutline
    ? 'outline'
    : !coverPicked
      ? 'cover'
      : !formatReady
        ? 'format'
        : 'format';

  return [
    {
      title: 'Print',
      rows: [
        {
          key: 'pdf',
          icon: <FileText {...ICON} />,
          name: 'book.pdf',
          meta: pdf
            ? `Print-ready · ${formatBytes(pdf.sizeBytes)}`
            : 'Print-ready · 6×9 · chapter breaks on right pages',
          url: pdf?.url,
          disabledReason: pdf ? undefined : reasonByStage[stage],
        },
        {
          key: 'cover-wrap-pb',
          icon: <FileImage {...ICON} />,
          name: 'cover-wrap-paperback.pdf',
          meta: coverWrapPb
            ? `Paperback wrap · ${formatBytes(coverWrapPb.sizeBytes)}`
            : 'Full KDP wrap · spine-width correct · bleeds set',
          url: coverWrapPb?.url,
          disabledReason: coverWrapPb ? undefined : reasonByStage.wrap,
        },
        {
          key: 'cover-wrap-hc',
          icon: <FileImage {...ICON} />,
          name: 'cover-wrap-hardcover.pdf',
          meta: coverWrapHc
            ? `Hardcover wrap · ${formatBytes(coverWrapHc.sizeBytes)}`
            : 'Hardcover KDP wrap · wider spine math',
          url: coverWrapHc?.url,
          disabledReason: coverWrapHc ? undefined : reasonByStage.wrap,
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
          meta: epub
            ? `EPUB · ${formatBytes(epub.sizeBytes)}`
            : 'Kindle · Apple Books · drop caps + embedded cover',
          url: epub?.url,
          disabledReason: epub ? undefined : reasonByStage[stage],
        },
        {
          key: 'docx',
          icon: <FileText {...ICON} />,
          name: 'book.docx',
          meta: docx
            ? `Word · ${formatBytes(docx.sizeBytes)}`
            : 'Editable · Word reference styles applied',
          url: docx?.url,
          disabledReason: docx ? undefined : reasonByStage[stage],
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
          meta: audiobook
            ? `Audiobook · ${formatBytes(audiobook.sizeBytes)}`
            : 'Complete audiobook · ElevenLabs · your chosen voice',
          url: audiobook?.url,
          disabledReason: audiobook ? undefined : reasonByStage.audio,
        },
      ],
    },
    {
      title: 'Translations',
      // v1: Spanish + French only. Arabic + Hebrew deferred to v2 (RTL +
      // Hebrew biblical-resonance craft work).
      rows: ['es', 'fr'].map((lang) => {
        const tEpub = pick(artifactsByKey, 'translation-epub', lang);
        return {
          key: `xl-${lang}`,
          icon: <Globe {...ICON} />,
          name: `${lang}-book.epub`,
          meta: tEpub
            ? `${LANG_LABEL[lang] ?? lang} · ${formatBytes(tEpub.sizeBytes)}`
            : `${LANG_LABEL[lang] ?? lang} · full translation · typeset in the same theme`,
          url: tEpub?.url,
          disabledReason: tEpub ? undefined : reasonByStage.translations,
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
          meta: copyrightCert
            ? `Certificate · ${formatBytes(copyrightCert.sizeBytes)}`
            : 'Author name · timestamp · manuscript SHA-256 hash',
          url: copyrightCert?.url,
          disabledReason: copyrightCert ? undefined : reasonByStage.kit,
        },
        {
          key: 'kdp',
          icon: <FileText {...ICON} />,
          name: 'kdp-upload-guide.pdf',
          meta: kdpGuide
            ? `Guide · ${formatBytes(kdpGuide.sizeBytes)}`
            : 'Personalized 10-minute walkthrough for KDP',
          url: kdpGuide?.url,
          disabledReason: kdpGuide ? undefined : reasonByStage.kit,
        },
      ],
    },
  ];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
