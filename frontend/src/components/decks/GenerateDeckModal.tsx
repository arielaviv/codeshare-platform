import { useEffect, useRef, useState } from 'react';
import { streamDeckGeneration } from '../../services/deckStream';
import type { ResearchBrief, Slide } from '../../types/deck';
import type { PrizeAward } from '../../types';
import { DECK_TEMPLATES } from './templates';

interface Props {
  onClose: () => void;
  onComplete: (deckId: string) => void;
  onPrizeAwarded?: (prize: PrizeAward) => void;
  initialTopic?: string;
  researchBrief?: ResearchBrief;
  /** When true, auto-submit on mount with the current defaults instead of
   *  showing the wizard. Used by the new "Slide deck" mode flow that already
   *  did its own research and just wants Mr8 to ship the slides. */
  autoStart?: boolean;
}

type Style = 'professional' | 'casual' | 'academic';

export default function GenerateDeckModal({ onClose, onComplete, onPrizeAwarded, initialTopic = '', researchBrief, autoStart = false }: Props) {
  const [topic, setTopic] = useState(initialTopic);
  const [slideCount, setSlideCount] = useState(8);
  const [style, setStyle] = useState<Style>('professional');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const autoStartFiredRef = useRef(false);

  const applyTemplate = (id: string) => {
    const tpl = DECK_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    if (!topic.trim()) setTopic(tpl.topicHint);
    setStyle(tpl.defaultStyle);
    setSlideCount(tpl.defaultSlideCount);
  };
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<Slide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-start when the caller already gathered everything (Slide-deck mode flow).
  useEffect(() => {
    if (!autoStart) return;
    if (autoStartFiredRef.current) return;
    if (!initialTopic || initialTopic.trim().length < 3) return;
    autoStartFiredRef.current = true;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, initialTopic]);

  const submit = () => {
    if (!topic.trim() || topic.trim().length < 3) {
      setError('Topic must be at least 3 characters');
      return;
    }
    setError(null);
    setProgress([]);
    setGenerating(true);

    abortRef.current = streamDeckGeneration(
      {
        topic: topic.trim(),
        slideCount,
        style,
        ...(templateId ? { templateId } : {}),
        ...(researchBrief ? { researchBrief } : {}),
      },
      {
        onStarted() {
          setProgress([]);
        },
        onSlideReceived(slide) {
          setProgress((prev) => [...prev, slide]);
        },
        onComplete({ deckId }) {
          setGenerating(false);
          onComplete(deckId);
        },
        onPrizeAwarded(prize) {
          onPrizeAwarded?.(prize);
        },
        onError(msg) {
          setGenerating(false);
          setError(msg);
        },
      }
    );
  };

  const cancel = () => {
    abortRef.current?.abort();
    setGenerating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-edge dark:border-[#2A2A2A] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink dark:text-[#E8E8E8]">
            {generating ? 'Generating deck…' : 'Generate AI deck'}
          </h2>
          <button
            type="button"
            onClick={cancel}
            className="text-ink-tertiary hover:text-ink dark:text-[#666] dark:hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!generating ? (
          <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto subtle-scrollbar">
            <div>
              <label className="block text-xs font-medium text-ink-secondary dark:text-[#A0A0A0] mb-1.5">
                Start from a template (optional)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {DECK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className={`text-left px-2.5 py-2 text-xs rounded border transition-colors ${
                      templateId === tpl.id
                        ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10'
                        : 'border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#444]'
                    } text-ink dark:text-[#E8E8E8]`}
                  >
                    <div className="font-medium">{tpl.name}</div>
                    <div className="text-[10px] text-ink-tertiary dark:text-[#666] mt-0.5">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary dark:text-[#A0A0A0] mb-1.5">
                Topic
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. AI in healthcare — 2026 landscape and adoption trends"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-surface-secondary dark:bg-[#0A0A0A] border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-accent dark:focus:border-white/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary dark:text-[#A0A0A0] mb-1.5">
                Slide count: {slideCount}
              </label>
              <input
                type="range"
                min={3}
                max={20}
                value={slideCount}
                onChange={(e) => setSlideCount(parseInt(e.target.value, 10))}
                className="w-full accent-accent dark:accent-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary dark:text-[#A0A0A0] mb-1.5">
                Style
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['professional', 'casual', 'academic'] as Style[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    className={`px-3 py-2 text-xs rounded border capitalize transition-colors ${
                      style === s
                        ? 'border-accent dark:border-white bg-accent/10 dark:bg-white/10 text-ink dark:text-white'
                        : 'border-edge dark:border-[#2A2A2A] text-ink-secondary dark:text-[#A0A0A0] hover:border-ink-tertiary dark:hover:border-[#444]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-xs text-status-error bg-status-error/10 border border-status-error/30 px-3 py-2 rounded">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                className="px-5 py-2 text-sm bg-brand-orange hover:bg-brand-orange-hover text-white rounded-full font-semibold transition-colors shadow-[0_4px_14px_rgba(251,119,1,0.35)]"
              >
                Generate
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="text-xs text-ink-tertiary dark:text-[#666]">
              {progress.length > 0
                ? `Drafted ${progress.length} of ${slideCount} slides…`
                : 'Drafting your deck…'}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: slideCount }).map((_, i) => (
                <div
                  key={i}
                  className={`aspect-[16/9] rounded border transition-all ${
                    progress[i]
                      ? 'bg-accent/20 dark:bg-white/20 border-accent dark:border-white animate-fade-slide-up'
                      : 'bg-surface-tertiary dark:bg-[#1A1A1A] border-edge dark:border-[#2A2A2A] skeleton'
                  }`}
                  title={progress[i]?.type}
                />
              ))}
            </div>
            {error && (
              <div className="text-xs text-status-error">{error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
