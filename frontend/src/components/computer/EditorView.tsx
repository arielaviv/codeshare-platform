import { COLORS } from './colors';
import type { TimelineEntry } from './types';

export function EditorView({ entry }: { entry: TimelineEntry }): JSX.Element {
  const preview = (entry.writeContent ?? '').split('\n').slice(0, 40);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: COLORS.bgDeep,
        fontFamily: COLORS.mono,
        color: COLORS.text,
      }}
    >
      <div
        style={{
          padding: 10,
          background: COLORS.bg,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: 2,
            color: COLORS.textMute,
            textTransform: 'uppercase',
          }}
        >
          File write
        </div>
        <div style={{ fontSize: 11, marginTop: 2 }}>{entry.writePath ?? '—'}</div>
      </div>
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: 10,
          overflow: 'auto',
          fontSize: 10,
          lineHeight: 1.5,
          color: COLORS.textDim,
          whiteSpace: 'pre-wrap',
        }}
      >
        {preview.join('\n')}
        {(entry.writeContent ?? '').split('\n').length > preview.length && '\n…'}
      </pre>
    </div>
  );
}
