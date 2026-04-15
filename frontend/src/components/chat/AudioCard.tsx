/**
 * Inline audio result card — HTML5 player + voice/duration meta + collapsible
 * script transcript + Download MP3.
 */
import { useState } from 'react';
import { getStaticBase } from '../../lib/apiBase';

interface Props {
  audioUrl: string;
  durationSec: number;
  voiceName: string;
  scriptText: string;
  title?: string;
}

export default function AudioCard({
  audioUrl,
  durationSec,
  voiceName,
  scriptText,
  title,
}: Props): JSX.Element {
  const [scriptOpen, setScriptOpen] = useState(false);
  // audioUrl is server-relative '/uploads/audio/...'; resolve via static base.
  const fullUrl = audioUrl.startsWith('http') ? audioUrl : `${getStaticBase()}${audioUrl}`;
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationLabel = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="my-3 rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
      <div className="px-4 py-3 border-b border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#0F0F0F] flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-orange">
          <path d="M3 12h2l3-9 4 18 3-9h6" />
        </svg>
        <span className="text-sm font-semibold text-ink dark:text-[#E8E8E8] flex-1 truncate">
          {title ?? 'Generated audio'}
        </span>
        <span className="text-[11px] tabular-nums text-ink-tertiary dark:text-[#666] flex-shrink-0">
          {voiceName} · {durationLabel}
        </span>
      </div>

      <div className="px-4 py-3">
        <audio controls src={fullUrl} className="w-full" preload="metadata">
          Your browser does not support the audio element.
        </audio>
      </div>

      <div className="border-t border-edge dark:border-[#2A2A2A]">
        <button
          type="button"
          onClick={() => setScriptOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 text-[12px] font-medium text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
        >
          <span>Script transcript</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-ink-tertiary transition-transform ${scriptOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {scriptOpen && (
          <div className="px-4 pb-3 text-[13px] text-ink-secondary dark:text-[#D4D4D4] whitespace-pre-wrap leading-relaxed">
            {scriptText}
          </div>
        )}
      </div>

      <div className="border-t border-edge dark:border-[#2A2A2A] px-4 py-2 flex justify-end">
        <a
          href={fullUrl}
          download
          className="text-[11px] text-ink-secondary dark:text-[#A0A0A0] hover:text-brand-orange transition-colors"
        >
          Download MP3 →
        </a>
      </div>
    </div>
  );
}
