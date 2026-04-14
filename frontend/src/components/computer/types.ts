export type ComputerPanelMode = 'hidden' | 'compact' | 'expanded' | 'takeover';
export type ComputerViewKind = 'python' | 'editor' | 'browser';

export interface ComputerPanelState {
  mode: ComputerPanelMode;
  viewMode: ComputerViewKind;
  activeIndex: number;
  isLive: boolean;
}

export interface BrowserActionEntry {
  action: string;
  target: string;
  timestamp: number;
  url?: string;
  title?: string;
}

export interface PythonResultImage {
  png?: string;
  svg?: string;
  html?: string;
  text?: string;
}

export interface PythonOutputFile {
  path: string;
  format: string;
  sizeBytes: number;
}

export interface TimelineEntry {
  id: string;
  kind: ComputerViewKind;
  timestamp: number;
  status: 'running' | 'success' | 'error';

  // Python
  code?: string;
  description?: string;
  stdout?: string[];
  stderr?: string[];
  results?: PythonResultImage[];
  outputFiles?: PythonOutputFile[];
  error?: { name: string; value: string; traceback: string };
  durationMs?: number;

  // Browser
  streamUrl?: string;
  browserUrl?: string;
  browserTitle?: string;
  browserActions?: BrowserActionEntry[];
  browserScreenshot?: string;

  // Editor (write_file events)
  writePath?: string;
  writeContent?: string;
}

export interface ComputeTask {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}
