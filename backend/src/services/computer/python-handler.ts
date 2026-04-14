import { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';
import {
  connectComputeSandbox,
  createComputeSandbox,
  loadE2BConfig,
  type E2BClientConfig,
} from './e2b-client';
import { getSession, upsertSession } from './e2b-session-store';
import {
  toolErr,
  toolOk,
  type CodeExecutionOutputFile,
  type CodeExecutionResultImage,
  type ToolResult,
} from './types';
import type { ComputerSSEWriter } from './sse-writer';

const MAX_TEXT_OUTPUT = 10_000;
const MAX_IMAGE_SIZE_CHARS = 2 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const EXEC_TIMEOUT_MS = 30_000;
const SANDBOX_TIMEOUT_MS = 5 * 60_000;

export interface PythonHandlerInput {
  code: string;
  description?: string;
  files?: string[];
}

export interface PythonHandlerContext {
  userId: string;
  workspace: Record<string, string>;
  sse: ComputerSSEWriter;
  config?: E2BClientConfig;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[truncated — ${text.length} chars total]`;
}

function formatForExtension(path: string): string {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.csv')) return 'csv';
  if (path.endsWith('.xlsx')) return 'xlsx';
  if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image';
  if (path.endsWith('.pdf')) return 'pdf';
  if (path.endsWith('.txt') || path.endsWith('.md')) return 'text';
  return 'binary';
}

async function acquireSandbox(
  config: E2BClientConfig,
  userId: string
): Promise<ComputeSandbox> {
  const session = getSession(userId);
  if (session?.computeSandboxId) {
    try {
      return await connectComputeSandbox(config, session.computeSandboxId);
    } catch {
      // stale — fall through to create fresh
    }
  }
  const fresh = await createComputeSandbox(config);
  upsertSession(userId, { computeSandboxId: fresh.sandboxId, status: 'running' });
  return fresh;
}

export async function handlePythonExec(
  input: PythonHandlerInput,
  ctx: PythonHandlerContext
): Promise<ToolResult> {
  if (!input.code || typeof input.code !== 'string' || input.code.trim().length === 0) {
    return toolErr('Required: input.code (non-empty Python source string).', 'missing_param');
  }

  const config = ctx.config ?? loadE2BConfig();
  const description = input.description ?? 'Python execution';
  const filesToMount = input.files ?? [];
  const executionId = `py-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  ctx.sse.send('code-execution-start', {
    executionId,
    code: input.code,
    language: 'python',
    description,
  });

  const startTime = Date.now();

  try {
    const sbx = await acquireSandbox(config, ctx.userId);

    await Promise.all(
      filesToMount.map(async (path) => {
        const content = ctx.workspace[path];
        if (!content) return;
        await sbx.files.write(`/home/user/input/${path}`, content);
      })
    );

    await sbx.commands.run('mkdir -p /home/user/output', { timeoutMs: 5_000 }).catch(() => {});

    const sanitized = input.code.replace(/\u2212/g, '-');
    const execution = await sbx.runCode(sanitized, { timeoutMs: EXEC_TIMEOUT_MS });

    const stdout = truncate((execution.logs?.stdout ?? []).join('\n'), MAX_TEXT_OUTPUT);
    const stderr = truncate((execution.logs?.stderr ?? []).join('\n'), MAX_TEXT_OUTPUT);

    const results: CodeExecutionResultImage[] = [];
    for (const r of execution.results ?? []) {
      if (r.png && r.png.length < MAX_IMAGE_SIZE_CHARS) results.push({ png: r.png });
      if (r.svg) results.push({ svg: r.svg });
      if (r.html) results.push({ html: r.html });
      if (r.text) results.push({ text: r.text });
    }

    const outputFiles: CodeExecutionOutputFile[] = [];
    try {
      const entries = await sbx.files.list('/home/user/output');
      for (const e of entries) {
        if (e.type !== 'file') continue;
        const content = await sbx.files.read(`/home/user/output/${e.name}`);
        const sizeBytes = typeof content === 'string' ? content.length : 0;
        if (sizeBytes > MAX_FILE_SIZE) continue;
        outputFiles.push({
          path: e.name,
          format: formatForExtension(e.name),
          sizeBytes,
        });
      }
    } catch {
      // no output dir — fine
    }

    const errorInfo = execution.error
      ? {
          name: execution.error.name ?? 'Error',
          value: execution.error.value ?? '',
          traceback: execution.error.traceback ?? '',
        }
      : undefined;

    await sbx.pause().catch(() => {});
    upsertSession(ctx.userId, { status: 'paused' });

    const durationMs = Date.now() - startTime;

    ctx.sse.send('code-execution-result', {
      executionId,
      status: errorInfo ? 'error' : 'success',
      stdout: stdout ? stdout.split('\n') : [],
      stderr: stderr ? stderr.split('\n') : [],
      error: errorInfo,
      results,
      outputFiles,
      durationMs,
    });

    const summary: string[] = [`${description} (${durationMs}ms)`];
    if (stdout) summary.push(`stdout: ${stdout.slice(0, 400)}`);
    if (errorInfo) summary.push(`error: ${errorInfo.name}: ${errorInfo.value}`);
    if (results.length > 0) summary.push(`${results.length} inline result(s)`);
    if (outputFiles.length > 0) {
      summary.push(`output files: ${outputFiles.map((f) => f.path).join(', ')}`);
    }

    if (errorInfo) {
      return toolErr(summary.join(' | '), 'python_error');
    }
    return toolOk(summary.join(' | '), {
      stdout,
      stderr,
      results,
      outputFiles,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    ctx.sse.send('code-execution-result', {
      executionId,
      status: 'error',
      stdout: [],
      stderr: [message],
      error: { name: 'SandboxError', value: message, traceback: '' },
      results: [],
      outputFiles: [],
      durationMs,
    });
    upsertSession(ctx.userId, { status: 'failed' });
    return toolErr(`E2B compute sandbox error: ${message}`, 'sandbox_error');
  }
}

export const PYTHON_HANDLER_CONSTANTS = {
  MAX_TEXT_OUTPUT,
  MAX_FILE_SIZE,
  EXEC_TIMEOUT_MS,
  SANDBOX_TIMEOUT_MS,
};
