import { useEffect } from 'react';
import CodeEditor from './CodeEditor';
import FileTree from './FileTree';
import TerminalPanel from './TerminalPanel';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'html', css: 'css', js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescriptreact', json: 'json', md: 'markdown',
    py: 'python', java: 'java', cpp: 'cpp', go: 'go', rs: 'rust',
  };
  return map[ext] || 'plaintext';
}

function Breadcrumb({ path }: { path: string }) {
  if (!path) return null;
  const parts = path.split('/');
  const fileName = parts.pop() || '';
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-[#1E1E1E] border-b border-edge dark:border-[#2A2A2A] text-xs text-ink-tertiary dark:text-[#666] flex-shrink-0">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-ink-secondary dark:text-[#888]">{part}</span>
          <span className="text-ink-tertiary dark:text-[#444]">&gt;</span>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-secondary dark:text-[#888]">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-ink dark:text-[#CCC]">{fileName}</span>
      </span>
    </div>
  );
}

interface WorkspacePanelProps {
  workspace: UseWorkspaceReturn;
  recentFiles?: Set<string>;
  terminalLogs: string;
}

export default function WorkspacePanel({ workspace, recentFiles, terminalLogs }: WorkspacePanelProps) {
  const { files, activeFile, setActiveFile, setFile, deleteFile } = workspace;
  const terminalHeight = 200;

  const selectFile = setActiveFile;

  useEffect(() => {
    if (!activeFile && files.size > 0) {
      const firstFile = Array.from(files.keys()).find(k => k.endsWith('.tsx') || k.endsWith('.ts') || k.endsWith('.html'));
      if (firstFile) setActiveFile(firstFile);
    }
  }, [files, activeFile, setActiveFile]);

  const activeContent = activeFile ? files.get(activeFile) || '' : '';
  const activeLang = activeFile ? detectLanguage(activeFile) : 'plaintext';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1E1E1E]">
      <div className="flex overflow-hidden" style={{ flex: '1 1 0%' }}>
        <div className="w-[180px] flex-shrink-0 border-r border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#18181B] overflow-y-auto subtle-scrollbar">
          <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#888] font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Files
          </div>
          <FileTree
            files={files}
            activeFile={activeFile}
            onSelect={selectFile}
            onDelete={deleteFile}
            recentFiles={recentFiles}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <Breadcrumb path={activeFile || ''} />
          {activeFile ? (
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={activeContent}
                language={activeLang}
                onChange={(val) => setFile(activeFile, val)}
                height="100%"
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#1E1E1E] text-ink-tertiary dark:text-[#444] text-sm">
              {files.size === 0 ? 'Waiting for files...' : 'Select a file to edit'}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: `${terminalHeight}px` }} className="flex-shrink-0">
        <TerminalPanel logs={terminalLogs} />
      </div>
    </div>
  );
}
