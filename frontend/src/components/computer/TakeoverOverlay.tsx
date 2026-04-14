import { useCallback, useEffect, useMemo, useState } from 'react';
import { COLORS } from './colors';

interface TakeoverOverlayProps {
  streamUrl: string;
  onExit: () => void;
}

function stripViewOnly(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('viewOnly');
    return parsed.toString();
  } catch {
    return url.replace(/[?&]viewOnly=[^&]*/g, '').replace(/\?$/, '');
  }
}

export function TakeoverOverlay({ streamUrl, onExit }: TakeoverOverlayProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const interactiveUrl = useMemo(() => stripViewOnly(streamUrl), [streamUrl]);

  const handleExit = useCallback(() => onExit(), [onExit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: COLORS.bgDeep,
        }}
      >
        <iframe
          src={interactiveUrl}
          title="Mr8 browser takeover"
          allow="autoplay; fullscreen; clipboard-read; clipboard-write"
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      </div>
      <button
        type="button"
        onClick={handleExit}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          background: hovered ? COLORS.borderLight : COLORS.bg,
          border: `1px solid ${COLORS.borderLight}`,
          borderRadius: 8,
          padding: '10px 24px',
          fontSize: 13,
          color: COLORS.text,
          cursor: 'pointer',
          fontFamily: 'system-ui, sans-serif',
          transition: 'background 150ms',
          letterSpacing: 0.3,
        }}
        aria-label="Exit browser takeover"
      >
        Exit takeover (Esc)
      </button>
    </>
  );
}
