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

export async function createDesktopSandbox(config: E2BClientConfig): Promise<DesktopSandbox> {
  const options: { apiKey: string; template?: string } = { apiKey: config.apiKey };
  if (config.desktopTemplateId) {
    options.template = config.desktopTemplateId;
  }
  return DesktopSandbox.create(options as never);
}

export async function connectDesktopSandbox(
  config: E2BClientConfig,
  sandboxId: string
): Promise<DesktopSandbox> {
  return DesktopSandbox.connect(sandboxId, { apiKey: config.apiKey } as never);
}

export type { ComputeSandbox, DesktopSandbox };
