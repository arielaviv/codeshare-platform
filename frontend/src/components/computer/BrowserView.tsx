import { useState } from 'react';
import { useComputer } from '../../contexts/ComputerContext';
import { COLORS } from './colors';
import type { TimelineEntry } from './types';

export function BrowserView({ entry }: { entry: TimelineEntry }): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false);
  const { setMode } = useComputer();

  if (!entry.streamUrl && !entry.browserScreenshot) {
    return (
      <EmptyBox
        label={entry.status === 'running' ? 'Launching browser…' : 'Browser session ended'}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: COLORS.bgDeep,
        color: COLORS.text,
        fontFamily: COLORS.mono,
      }}
    >
      <UrlBar url={entry.browserUrl} title={entry.browserTitle} />

      <div
        style={{
          position: 'relative',
          flex: 1,
          background: '#000',
          overflow: 'hidden',
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        {entry.streamUrl ? (
          <iframe
            title="mr8-browser-stream"
            src={entry.streamUrl}
            allow="autoplay; fullscreen"
            style={{ border: 0, width: '100%', height: '100%' }}
          />
        ) : entry.browserScreenshot ? (
          <img
            src={`data:image/png;base64,${entry.browserScreenshot}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : null}
        {entry.streamUrl && (
          <button
            type="button"
            onClick={() => setMode('takeover')}
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              padding: '6px 12px',
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontFamily: COLORS.mono,
              background: 'rgba(255,178,41,0.9)',
              color: '#000',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
            title="Take direct control of the browser"
          >
            Take over →
          </button>
        )}
      </div>

      {entry.browserActions && entry.browserActions.length > 0 && (
        <ActionsPanel
          isOpen={actionsOpen}
          onToggle={() => setActionsOpen((v) => !v)}
          entry={entry}
        />
      )}
    </div>
  );
}

function UrlBar({ url, title }: { url?: string; title?: string }): JSX.Element {
  return (
    <div
      style={{
        padding: '8px 12px',
        background: COLORS.bg,
        borderBottom: `1px solid ${COLORS.border}`,
        fontSize: 10,
        letterSpacing: 0.5,
      }}
    >
      <div style={{ color: COLORS.textMute, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase' }}>
        Browser
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
        title={url}
      >
        <span style={{ color: COLORS.text, flexShrink: 0, maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title ?? '—'}
        </span>
        <span style={{ color: COLORS.textMute, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {url ?? ''}
        </span>
      </div>
    </div>
  );
}

function ActionsPanel({
  isOpen,
  onToggle,
  entry,
}: {
  isOpen: boolean;
  onToggle: () => void;
  entry: TimelineEntry;
}): JSX.Element {
  const actions = entry.browserActions ?? [];
  return (
    <div style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'transparent',
          border: 0,
          color: COLORS.textDim,
          fontFamily: COLORS.mono,
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        <span>
          {actions.length} action{actions.length === 1 ? '' : 's'}
        </span>
        <span>{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div
          style={{
            maxHeight: 120,
            overflowY: 'auto',
            padding: '4px 12px 8px',
            fontSize: 10,
            color: COLORS.textDim,
          }}
        >
          {actions.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                padding: '4px 0',
                borderBottom: i < actions.length - 1 ? `1px dashed ${COLORS.border}` : 'none',
              }}
              title={a.target}
            >
              <span style={{ color: COLORS.success, flexShrink: 0, width: 12 }}>✓</span>
              <span style={{ color: COLORS.text, flexShrink: 0, width: 64 }}>{a.action}</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.target}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyBox({ label }: { label: string }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: COLORS.bgDeep,
        color: COLORS.textMute,
        fontFamily: COLORS.mono,
        fontSize: 11,
      }}
    >
      {label}
    </div>
  );
}
