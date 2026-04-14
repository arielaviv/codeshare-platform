import {
  handleBrowserExec,
  type BrowserHandlerContext,
  type BrowserHandlerInput,
} from './browser-handler';
import {
  handlePythonExec,
  type PythonHandlerContext,
  type PythonHandlerInput,
} from './python-handler';
import type { E2BClientConfig } from './e2b-client';
import type { ComputerSSEWriter } from './sse-writer';
import { toolErr, type ToolResult } from './types';

export interface DispatchContext {
  userId: string;
  workspace: Record<string, string>;
  sse: ComputerSSEWriter;
  config?: E2BClientConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPythonInput(input: unknown): PythonHandlerInput | null {
  if (!isRecord(input)) return null;
  if (typeof input.code !== 'string') return null;
  const files = Array.isArray(input.files) ? input.files.filter((f): f is string => typeof f === 'string') : undefined;
  return {
    code: input.code,
    description: typeof input.description === 'string' ? input.description : undefined,
    files,
  };
}

function asBrowserInput(input: unknown): BrowserHandlerInput | null {
  if (!isRecord(input)) return null;
  const action = input.action;
  if (
    action !== 'navigate' &&
    action !== 'search' &&
    action !== 'click' &&
    action !== 'type' &&
    action !== 'scroll' &&
    action !== 'extract' &&
    action !== 'screenshot' &&
    action !== 'close'
  ) {
    return null;
  }
  const direction = input.direction;
  return {
    action,
    url: typeof input.url === 'string' ? input.url : undefined,
    query: typeof input.query === 'string' ? input.query : undefined,
    selector: typeof input.selector === 'string' ? input.selector : undefined,
    text: typeof input.text === 'string' ? input.text : undefined,
    direction: direction === 'up' || direction === 'down' ? direction : undefined,
    amount: typeof input.amount === 'number' ? input.amount : undefined,
  };
}

export async function dispatchComputerTool(
  name: string,
  input: unknown,
  ctx: DispatchContext
): Promise<ToolResult> {
  switch (name) {
    case 'python': {
      const parsed = asPythonInput(input);
      if (!parsed) return toolErr('python tool requires {code: string}', 'invalid_input');
      const handlerCtx: PythonHandlerContext = {
        userId: ctx.userId,
        workspace: ctx.workspace,
        sse: ctx.sse,
        config: ctx.config,
      };
      return handlePythonExec(parsed, handlerCtx);
    }
    case 'browser': {
      const parsed = asBrowserInput(input);
      if (!parsed) return toolErr('browser tool requires a valid {action}', 'invalid_input');
      const handlerCtx: BrowserHandlerContext = {
        userId: ctx.userId,
        sse: ctx.sse,
        config: ctx.config,
      };
      return handleBrowserExec(parsed, handlerCtx);
    }
    default:
      return toolErr(`Unknown computer tool: ${name}`, 'unknown_tool');
  }
}
