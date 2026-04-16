import { useState, useEffect, useCallback, useRef } from 'react';
import { Library as LibraryIcon, Maximize2, Minimize2, Palette, Sparkles } from 'lucide-react';
import { wcManager, type WCState } from '../lib/webcontainer-manager';
import { Tooltip } from './ui/Tooltip';
import { ThemeEditor } from './preview/ThemeEditor';
import { LibraryPanel } from './preview/LibraryPanel';
import { EditModeToolbar, type EditPatch } from './preview/EditModeToolbar';

type DeviceMode = 'desktop' | 'tablet' | 'phone';

const DEVICE_WIDTHS: Record<DeviceMode, string | null> = {
  desktop: null,
  tablet: '768px',
  phone: '402px',
};

interface PreviewPanelProps {
  files: Map<string, string>;
  isGenerating: boolean;
  fallbackHtml: string | null;
  projectName?: string;
  onAddAiChat?: () => void;
  onSaveEdits?: (edits: EditPatch[], selectorHint: string) => void;
}

type RightDrawer = null | 'theme' | 'library';

export default function PreviewPanel({ files, isGenerating, fallbackHtml, projectName, onAddAiChat, onSaveEdits }: PreviewPanelProps) {
  const [wcState, setWCState] = useState<WCState>(wcManager.getState());
  const [useWC, setUseWC] = useState(false);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [fullScreen, setFullScreen] = useState(false);
  const [drawer, setDrawer] = useState<RightDrawer>(null);
  const [editMode, setEditMode] = useState(false);
  const [selection, setSelection] = useState<null | {
    rect: { x: number; y: number; w: number; h: number };
    tag: string;
    text: string;
  }>(null);
  const [edits, setEdits] = useState<EditPatch[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeWrapRef = useRef<HTMLDivElement | null>(null);
  const hasBootedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Bridge: listen for hover/select posts from the injected edit script.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; rect?: { x: number; y: number; w: number; h: number }; tag?: string; text?: string } | null;
      if (!m || typeof m.type !== 'string') return;
      if (!m.type.startsWith('mr8/')) return;
      const wrap = iframeWrapRef.current;
      if (!wrap) return;
      const wrapRect = wrap.getBoundingClientRect();
      const r = m.rect;
      if (!r) return;
      // Translate iframe-local coords to viewport coords.
      const adjusted = { x: r.x + wrapRect.left, y: r.y + wrapRect.top, w: r.w, h: r.h };
      if (m.type === 'mr8/select') {
        setSelection({ rect: adjusted, tag: m.tag ?? 'div', text: m.text ?? '' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Toggle edit mode → post message into iframe.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: editMode ? 'mr8/edit-on' : 'mr8/edit-off' },
      '*'
    );
    if (!editMode) {
      setSelection(null);
      setEdits([]);
    }
  }, [editMode, wcState.url]);

  const applyPatch = useCallback((patch: EditPatch) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'mr8/apply', patch }, '*');
    setEdits((prev) => [...prev, patch]);
    if (patch.remove) setSelection(null);
  }, []);

  const saveEdits = useCallback(() => {
    if (!onSaveEdits || edits.length === 0 || !selection) return;
    const hint = `<${selection.tag}> "${selection.text.slice(0, 60)}"`;
    onSaveEdits(edits, hint);
    setEdits([]);
    setEditMode(false);
  }, [edits, onSaveEdits, selection]);

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullScreen]);

  useEffect(() => wcManager.subscribe(setWCState), []);

  useEffect(() => {
    if (hasBootedRef.current || !files.has('package.json')) return;
    const hasSrc = Array.from(files.keys()).some(k => k.startsWith('src/'));
    if (files.has('index.html') || hasSrc) {
      setUseWC(true);
      hasBootedRef.current = true;
      wcManager.run(files);
    }
  }, [files]);

  useEffect(() => {
    if (!useWC || wcState.status !== 'running') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => wcManager.updateFiles(files), 150);
    return () => clearTimeout(debounceRef.current);
  }, [files, useWC, wcState.status]);

  const refresh = useCallback(() => {
    wcManager.destroy().then(() => {
      hasBootedRef.current = false;
      setUseWC(false);
    });
  }, []);

  if (useWC && wcState.status === 'running' && wcState.url) {
    const width = DEVICE_WIDTHS[device];
    const panel = (
      <div className="h-full flex bg-surface-secondary dark:bg-[#1A1A1A]">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-edge dark:border-[#2A2A2A] flex-shrink-0">
            {(['desktop', 'tablet', 'phone'] as const).map((d) => (
              <Tooltip key={d} content={d.charAt(0).toUpperCase() + d.slice(1)} side="bottom">
                <button
                  onClick={() => setDevice(d)}
                  className={`p-1.5 rounded transition-colors ${device === d ? 'text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#333]' : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'}`}
                  aria-label={d}
                >
                  {d === 'desktop' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                  ) : d === 'tablet' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                  )}
                </button>
              </Tooltip>
            ))}
            <div className="flex-1" />
            <Tooltip content={editMode ? 'Exit edit mode' : 'Edit elements'} side="bottom">
              <button
                onClick={() => setEditMode((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium transition-colors ${
                  editMode
                    ? 'bg-brand-orange text-white'
                    : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
                }`}
                aria-label="Edit mode"
              >
                <Sparkles size={12} /> Edit
              </button>
            </Tooltip>
            <Tooltip content="Change theme" side="bottom">
              <button
                onClick={() => setDrawer((d) => (d === 'theme' ? null : 'theme'))}
                className={`p-1.5 rounded transition-colors ${drawer === 'theme' ? 'text-brand-orange' : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'}`}
                aria-label="Change theme"
              >
                <Palette size={14} />
              </button>
            </Tooltip>
            <Tooltip content="Library" side="bottom">
              <button
                onClick={() => setDrawer((d) => (d === 'library' ? null : 'library'))}
                className={`p-1.5 rounded transition-colors ${drawer === 'library' ? 'text-brand-orange' : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'}`}
                aria-label="Library"
              >
                <LibraryIcon size={14} />
              </button>
            </Tooltip>
            <Tooltip content={fullScreen ? 'Exit full screen (Esc)' : 'Full screen'} side="bottom">
              <button
                onClick={() => setFullScreen((v) => !v)}
                className="p-1.5 text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0] transition-colors"
                aria-label={fullScreen ? 'Exit full screen' : 'Full screen'}
              >
                {fullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </Tooltip>
            <Tooltip content="Refresh preview" side="bottom">
              <button
                onClick={refresh}
                className="p-1.5 text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0] transition-colors"
                aria-label="Refresh"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </Tooltip>
          </div>
          <div ref={iframeWrapRef} className="flex-1 flex items-start justify-center overflow-auto bg-surface-tertiary dark:bg-[#111] p-2 relative">
            <iframe
              ref={iframeRef}
              src={wcState.url}
              className="bg-white border-0 h-full transition-all duration-300"
              style={{ width: width || '100%', maxWidth: '100%' }}
              title="Preview"
            />
            {editMode && selection && (
              <EditModeToolbar
                anchor={selection.rect}
                tag={selection.tag}
                text={selection.text}
                onPatch={applyPatch}
                onSave={saveEdits}
                onClose={() => setSelection(null)}
                edited={edits.length > 0}
              />
            )}
          </div>
          <div className="flex items-center justify-between px-3 py-1 bg-surface-tertiary dark:bg-[#1A1A1A] border-t border-edge dark:border-[#2A2A2A] text-[10px] text-ink-tertiary dark:text-[#666] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live" />
              Preview running
            </div>
            {width && <span>{width.replace('px', '')} x auto</span>}
          </div>
        </div>
        {drawer === 'theme' && (
          <div className="flex-shrink-0 border-l border-edge dark:border-[#2A2A2A]">
            <ThemeEditor onClose={() => setDrawer(null)} />
          </div>
        )}
        {drawer === 'library' && (
          <div className="flex-shrink-0 border-l border-edge dark:border-[#2A2A2A]">
            <LibraryPanel
              projectName={projectName ?? 'Your app'}
              previewUrl={wcState.url}
              onClose={() => setDrawer(null)}
              onAddAiChat={onAddAiChat}
            />
          </div>
        )}
      </div>
    );

    if (fullScreen) {
      return (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-[min(1400px,95vw)] h-[min(900px,92vh)] rounded-xl overflow-hidden shadow-2xl">
            {panel}
          </div>
        </div>
      );
    }
    return panel;
  }

  if (useWC && !['idle', 'error'].includes(wcState.status)) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-[#0A0A0A] gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
          <span className="text-sm text-ink-secondary dark:text-[#A0A0A0]">
            {wcState.status === 'booting' ? 'Booting environment...' :
             wcState.status === 'mounting' ? 'Mounting files...' :
             wcState.status === 'installing' ? 'Installing dependencies...' :
             'Starting dev server...'}
          </span>
        </div>
        <div className="w-24 h-0.5 bg-edge dark:bg-[#222] rounded-full overflow-hidden">
          <div className="h-full w-8 bg-ink-tertiary dark:bg-[#666] rounded-full animate-progress-sweep" />
        </div>
      </div>
    );
  }

  if (useWC && wcState.status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-[#0A0A0A] gap-3">
        <span className="text-sm text-ink-secondary dark:text-[#A0A0A0]">Preview error</span>
        <span className="text-xs text-ink-tertiary dark:text-[#666] max-w-xs text-center">{wcState.error}</span>
        <button onClick={refresh} className="text-xs text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-white border border-edge dark:border-[#333] px-3 py-1 rounded transition-colors">Retry</button>
      </div>
    );
  }

  if (fallbackHtml) {
    return (
      <div className="h-full flex flex-col">
        <iframe srcDoc={fallbackHtml} sandbox="allow-scripts" className="flex-1 w-full border-0 bg-white" title="Preview" />
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-[#0A0A0A] gap-4">
        <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
        <span className="text-sm text-ink-secondary dark:text-[#A0A0A0]">Building...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-white dark:bg-[#0A0A0A] text-ink-tertiary dark:text-[#444] text-sm">
      No preview available
    </div>
  );
}
