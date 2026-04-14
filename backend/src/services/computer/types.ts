export type ComputerSessionStatus = 'running' | 'paused' | 'expired' | 'failed';

export interface ComputerSessionMetadata {
  currentUrl?: string;
  currentTitle?: string;
  logs: string[];
}

export interface ComputerSessionRecord {
  userId: string;
  computeSandboxId?: string;
  desktopSandboxId?: string;
  status: ComputerSessionStatus;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  metadata: ComputerSessionMetadata;
}

export interface BrowserActionEvent {
  executionId: string;
  action: 'navigate' | 'search' | 'click' | 'type' | 'scroll' | 'extract' | 'screenshot' | 'close';
  target: string;
  url?: string;
  title?: string;
  timestamp: number;
}

export interface BrowserStartEvent {
  executionId: string;
  streamUrl: string;
}

export interface BrowserEndEvent {
  executionId: string;
}

export interface CodeExecutionStartEvent {
  executionId: string;
  code: string;
  language: 'python';
  description?: string;
}

export interface CodeExecutionResultImage {
  png?: string;
  svg?: string;
  html?: string;
  text?: string;
}

export interface CodeExecutionOutputFile {
  path: string;
  format: string;
  sizeBytes: number;
}

export interface CodeExecutionResultEvent {
  executionId: string;
  status: 'success' | 'error';
  stdout: string[];
  stderr: string[];
  error?: { name: string; value: string; traceback: string };
  results: CodeExecutionResultImage[];
  outputFiles: CodeExecutionOutputFile[];
  durationMs: number;
}

export interface ToolCallEvent {
  toolUseId: string;
  name: string;
  input: unknown;
}

export interface ToolResultEvent {
  toolUseId: string;
  name: string;
  ok: boolean;
  summary: string;
}

export interface TextDeltaEvent {
  text: string;
}

export interface ErrorEvent {
  message: string;
  code?: string;
}

export interface DoneEvent {
  iterations: number;
  durationMs: number;
}

export type ComputerSSEEventMap = {
  text_delta: TextDeltaEvent;
  tool_call: ToolCallEvent;
  tool_result: ToolResultEvent;
  'code-execution-start': CodeExecutionStartEvent;
  'code-execution-result': CodeExecutionResultEvent;
  'browser-start': BrowserStartEvent;
  'browser-action': BrowserActionEvent;
  'browser-end': BrowserEndEvent;
  error: ErrorEvent;
  done: DoneEvent;
};

export type ComputerSSEEventName = keyof ComputerSSEEventMap;

export interface ToolOk {
  ok: true;
  summary: string;
  payload?: unknown;
}

export interface ToolErr {
  ok: false;
  summary: string;
  code?: string;
}

export type ToolResult = ToolOk | ToolErr;

export function toolOk(summary: string, payload?: unknown): ToolOk {
  return { ok: true, summary, payload };
}

export function toolErr(summary: string, code?: string): ToolErr {
  return { ok: false, summary, code };
}
