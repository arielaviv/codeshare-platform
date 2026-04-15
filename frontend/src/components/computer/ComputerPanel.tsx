import { useComputer } from '../../contexts/ComputerContext';
import { BrowserView } from './BrowserView';
import { EditorView } from './EditorView';
import { PythonView } from './PythonView';
import { TimelineScrubber } from './TimelineScrubber';
import { COLORS, KEYFRAMES } from './colors';

export function ComputerPanel(): JSX.Element | null {
  // Visibility is now driven by the parent (AIChatPage's artifact panel +
  // rightTab === 'computer'). This component just renders content; it no longer
  // self-gates on `panel.mode`.
  const { activeEntry } = useComputer();

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        role="dialog"
        aria-label="Mr8's Computer"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: COLORS.bgDeep,
          color: COLORS.text,
          fontFamily: COLORS.mono,
          borderLeft: `1px solid ${COLORS.border}`,
          animation: 'mr8ComputerSlideIn 280ms cubic-bezier(.2,.9,.3,1)',
          overflow: 'hidden',
        }}
      >
        <Header />
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {activeEntry ? <ActiveView /> : <EmptyState />}
        </div>
        <TimelineScrubber />
      </div>
    </>
  );
}

function Header(): JSX.Element {
  const { setMode } = useComputer();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: COLORS.bg,
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            background: COLORS.accent,
            borderRadius: 2,
          }}
        />
        <span
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: COLORS.text,
            textTransform: 'uppercase',
          }}
        >
          Mr8's Computer
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <HeaderButton label="Minimize" onClick={() => setMode('compact')}>
          —
        </HeaderButton>
        <HeaderButton label="Close" onClick={() => setMode('hidden')}>
          ✕
        </HeaderButton>
      </div>
    </div>
  );
}

function HeaderButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 22,
        height: 22,
        background: 'transparent',
        border: `1px solid ${COLORS.border}`,
        color: COLORS.textDim,
        fontSize: 11,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function ActiveView(): JSX.Element {
  const { activeEntry } = useComputer();
  if (!activeEntry) return <EmptyState />;
  switch (activeEntry.kind) {
    case 'browser':
      return <BrowserView entry={activeEntry} />;
    case 'python':
      return <PythonView entry={activeEntry} />;
    case 'editor':
      return <EditorView entry={activeEntry} />;
    default:
      return <EmptyState />;
  }
}

function EmptyState(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: COLORS.textMute,
        fontSize: 11,
        fontFamily: COLORS.mono,
      }}
    >
      No activity yet. Ask Mr8 to browse or run Python.
    </div>
  );
}
