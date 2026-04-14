import { useEffect, useRef, useState } from 'react';
import { COLORS } from './colors';

export interface TakeoverSubmitPayload {
  summary: string;
  persistLogin: boolean;
}

interface TakeoverDialogProps {
  currentUrl?: string;
  currentTitle?: string;
  onCancel: () => void;
  onSubmit: (payload: TakeoverSubmitPayload) => void;
}

export function TakeoverDialog({
  currentUrl,
  currentTitle,
  onCancel,
  onSubmit,
}: TakeoverDialogProps): JSX.Element {
  const [summary, setSummary] = useState('');
  const [persistLogin, setPersistLogin] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const canSubmit = summary.trim().length > 0;

  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
        }}
      />
      <div
        role="dialog"
        aria-label="Takeover summary"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
          width: 480,
          maxWidth: 'calc(100vw - 32px)',
          background: COLORS.bg,
          border: `1px solid ${COLORS.borderLight}`,
          borderRadius: 10,
          padding: 20,
          fontFamily: 'system-ui, sans-serif',
          color: COLORS.text,
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: COLORS.accent,
          }}
        >
          Hand back to Mr8
        </div>
        <h2 style={{ margin: '6px 0 4px', fontSize: 18, fontWeight: 600 }}>
          Tell Mr8 what you did
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: COLORS.textDim, lineHeight: 1.5 }}>
          While you had control of the browser, Mr8 was paused. Summarize any changes
          (logins, form submissions, pages you visited) so it can continue with accurate context.
        </p>

        {(currentTitle || currentUrl) && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              background: COLORS.bgDeep,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              fontSize: 11,
              color: COLORS.textDim,
              fontFamily: COLORS.mono,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={currentUrl}
          >
            {currentTitle ? (
              <span style={{ color: COLORS.text }}>{currentTitle}</span>
            ) : null}
            {currentTitle && currentUrl ? ' · ' : ''}
            {currentUrl}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="e.g. logged in with Google, clicked 'Continue' on the consent screen, landed on dashboard."
          style={{
            marginTop: 14,
            width: '100%',
            minHeight: 100,
            padding: 10,
            background: COLORS.bgDeep,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            color: COLORS.text,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            fontSize: 12,
            color: COLORS.textDim,
            userSelect: 'none',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={persistLogin}
            onChange={(e) => setPersistLogin(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Keep me logged in for subsequent Mr8 sessions
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              color: COLORS.textDim,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => canSubmit && onSubmit({ summary: summary.trim(), persistLogin })}
            disabled={!canSubmit}
            style={{
              padding: '8px 14px',
              background: canSubmit ? COLORS.accent : COLORS.border,
              border: 0,
              borderRadius: 6,
              color: canSubmit ? '#000' : COLORS.textMute,
              fontSize: 12,
              fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Hand back
          </button>
        </div>
      </div>
    </>
  );
}
