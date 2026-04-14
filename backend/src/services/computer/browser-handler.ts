import { Sandbox as DesktopSandbox } from '@e2b/desktop';
import {
  connectDesktopSandbox,
  createDesktopSandbox,
  loadE2BConfig,
  type E2BClientConfig,
} from './e2b-client';
import { clearSession, getSession, upsertSession } from './e2b-session-store';
import { toolErr, toolOk, type ToolResult } from './types';
import type { ComputerSSEWriter } from './sse-writer';

const MAX_TEXT_OUTPUT = 8_000;
const SCRIPT_TIMEOUT_MS = 30_000;
const SANDBOX_TIMEOUT_MS = 10 * 60_000;
const CHROMIUM_BOOT_WAIT_MS = 3_000;

export type BrowserAction =
  | 'navigate'
  | 'search'
  | 'click'
  | 'type'
  | 'scroll'
  | 'extract'
  | 'screenshot'
  | 'close';

export interface BrowserHandlerInput {
  action: BrowserAction;
  url?: string;
  query?: string;
  selector?: string;
  text?: string;
  direction?: 'up' | 'down';
  amount?: number;
}

export interface BrowserHandlerContext {
  userId: string;
  sse: ComputerSSEWriter;
  config?: E2BClientConfig;
}

interface PlaywrightResult {
  title?: string;
  url?: string;
  text?: string;
  results?: Array<{ title: string; url: string; snippet: string }>;
  screenshot?: string;
  error?: string;
}

function pyStr(value: string): string {
  return JSON.stringify(value);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[truncated — ${text.length} chars total]`;
}

const PW_PREAMBLE = `import json, base64, io
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
`;

function buildNavigateScript(url: string): string {
  return `${PW_PREAMBLE}    page.goto(${pyStr(url)}, wait_until="domcontentloaded", timeout=15000)
    result = {"title": page.title(), "url": page.url, "text": (page.text_content("body") or "")[:${MAX_TEXT_OUTPUT}]}
    print(json.dumps(result))
`;
}

function buildSearchScript(query: string): string {
  return `${PW_PREAMBLE}    page.goto("https://www.google.com", wait_until="domcontentloaded", timeout=15000)
    search_box = page.query_selector('textarea[name="q"]') or page.query_selector('input[name="q"]')
    if search_box:
        search_box.fill(${pyStr(query)})
        search_box.press("Enter")
        page.wait_for_load_state("domcontentloaded", timeout=10000)
    results = []
    for el in page.query_selector_all("div.g")[:10]:
        title_el = el.query_selector("h3")
        link_el = el.query_selector("a")
        snippet_el = el.query_selector("div[data-sncf], div.VwiC3b, span.st")
        if title_el and link_el:
            results.append({
                "title": (title_el.text_content() or "").strip(),
                "url": link_el.get_attribute("href") or "",
                "snippet": ((snippet_el.text_content() or "") if snippet_el else "")[:200]
            })
    result = {"title": page.title(), "url": page.url, "results": results, "text": (page.text_content("body") or "")[:${MAX_TEXT_OUTPUT}]}
    print(json.dumps(result))
`;
}

function buildClickScript(selector: string): string {
  return `${PW_PREAMBLE}    page.click(${pyStr(selector)}, timeout=5000)
    page.wait_for_load_state("domcontentloaded", timeout=10000)
    result = {"title": page.title(), "url": page.url, "text": (page.text_content("body") or "")[:${MAX_TEXT_OUTPUT}]}
    print(json.dumps(result))
`;
}

function buildTypeScript(selector: string, text: string): string {
  return `${PW_PREAMBLE}    page.fill(${pyStr(selector)}, ${pyStr(text)})
    result = {"title": page.title(), "url": page.url}
    print(json.dumps(result))
`;
}

function buildScrollScript(direction: 'up' | 'down', amount: number): string {
  const pixels = direction === 'down' ? amount * 600 : -(amount * 600);
  return `${PW_PREAMBLE}    page.evaluate("window.scrollBy(0, ${pixels})")
    import time
    time.sleep(0.5)
    result = {"title": page.title(), "url": page.url}
    print(json.dumps(result))
`;
}

function buildExtractScript(selector: string): string {
  return `${PW_PREAMBLE}    el = page.query_selector(${pyStr(selector)})
    text = (el.text_content() if el else page.text_content("body")) or ""
    result = {"title": page.title(), "url": page.url, "text": text[:${MAX_TEXT_OUTPUT}]}
    print(json.dumps(result))
`;
}

function buildScreenshotScript(): string {
  return `${PW_PREAMBLE}    buf = page.screenshot(type="png", full_page=False)
    result = {"title": page.title(), "url": page.url, "screenshot": base64.b64encode(buf).decode("ascii")}
    print(json.dumps(result))
`;
}

async function bootChromium(sbx: DesktopSandbox): Promise<void> {
  await sbx.commands.run(
    'google-chrome --remote-debugging-port=9222 --no-first-run --no-default-browser-check --disable-sync --disable-translate --disable-gpu --disable-dev-shm-usage &',
    { background: true } as never
  );
  await new Promise((r) => setTimeout(r, CHROMIUM_BOOT_WAIT_MS));
}

async function acquireDesktop(
  config: E2BClientConfig,
  userId: string
): Promise<{ desktop: DesktopSandbox; freshBoot: boolean }> {
  const session = getSession(userId);
  if (session?.desktopSandboxId) {
    try {
      const existing = await connectDesktopSandbox(config, session.desktopSandboxId);
      return { desktop: existing, freshBoot: false };
    } catch {
      // stale
    }
  }
  const fresh = await createDesktopSandbox(config);
  upsertSession(userId, { desktopSandboxId: fresh.sandboxId, status: 'running' });
  await bootChromium(fresh);
  return { desktop: fresh, freshBoot: true };
}

export async function handleBrowserExec(
  input: BrowserHandlerInput,
  ctx: BrowserHandlerContext
): Promise<ToolResult> {
  if (!input.action) {
    return toolErr(
      'Required: input.action (navigate|search|click|type|scroll|extract|screenshot|close).',
      'missing_param'
    );
  }

  const config = ctx.config ?? loadE2BConfig();
  const executionId = `br-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { desktop } = await acquireDesktop(config, ctx.userId);

    const streamApi = desktop.stream as {
      start?: () => Promise<void>;
      getUrl: (opts?: { viewOnly?: boolean }) => string;
    };
    await streamApi.start?.();
    const streamUrl = streamApi.getUrl({ viewOnly: true });

    ctx.sse.send('browser-start', { executionId, streamUrl });

    if (input.action === 'close') {
      ctx.sse.send('browser-action', {
        executionId,
        action: 'close',
        target: 'browser',
        timestamp: Date.now(),
      });
      try {
        await desktop.kill();
      } catch {
        // best effort
      }
      clearSession(ctx.userId);
      ctx.sse.send('browser-end', { executionId });
      return toolOk('Browser session closed.');
    }

    let script: string;
    switch (input.action) {
      case 'navigate':
        if (!input.url) return toolErr('navigate requires input.url', 'missing_param');
        script = buildNavigateScript(input.url);
        break;
      case 'search':
        if (!input.query) return toolErr('search requires input.query', 'missing_param');
        script = buildSearchScript(input.query);
        break;
      case 'click':
        if (!input.selector) return toolErr('click requires input.selector', 'missing_param');
        script = buildClickScript(input.selector);
        break;
      case 'type':
        if (!input.selector || input.text == null) {
          return toolErr('type requires input.selector and input.text', 'missing_param');
        }
        script = buildTypeScript(input.selector, input.text);
        break;
      case 'scroll':
        script = buildScrollScript(input.direction ?? 'down', input.amount ?? 3);
        break;
      case 'extract':
        script = buildExtractScript(input.selector ?? 'body');
        break;
      case 'screenshot':
        script = buildScreenshotScript();
        break;
      default:
        return toolErr(`Unknown browser action: ${String(input.action)}`, 'invalid_action');
    }

    await desktop.files.write('/tmp/pw_action.py', script);
    const exec = await desktop.commands.run('python3 /tmp/pw_action.py', {
      timeoutMs: SCRIPT_TIMEOUT_MS,
    });

    const stdout = (exec.stdout ?? '').trim();
    const stderr = exec.stderr ?? '';

    let parsed: PlaywrightResult = {};
    try {
      parsed = JSON.parse(stdout) as PlaywrightResult;
    } catch {
      parsed = {
        error: `Script output was not valid JSON. stdout: ${stdout.slice(0, 300)}`,
        text: stderr ? `stderr: ${stderr.slice(0, 500)}` : undefined,
      };
    }

    const target = input.url ?? input.query ?? input.selector ?? input.text ?? '';

    ctx.sse.send('browser-action', {
      executionId,
      action: input.action,
      target,
      url: parsed.url,
      title: parsed.title,
      timestamp: Date.now(),
    });

    if (parsed.url || parsed.title) {
      upsertSession(ctx.userId, {
        metadata: {
          currentUrl: parsed.url,
          currentTitle: parsed.title,
          logs: [],
        },
        status: 'running',
      });
    }

    ctx.sse.send('browser-end', { executionId });

    const summaryParts: string[] = [`browser:${input.action}`];
    if (parsed.title) summaryParts.push(`title="${parsed.title}"`);
    if (parsed.url) summaryParts.push(`url=${parsed.url}`);
    if (parsed.text) summaryParts.push(`text_len=${parsed.text.length}`);
    if (parsed.results) summaryParts.push(`${parsed.results.length} search results`);
    if (parsed.error) summaryParts.push(`error=${parsed.error}`);

    if (parsed.error) {
      return toolErr(summaryParts.join(' | '), 'browser_error');
    }

    return toolOk(summaryParts.join(' | '), {
      url: parsed.url,
      title: parsed.title,
      text: parsed.text ? truncate(parsed.text, MAX_TEXT_OUTPUT) : undefined,
      results: parsed.results,
      screenshot: parsed.screenshot,
      streamUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.sse.send('browser-end', { executionId });
    return toolErr(`Browser automation error: ${message}`, 'browser_error');
  }
}

export const BROWSER_HANDLER_CONSTANTS = {
  MAX_TEXT_OUTPUT,
  SCRIPT_TIMEOUT_MS,
  SANDBOX_TIMEOUT_MS,
  CHROMIUM_BOOT_WAIT_MS,
};
