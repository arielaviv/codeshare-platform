import { useState } from 'react';
import { COLORS } from './colors';
import type { TimelineEntry } from './types';

export function PythonView({ entry }: { entry: TimelineEntry }): JSX.Element {
  const [codeOpen, setCodeOpen] = useState(true);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: COLORS.bgDeep,
        fontFamily: COLORS.mono,
        color: COLORS.text,
        fontSize: 11,
        overflow: 'hidden',
      }}
    >
      <CodeSection entry={entry} open={codeOpen} onToggle={() => setCodeOpen((v) => !v)} />
      <ImagesSection entry={entry} />
      <OutputSection entry={entry} />
      <OutputFilesSection entry={entry} />
      <ErrorSection entry={entry} />
    </div>
  );
}

function CodeSection({
  entry,
  open,
  onToggle,
}: {
  entry: TimelineEntry;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.border}` }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: COLORS.bg,
          border: 0,
          color: COLORS.textDim,
          fontFamily: COLORS.mono,
          fontSize: 9,
          letterSpacing: 2,
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        <span>Code{entry.description ? ` — ${entry.description}` : ''}</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: 10,
            background: COLORS.bgDeep,
            color: COLORS.textDim,
            fontSize: 10,
            lineHeight: 1.5,
            maxHeight: 200,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {entry.code ?? ''}
        </pre>
      )}
    </div>
  );
}

function ImagesSection({ entry }: { entry: TimelineEntry }): JSX.Element | null {
  const pngs = (entry.results ?? []).filter((r) => r.png);
  const htmls = (entry.results ?? []).filter((r) => r.html);
  if (pngs.length === 0 && htmls.length === 0) return null;
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pngs.map((r, i) => (
        <img
          key={`png-${i}`}
          alt=""
          src={`data:image/png;base64,${r.png}`}
          style={{ maxWidth: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
        />
      ))}
      {htmls.map((r, i) => (
        <div
          key={`html-${i}`}
          style={{
            maxHeight: 240,
            overflow: 'auto',
            padding: 8,
            background: '#fff',
            color: '#000',
            borderRadius: 4,
            border: `1px solid ${COLORS.border}`,
          }}
          dangerouslySetInnerHTML={{ __html: r.html ?? '' }}
        />
      ))}
    </div>
  );
}

function OutputSection({ entry }: { entry: TimelineEntry }): JSX.Element {
  const stdout = entry.stdout ?? [];
  const stderr = entry.stderr ?? [];
  if (entry.status !== 'running' && stdout.length === 0 && stderr.length === 0) {
    return <div style={{ padding: 10, color: COLORS.textMute, fontSize: 10 }}>No output.</div>;
  }
  return (
    <div
      style={{
        padding: 10,
        background: COLORS.bgDeep,
        borderTop: `1px solid ${COLORS.border}`,
        maxHeight: 180,
        overflowY: 'auto',
        fontSize: 10,
        lineHeight: 1.5,
      }}
    >
      {stdout.map((line, i) => (
        <div key={`o-${i}`} style={{ color: COLORS.textDim, whiteSpace: 'pre-wrap' }}>
          {line}
        </div>
      ))}
      {stderr.map((line, i) => (
        <div key={`e-${i}`} style={{ color: COLORS.error, whiteSpace: 'pre-wrap' }}>
          {line}
        </div>
      ))}
      {entry.status === 'running' && (
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 12,
            background: COLORS.accent,
            verticalAlign: 'middle',
            animation: 'mr8CursorBlink 1s step-end infinite',
          }}
        />
      )}
    </div>
  );
}

function OutputFilesSection({ entry }: { entry: TimelineEntry }): JSX.Element | null {
  if (!entry.outputFiles || entry.outputFiles.length === 0) return null;
  return (
    <div style={{ padding: 10, borderTop: `1px solid ${COLORS.border}` }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 2,
          color: COLORS.textMute,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        Output files
      </div>
      {entry.outputFiles.map((f, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: COLORS.textDim,
          }}
        >
          <span>{f.path}</span>
          <span>
            {f.format} · {(f.sizeBytes / 1024).toFixed(1)} KB
          </span>
        </div>
      ))}
    </div>
  );
}

function ErrorSection({ entry }: { entry: TimelineEntry }): JSX.Element | null {
  if (!entry.error) return null;
  return (
    <div
      style={{
        padding: 10,
        background: 'rgba(239,68,68,0.08)',
        borderTop: `1px solid ${COLORS.error}`,
        fontSize: 10,
        color: COLORS.error,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {entry.error.name}: {entry.error.value}
      </div>
      {entry.error.traceback && (
        <pre
          style={{
            marginTop: 6,
            fontSize: 9,
            whiteSpace: 'pre-wrap',
            color: '#fca5a5',
          }}
        >
          {entry.error.traceback}
        </pre>
      )}
    </div>
  );
}
