import { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';
import { Sandbox as DesktopSandbox } from '@e2b/desktop';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export interface E2BClientConfig {
  apiKey: string;
  computeTemplateId?: string;
  desktopTemplateId?: string;
}

export function loadE2BConfig(): E2BClientConfig {
  return {
    apiKey: requireEnv('E2B_API_KEY'),
    computeTemplateId: optionalEnv('E2B_COMPUTE_TEMPLATE_ID'),
    desktopTemplateId: optionalEnv('E2B_DESKTOP_TEMPLATE_ID'),
  };
}

export async function createComputeSandbox(config: E2BClientConfig): Promise<ComputeSandbox> {
  const options: { apiKey: string; template?: string } = { apiKey: config.apiKey };
  if (config.computeTemplateId) {
    options.template = config.computeTemplateId;
  }
  return ComputeSandbox.create(options as never);
}

export async function connectComputeSandbox(
  config: E2BClientConfig,
  sandboxId: string
): Promise<ComputeSandbox> {
  return ComputeSandbox.connect(sandboxId, { apiKey: config.apiKey } as never);
}

export async function createDesktopSandbox(
  config: E2BClientConfig,
  opts?: { timeoutMs?: number }
): Promise<DesktopSandbox> {
  const options: { apiKey: string; template?: string; timeoutMs?: number } = {
    apiKey: config.apiKey,
  };
  if (config.desktopTemplateId) {
    options.template = config.desktopTemplateId;
  }
  if (opts?.timeoutMs && opts.timeoutMs > 0) {
    options.timeoutMs = opts.timeoutMs;
  }
  return DesktopSandbox.create(options as never);
}

/** Refresh TTL on an existing sandbox without reconnecting. */
export async function setDesktopTimeout(
  config: E2BClientConfig,
  sandboxId: string,
  timeoutMs: number
): Promise<void> {
  await DesktopSandbox.setTimeout(sandboxId, timeoutMs, { apiKey: config.apiKey } as never);
}

/** Kill an existing sandbox without reconnecting (via the static API). */
export async function killDesktopSandbox(
  config: E2BClientConfig,
  sandboxId: string
): Promise<void> {
  const sandbox = await DesktopSandbox.connect(sandboxId, { apiKey: config.apiKey } as never);
  await sandbox.kill();
}

export async function connectDesktopSandbox(
  config: E2BClientConfig,
  sandboxId: string
): Promise<DesktopSandbox> {
  return DesktopSandbox.connect(sandboxId, { apiKey: config.apiKey } as never);
}

export type { ComputeSandbox, DesktopSandbox };
