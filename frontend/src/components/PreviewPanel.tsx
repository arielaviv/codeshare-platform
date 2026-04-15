import { useState, useEffect, useCallback, useRef } from 'react';
import { wcManager, type WCState } from '../lib/webcontainer-manager';

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
}

export default function PreviewPanel({ files, isGenerating, fallbackHtml }: PreviewPanelProps) {
  const [wcState, setWCState] = useState<WCState>(wcManager.getState());
  const [useWC, setUseWC] = useState(false);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const hasBootedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
    return (
      <div className="h-full flex flex-col bg-surface-secondary dark:bg-[#1A1A1A]">
        <div className="flex items-center justify-center gap-1 px-3 py-1.5 border-b border-edge dark:border-[#2A2A2A] flex-shrink-0">
          {(['desktop', 'tablet', 'phone'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`p-1.5 rounded transition-colors ${device === d ? 'text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#333]' : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'}`}
              title={d.charAt(0).toUpperCase() + d.slice(1)}
            >
              {d === 'desktop' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              ) : d === 'tablet' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={refresh} className="p-1.5 text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
        <div className="flex-1 flex items-start justify-center overflow-auto bg-surface-tertiary dark:bg-[#111] p-2">
          <iframe
            src={wcState.url}
            className="bg-white border-0 h-full transition-all duration-300"
            style={{ width: width || '100%', maxWidth: '100%' }}
            title="Preview"
          />
        </div>
        <div className="flex items-center justify-between px-3 py-1 bg-surface-tertiary dark:bg-[#1A1A1A] border-t border-edge dark:border-[#2A2A2A] text-[10px] text-ink-tertiary dark:text-[#666] flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-live" />
            Preview running
          </div>
          {width && <span>{width.replace('px', '')} x auto</span>}
        </div>
      </div>
    );
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
