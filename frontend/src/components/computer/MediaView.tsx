/**
 * Renders generated images (Design skill / generate_image tool results)
 * inside Mr8's Computer modal. Matches Manus image #26 — "Manus's Computer
 * · Manus is using Media viewer · Generating image /home/.../foo.png".
 */
import type { TimelineEntry } from './types';

interface Props {
  entry: TimelineEntry;
}

export function MediaView({ entry }: Props): JSX.Element {
  const isGenerating = entry.status === 'running';
  const url = entry.mediaImageUrl;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0A0A0A]">
      {/* File path subtitle row */}
      {entry.mediaPath && (
        <div className="flex items-center justify-center px-4 py-2 border-b border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0F0F0F]">
          <span className="text-[12px] font-mono text-ink-secondary dark:text-[#A0A0A0] truncate max-w-full">
            {entry.mediaPath}
          </span>
        </div>
      )}

      {/* Image / placeholder */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-6 bg-white dark:bg-[#0A0A0A]">
        {url ? (
          <img
            src={url}
            alt={entry.mediaAlt ?? 'Generated image'}
            className="max-w-full max-h-full object-contain rounded-md shadow-lg"
            style={{
              width: entry.mediaWidth ? `${entry.mediaWidth}px` : undefined,
              height: entry.mediaHeight ? `${entry.mediaHeight}px` : undefined,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          />
        ) : isGenerating ? (
          <div className="flex flex-col items-center gap-3">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-spin text-brand-orange"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <div className="text-sm text-ink-secondary dark:text-[#A0A0A0]">
              Generating image…
            </div>
            {entry.mediaPrompt && (
              <div className="text-xs text-ink-tertiary dark:text-[#666] max-w-md text-center italic">
                "{entry.mediaPrompt}"
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink-tertiary dark:text-[#666]">
            No image
          </div>
        )}
      </div>

      {/* Dimensions caption */}
      {url && entry.mediaWidth && entry.mediaHeight && (
        <div className="px-4 py-2 border-t border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0F0F0F] text-[11px] text-ink-tertiary dark:text-[#666] text-center">
          {entry.mediaWidth} × {entry.mediaHeight}
          {entry.mediaModel && (
            <>
              {' · '}
              <span className="font-mono">{entry.mediaModel}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
