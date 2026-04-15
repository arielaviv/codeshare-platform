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
const CHROMIUM_BOOT_MAX_MS = 15_000;
const CHROMIUM_POLL_MS = 250;
const MAX_BROWSER_ACTIONS_PER_RUN = 25;

class ChromiumBootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChromiumBootError';
  }
}

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
  error_kind?:
    | 'cdp_disconnected'
    | 'script_timeout'
    | 'script_error'
    | 'selector_not_found';
  error_detail?: string;
  traceback?: string;
}

// Per-user action counter — resets when sandbox is killed/recreated.
const actionsThisRun = new Map<string, number>();
function bumpActionCount(userId: string): number {
  const n = (actionsThisRun.get(userId) ?? 0) + 1;
  actionsThisRun.set(userId, n);
  return n;
}
function resetActionCount(userId: string): void {
  actionsThisRun.delete(userId);
}

function pyStr(value: string): string {
  return JSON.stringify(value);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[truncated — ${text.length} chars total]`;
}

// Every script body runs inside this try block. On any exception we emit
// a JSON line with `error_kind` so the client can render a typed error.
const PW_PREAMBLE = `import json, base64, io, traceback, sys
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
try:
    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp("http://localhost:9222")
        except Exception as e:
            print(json.dumps({"error_kind": "cdp_disconnected", "error_detail": str(e)}))
            sys.exit(0)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
`;

// Closes the try block + emits a screenshot after every action. The script
// body must define `result` (a dict) before the closing line.
const PW_EPILOGUE = `        # Screenshot every action so the timeline always has a thumbnail.
        try:
            buf = page.screenshot(type="png", full_page=False)
            result["screenshot"] = base64.b64encode(buf).decode("ascii")
        except Exception:
            pass
        print(json.dumps(result))
except PWTimeout as e:
    print(json.dumps({"error_kind": "script_timeout", "error_detail": str(e)}))
except Exception as e:
    print(json.dumps({
        "error_kind": "script_error",
        "error_detail": str(e),
        "traceback": traceback.format_exc()[:1000],
    }))
`;

function buildNavigateScript(url: string): string {
  return `${PW_PREAMBLE}        page.goto(${pyStr(url)}, wait_until="domcontentloaded", timeout=15000)
        result = {"title": page.title(), "url": page.url, "text": (page.text_content("body") or "")[:${MAX_TEXT_OUTPUT}]}
${PW_EPILOGUE}`;
}

function buildSearchScript(query: string): string {
  return `${PW_PREAMBLE}        page.goto("https://www.google.com", wait_until="domcontentloaded", timeout=15000)
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
${PW_EPILOGUE}`;
}

function buildClickScript(selector: string): string {
  return `${PW_PREAMBLE}        try:
            page.click(${pyStr(selector)}, timeout=5000)
        except PWTimeout:
            print(json.dumps({"error_kind": "selector_not_found", "error_detail": ${pyStr(selector)}}))
            sys.exit(0)
        page.wait_for_load_state("domcontentloaded", timeout=10000)
        result = {"title": page.title(), "url": page.url, "text": (page.text_content("body") or "")[:${MAX_TEXT_OUTPUT}]}
${PW_EPILOGUE}`;
}

function buildTypeScript(selector: string, text: string): string {
  return `${PW_PREAMBLE}        try:
            page.fill(${pyStr(selector)}, ${pyStr(text)})
        except PWTimeout:
            print(json.dumps({"error_kind": "selector_not_found", "error_detail": ${pyStr(selector)}}))
            sys.exit(0)
        result = {"title": page.title(), "url": page.url}
${PW_EPILOGUE}`;
}

function buildScrollScript(direction: 'up' | 'down', amount: number): string {
  const pixels = direction === 'down' ? amount * 600 : -(amount * 600);
  return `${PW_PREAMBLE}        page.evaluate("window.scrollBy(0, ${pixels})")
        import time
        time.sleep(0.5)
        result = {"title": page.title(), "url": page.url}
${PW_EPILOGUE}`;
}

function buildExtractScript(selector: string): string {
  return `${PW_PREAMBLE}        el = page.query_selector(${pyStr(selector)})
        text = (el.text_content() if el else page.text_content("body")) or ""
        result = {"title": page.title(), "url": page.url, "text": text[:${MAX_TEXT_OUTPUT}]}
${PW_EPILOGUE}`;
}

function buildScreenshotScript(): string {
  return `${PW_PREAMBLE}        result = {"title": page.title(), "url": page.url}
${PW_EPILOGUE}`;
}

async function bootChromium(sbx: DesktopSandbox): Promise<void> {
  // Launch Chrome in the background, capture logs to /tmp/chrome.log so we
  // can surface a meaningful error if boot fails.
  await sbx.commands.run(
    'google-chrome --remote-debugging-port=9222 --no-first-run --no-default-browser-check --disable-sync --disable-translate --disable-gpu --disable-dev-shm-usage > /tmp/chrome.log 2>&1 &',
    { background: true } as never
  );

  // Readiness probe: poll /json/version until it returns 200 or we time out.
  const deadline = Date.now() + CHROMIUM_BOOT_MAX_MS;
  while (Date.now() < deadline) {
    const probe = await sbx.commands
      .run('curl -sf -m 2 http://localhost:9222/json/version', { timeoutMs: 3_000 })
      .catch(() => null);
    if (probe?.exitCode === 0 && (probe.stdout ?? '').includes('webSocketDebuggerUrl')) {
      return;
    }
    await new Promise((r) => setTimeout(r, CHROMIUM_POLL_MS));
  }

  // Boot failed — capture log tail for diagnostics.
  const logResult = await sbx.commands
    .run('tail -n 80 /tmp/chrome.log', { timeoutMs: 2_000 })
    .catch(() => null);
  const logTail = logResult?.stdout ?? 'no log captured';
  throw new ChromiumBootError(
    `Chromium failed to bind :9222 within ${CHROMIUM_BOOT_MAX_MS}ms. Log tail:\n${logTail.slice(0, 1_500)}`
  );
}

async function bootChromiumWithRetry(sbx: DesktopSandbox): Promise<void> {
  try {
    await bootChromium(sbx);
  } catch (err) {
    if (!(err instanceof ChromiumBootError)) throw err;
    // Single retry: kill any stale chrome, then try once more.
    await sbx.commands.run('pkill -9 chrome || true', { timeoutMs: 3_000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 500));
    await bootChromium(sbx);
  }
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
  await bootChromiumWithRetry(fresh);
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

  // Per-run rate cap to prevent the agent from looping forever.
  if (input.action !== 'close') {
    const count = bumpActionCount(ctx.userId);
    if (count > MAX_BROWSER_ACTIONS_PER_RUN) {
      return toolErr(
        `Browser action cap reached (${MAX_BROWSER_ACTIONS_PER_RUN} per run). Stop and propose next steps to the user instead.`,
        'rate_limit'
      );
    }
  }

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
      resetActionCount(ctx.userId);
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

    // Map typed Playwright errors to typed tool errors so the client can
    // render a useful message (and the agent can react accordingly).
    if (parsed.error_kind) {
      const kindMsg: Record<NonNullable<PlaywrightResult['error_kind']>, string> = {
        cdp_disconnected: 'Browser disconnected. Restart browser to continue.',
        script_timeout: 'Browser action timed out.',
        script_error: 'Browser action failed.',
        selector_not_found: 'Selector did not match any element.',
      };
      const msg = `${kindMsg[parsed.error_kind]} ${parsed.error_detail ?? ''}`.trim();
      ctx.sse.send('browser-end', { executionId });
      return toolErr(msg, parsed.error_kind);
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
    if (err instanceof ChromiumBootError) {
      ctx.sse.send('browser-end', { executionId });
      return toolErr(`Browser unavailable: ${err.message}`, 'browser_unavailable');
    }
    const message = err instanceof Error ? err.message : String(err);
    ctx.sse.send('browser-end', { executionId });
    return toolErr(`Browser automation error: ${message}`, 'browser_error');
  }
}

export const BROWSER_HANDLER_CONSTANTS = {
  MAX_TEXT_OUTPUT,
  SCRIPT_TIMEOUT_MS,
  SANDBOX_TIMEOUT_MS,
  CHROMIUM_BOOT_MAX_MS,
  CHROMIUM_POLL_MS,
  MAX_BROWSER_ACTIONS_PER_RUN,
};
