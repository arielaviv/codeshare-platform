import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'codeshare_workspace_';

function loadFiles(conversationId: string | null): Map<string, string> {
  if (!conversationId) return new Map();
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + conversationId);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

function saveFiles(conversationId: string | null, files: Map<string, string>) {
  if (!conversationId) return;
  if (files.size === 0) {
    localStorage.removeItem(STORAGE_PREFIX + conversationId);
    return;
  }
  localStorage.setItem(
    STORAGE_PREFIX + conversationId,
    JSON.stringify(Object.fromEntries(files)),
  );
}

export function cleanupWorkspace(conversationId: string) {
  localStorage.removeItem(STORAGE_PREFIX + conversationId);
}

function buildPreview(files: Map<string, string>): string | null {
  const html = files.get('index.html');
  if (!html) return null;

  const css = files.get('style.css') || files.get('styles.css') || '';
  const js = files.get('script.js') || files.get('main.js') || files.get('app.js') || '';

  let result = html;
  if (css && !result.includes('<link') && result.includes('</head>')) {
    result = result.replace('</head>', `<style>${css}</style>\n</head>`);
  }
  if (js && result.includes('</body>')) {
    result = result.replace('</body>', `<script>${js}</script>\n</body>`);
  }
  return result;
}

export interface UseWorkspaceReturn {
  files: Map<string, string>;
  activeFile: string | null;
  setActiveFile: (path: string | null) => void;
  setFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  clearAll: () => void;
  previewHtml: string | null;
  toRecord: () => Record<string, string>;
}

export function useWorkspace(conversationId: string | null): UseWorkspaceReturn {
  const [files, setFiles] = useState<Map<string, string>>(() => loadFiles(conversationId));
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const prevIdRef = useRef(conversationId);

  useEffect(() => {
    if (conversationId !== prevIdRef.current) {
      prevIdRef.current = conversationId;
      const loaded = loadFiles(conversationId);
      setFiles(loaded);
      setActiveFile(loaded.size > 0 ? Array.from(loaded.keys())[0] : null);
    }
  }, [conversationId]);

  useEffect(() => {
    saveFiles(conversationId, files);
  }, [conversationId, files]);

  const setFile = useCallback((path: string, content: string) => {
    setFiles((prev) => {
      const next = new Map(prev);
      next.set(path, content);
      return next;
    });
    setActiveFile((current) => current ?? path);
  }, []);

  const deleteFile = useCallback((path: string) => {
    setFiles((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    setActiveFile((current) => {
      if (current !== path) return current;
      return null;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFiles(new Map());
    setActiveFile(null);
  }, []);

  const previewHtml = useMemo(() => buildPreview(files), [files]);

  const toRecord = useCallback(
    () => Object.fromEntries(files),
    [files],
  );

  return { files, activeFile, setActiveFile, setFile, deleteFile, clearAll, previewHtml, toRecord };
}
