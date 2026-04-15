/**
 * "Task completed" pill with 5-star rating — Manus images #28–29.
 * Clicking a star writes a WtpSignal to SOUL via the soul service.
 */
import { useState } from 'react';
import api from '../../services/api';

interface Props {
  initialRating?: 0 | 1 | 2 | 3 | 4 | 5;
}

export default function TaskCompletedCard({ initialRating = 0 }: Props): JSX.Element {
  const [rating, setRating] = useState<number>(initialRating);
  const [hover, setHover] = useState<number>(0);
  const [submitted, setSubmitted] = useState(initialRating > 0);

  const submitRating = async (value: number) => {
    setRating(value);
    setSubmitted(true);
    try {
      await api.post('/soul/signals/rating', { value });
    } catch {
      // Best-effort; don't block UX
    }
  };

  return (
    <div className="my-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-status-live">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className="text-[14px] font-semibold text-status-live">Task completed</span>
      </div>

      {!submitted ? (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-full">
          <span className="text-[12px] text-ink-secondary dark:text-[#A0A0A0]">How was this result?</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onMouseEnter={() => setHover(v)}
                onMouseLeave={() => setHover(0)}
                onClick={() => submitRating(v)}
                aria-label={`${v} star${v > 1 ? 's' : ''}`}
                className="p-0.5 transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill={v <= (hover || rating) ? '#FFB800' : 'none'}
                  stroke={v <= (hover || rating) ? '#FFB800' : 'currentColor'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={v <= (hover || rating) ? '' : 'text-ink-tertiary dark:text-[#666]'}
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-ink-tertiary dark:text-[#666]">
          Thanks — Mr8 will remember.
        </div>
      )}
    </div>
  );
}
