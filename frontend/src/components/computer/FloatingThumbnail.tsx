import { useEffect, useState, type CSSProperties } from 'react';
import { useComputer } from '../../contexts/ComputerContext';
import { COLORS, KEYFRAMES, STATUS_COLOR } from './colors';
import type { TimelineEntry } from './types';

const CARD_WIDTH = 280;
const CARD_HEIGHT = 180;

export function FloatingThumbnail(): JSX.Element | null {
  const { state, setMode, activeEntry } = useComputer();

  if (state.panel.mode !== 'compact') return null;
  if (!activeEntry) return null;

  const statusColor = STATUS_COLOR[activeEntry.status];
  const elapsed = useElapsed(activeEntry.timestamp, activeEntry.status === 'running');

  return (
    <>
      <style>{KEYFRAMES}</style>
      <button
        type="button"
        aria-label="Expand Mr8's Computer"
        onClick={() => setMode('expanded')}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 15,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: 0,
          boxShadow: '0 20px 40px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02)',
          cursor: 'pointer',
          overflow: 'hidden',
          fontFamily: COLORS.mono,
          color: COLORS.text,
          textAlign: 'left',
          animation: 'mr8ComputerSlideIn 280ms cubic-bezier(.2,.9,.3,1)',
        }}
      >
        <CornerBrackets />
        <ScanLine />
        <Header kind={activeEntry.kind} elapsed={elapsed} statusColor={statusColor} />
        <Preview entry={activeEntry} />
        <Footer entry={activeEntry} />
      </button>
    </>
  );
}

function CornerBrackets(): JSX.Element {
  const size = 10;
  const stroke: CSSProperties = { position: 'absolute', background: COLORS.borderLight };
  return (
    <>
      <div style={{ ...stroke, top: 6, left: 6, width: size, height: 1 }} />
      <div style={{ ...stroke, top: 6, left: 6, width: 1, height: size }} />
      <div style={{ ...stroke, top: 6, right: 6, width: size, height: 1 }} />
      <div style={{ ...stroke, top: 6, right: 6, width: 1, height: size }} />
      <div style={{ ...stroke, bottom: 6, left: 6, width: size, height: 1 }} />
      <div style={{ ...stroke, bottom: 6, left: 6, width: 1, height: size }} />
      <div style={{ ...stroke, bottom: 6, right: 6, width: size, height: 1 }} />
      <div style={{ ...stroke, bottom: 6, right: 6, width: 1, height: size }} />
    </>
  );
}

function ScanLine(): JSX.Element {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 24,
          background: `linear-gradient(to bottom, transparent, ${COLORS.accentSoft} 50%, transparent)`,
          animation: 'mr8ScanLine 1400ms ease-in-out 1',
        }}
      />
    </div>
  );
}

function Header({
  kind,
  elapsed,
  statusColor,
}: {
  kind: TimelineEntry['kind'];
  elapsed: string;
  statusColor: string;
}): JSX.Element {
  const label = kind === 'browser' ? 'BROWSER' : kind === 'python' ? 'PYTHON' : 'EDITOR';
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: 16,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 9,
        letterSpacing: 1.5,
        color: COLORS.textDim,
        textTransform: 'uppercase',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
            animation: 'mr8AccentPulse 1200ms ease-in-out infinite',
          }}
        />
        <span style={{ color: COLORS.text }}>MR8 · {label}</span>
      </div>
      <span style={{ color: COLORS.textMute, fontVariantNumeric: 'tabular-nums' }}>{elapsed}</span>
    </div>
  );
}

function Preview({ entry }: { entry: TimelineEntry }): JSX.Element {
  if (entry.kind === 'browser') {
    return (
      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: 30,
          bottom: 44,
          background: COLORS.bgDeep,
          border: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {entry.browserScreenshot ? (
          <img
            src={`data:image/png;base64,${entry.browserScreenshot}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 10, color: COLORS.textMute, padding: 8, textAlign: 'center' }}>
            {entry.browserUrl ?? 'Launching browser…'}
          </span>
        )}
      </div>
    );
  }
  if (entry.kind === 'python') {
    const lines = (entry.code ?? '').split('\n').slice(0, 5);
    return (
      <pre
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: 30,
          bottom: 44,
          margin: 0,
          padding: 10,
          background: COLORS.bgDeep,
          border: `1px solid ${COLORS.border}`,
          fontFamily: COLORS.mono,
          fontSize: 10,
          lineHeight: 1.5,
          color: COLORS.textDim,
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
        }}
      >
        {lines.join('\n')}
      </pre>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        top: 30,
        bottom: 44,
        background: COLORS.bgDeep,
        border: `1px solid ${COLORS.border}`,
        padding: 10,
        fontSize: 10,
        color: COLORS.textDim,
      }}
    >
      <div style={{ color: COLORS.text }}>{entry.writePath}</div>
      <div style={{ marginTop: 4, opacity: 0.6 }}>
        {(entry.writeContent ?? '').split('\n').slice(0, 3).join('\n')}
      </div>
    </div>
  );
}

function Footer({ entry }: { entry: TimelineEntry }): JSX.Element {
  const hint =
    entry.kind === 'browser'
      ? entry.browserTitle ?? 'Navigating…'
      : entry.kind === 'python'
        ? entry.description ?? 'Python execution'
        : 'File write';
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 10,
        left: 16,
        right: 16,
        fontSize: 10,
        color: COLORS.textDim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={hint}>
        {hint}
      </span>
      <span style={{ color: COLORS.accent, fontSize: 9, letterSpacing: 1 }}>TAP ↗</span>
    </div>
  );
}

function useElapsed(startedAt: number, running: boolean): string {
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [running]);
  const ms = Date.now() - startedAt;
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}
