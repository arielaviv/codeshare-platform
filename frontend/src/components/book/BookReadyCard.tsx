/**
 * BookReadyCard — terminal card shown when the Bundler (Slice 7.iii)
 * finishes. Used inline in the Studio panel and embedded in the chat feed.
 *
 * Cover thumbnail + title + word count + primary "Download zip · X MB"
 * button. Confetti fires once on first mount.
 */
import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Package } from 'lucide-react';

interface Props {
  title: string;
  author?: string;
  coverImageUrl?: string;
  bundleUrl: string;
  bundleSizeBytes: number;
  wordCount?: number;
  /** Ask the platform to skip confetti (reduced-motion preference or re-render). */
  suppressConfetti?: boolean;
}

export default function BookReadyCard({
  title,
  author,
  coverImageUrl,
  bundleUrl,
  bundleSizeBytes,
  wordCount,
  suppressConfetti,
}: Props): JSX.Element {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || suppressConfetti) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      firedRef.current = true;
      return;
    }
    firedRef.current = true;
    confetti({
      particleCount: 220,
      spread: 120,
      startVelocity: 48,
      origin: { y: 0.4 },
      colors: ['#FB7701', '#FFB800', '#FFFFFF', '#1D4ED8'],
      scalar: 1.1,
    });
  }, [suppressConfetti]);

  return (
    <div className="rounded-xl border border-brand-orange/40 bg-gradient-to-br from-brand-orange/5 via-white to-white dark:from-brand-orange/12 dark:via-[#0F0F0F] dark:to-[#0A0A0A] shadow-lg p-5 max-w-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-brand-orange text-white flex items-center justify-center">
          <Package size={18} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-brand-orange font-semibold">
            Book ready
          </div>
          <div className="text-base font-semibold text-ink dark:text-[#E8E8E8] truncate">
            {title}
          </div>
          {author ? (
            <div className="text-xs text-ink-tertiary dark:text-[#888] truncate">
              by {author}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={`${title} cover`}
            className="w-20 h-28 rounded-md object-cover shadow-md border border-edge dark:border-[#2A2A2A] flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-20 h-28 rounded-md bg-surface-tertiary dark:bg-[#1A1A1A] flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-sm text-ink-secondary dark:text-[#A0A0A0] leading-relaxed">
            Everything you need to ship: print-ready PDF, EPUB, DOCX, cover wraps,
            copyright certificate, and a KDP upload guide — in one zip.
          </div>
          <div className="flex items-center gap-3 text-[11px] text-ink-tertiary dark:text-[#777]">
            {typeof wordCount === 'number' && wordCount > 0 ? (
              <span>{wordCount.toLocaleString()} words</span>
            ) : null}
            {typeof wordCount === 'number' && wordCount > 0 ? (
              <span className="text-edge dark:text-[#2A2A2A]">·</span>
            ) : null}
            <span>{formatBytes(bundleSizeBytes)}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <a
          href={bundleUrl}
          download
          className="flex-1 flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange-hover text-white text-sm font-semibold px-4 py-2.5 rounded-full transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download zip · {formatBytes(bundleSizeBytes)}
        </a>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
