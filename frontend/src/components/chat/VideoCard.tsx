/**
 * Inline video result card. While generating: shows progress + spinner.
 * On ready: renders <video controls> + Download MP4.
 */
import { useState } from 'react';
import { getStaticBase } from '../../lib/apiBase';

interface Props {
  videoUrl?: string; // undefined while generating
  durationSec: number;
  refinedPrompt?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progressPercent?: number;
  failReason?: string;
  title?: string;
}

export default function VideoCard({
  videoUrl,
  durationSec,
  refinedPrompt,
  status,
  progressPercent,
  failReason,
  title,
}: Props): JSX.Element {
  const [promptOpen, setPromptOpen] = useState(false);
  const fullUrl = videoUrl
    ? videoUrl.startsWith('http') ? videoUrl : `${getStaticBase()}${videoUrl}`
    : undefined;

  const isWorking = status === 'queued' || status === 'running';

  return (
    <div className="my-3 rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden max-w-[640px]">
      <div className="px-4 py-3 border-b border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F] flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-orange">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
        <span className="text-sm font-semibold text-ink dark:text-[#E8E8E8] flex-1 truncate">
          {title ?? 'Generated video'}
        </span>
        <span className="text-[11px] tabular-nums text-ink-tertiary dark:text-[#666] flex-shrink-0">
          {durationSec}s · Runway
        </span>
      </div>

      <div className="aspect-video bg-ink dark:bg-black flex items-center justify-center relative">
        {fullUrl ? (
          <video
            controls
            src={fullUrl}
            className="w-full h-full"
            preload="metadata"
          >
            Your browser does not support the video element.
          </video>
        ) : status === 'failed' ? (
          <div className="text-status-error text-sm text-center px-6">
            {failReason ?? 'Video generation failed.'}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/80">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin text-brand-orange">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <div className="text-sm">
              {status === 'queued' ? 'Queued at Runway…' : 'Rendering your video…'}
            </div>
            {typeof progressPercent === 'number' && progressPercent > 0 && (
              <div className="w-48 h-1 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full bg-brand-orange transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
            <div className="text-[11px] text-white/50">~30 seconds typical</div>
          </div>
        )}
      </div>

      {refinedPrompt && (
        <div className="border-t border-edge dark:border-[#2A2A2A]">
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-[12px] font-medium text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <span>Refined prompt</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-ink-tertiary transition-transform ${promptOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {promptOpen && (
            <div className="px-4 pb-3 text-[12px] italic text-ink-secondary dark:text-[#A0A0A0] leading-relaxed">
              "{refinedPrompt}"
            </div>
          )}
        </div>
      )}

      {fullUrl && (
        <div className="border-t border-edge dark:border-[#2A2A2A] px-4 py-2 flex justify-end">
          <a
            href={fullUrl}
            download
            className="text-[11px] text-ink-secondary dark:text-[#A0A0A0] hover:text-brand-orange transition-colors"
          >
            Download MP4 →
          </a>
        </div>
      )}
      {isWorking && !fullUrl && (
        <div className="border-t border-edge dark:border-[#2A2A2A] px-4 py-2 text-[11px] text-ink-tertiary dark:text-[#666] text-center">
          You can leave this open — Mr8 will finish in the background.
        </div>
      )}
    </div>
  );
}
