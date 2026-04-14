import { useEffect, useRef } from 'react';
import { useComputer } from '../../contexts/ComputerContext';
import { COLORS, STATUS_COLOR } from './colors';
import type { TimelineEntry } from './types';

const THUMB_W = 80;
const THUMB_H = 60;

export function TimelineScrubber(): JSX.Element | null {
  const { state, setActive, jumpToLive } = useComputer();
  const { timeline, panel } = state;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panel.isLive && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [panel.isLive, timeline.length]);

  if (timeline.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        background: COLORS.bg,
        borderTop: `1px solid ${COLORS.border}`,
        minHeight: THUMB_H + 16,
      }}
    >
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          flex: 1,
          paddingBottom: 4,
          scrollBehavior: 'smooth',
        }}
      >
        {timeline.map((entry, i) => (
          <ThumbCard
            key={entry.id}
            entry={entry}
            isActive={i === panel.activeIndex}
            onClick={() => setActive(i, { isLive: i === timeline.length - 1 })}
          />
        ))}
      </div>
      {!panel.isLive && (
        <button
          type="button"
          onClick={jumpToLive}
          style={{
            flexShrink: 0,
            padding: '4px 10px',
            fontSize: 9,
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontFamily: COLORS.mono,
            background: COLORS.accent,
            color: '#000',
            border: 0,
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          ● Live
        </button>
      )}
    </div>
  );
}

function ThumbCard({
  entry,
  isActive,
  onClick,
}: {
  entry: TimelineEntry;
  isActive: boolean;
  onClick: () => void;
}): JSX.Element {
  const statusColor = STATUS_COLOR[entry.status];
  return (
    <button
      type="button"
      onClick={onClick}
      title={labelFor(entry)}
      style={{
        flexShrink: 0,
        width: THUMB_W,
        height: THUMB_H,
        padding: 0,
        border: `1px solid ${isActive ? COLORS.accent : COLORS.border}`,
        background: COLORS.bgDeep,
        cursor: 'pointer',
        fontFamily: COLORS.mono,
        color: COLORS.text,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isActive ? `0 0 0 2px ${COLORS.accentSoft}` : 'none',
      }}
    >
      <ThumbContent entry={entry} />
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: statusColor,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '1px 4px',
          fontSize: 8,
          letterSpacing: 0.5,
          color: COLORS.textDim,
          background: 'rgba(0,0,0,0.6)',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        {entry.kind}
      </div>
    </button>
  );
}

function ThumbContent({ entry }: { entry: TimelineEntry }): JSX.Element {
  if (entry.kind === 'browser') {
    if (entry.browserScreenshot) {
      return (
        <img
          src={`data:image/png;base64,${entry.browserScreenshot}`}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      );
    }
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 4,
          fontSize: 8,
          color: COLORS.textMute,
          textAlign: 'center',
          overflow: 'hidden',
        }}
        title={entry.browserUrl}
      >
        {hostFromUrl(entry.browserUrl) ?? '—'}
      </div>
    );
  }
  if (entry.kind === 'python') {
    const firstLine = (entry.code ?? '').split('\n').find((l) => l.trim()) ?? '';
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: 4,
          fontSize: 8,
          lineHeight: 1.3,
          color: COLORS.textDim,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {firstLine.length > 36 ? `${firstLine.slice(0, 36)}…` : firstLine}
      </div>
    );
  }
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 4,
        fontSize: 8,
        color: COLORS.textDim,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {entry.writePath ?? 'file'}
    </div>
  );
}

function hostFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function labelFor(entry: TimelineEntry): string {
  if (entry.kind === 'browser') return entry.browserTitle ?? entry.browserUrl ?? 'browser';
  if (entry.kind === 'python') return entry.description ?? (entry.code ?? '').slice(0, 60);
  return entry.writePath ?? 'file write';
}
