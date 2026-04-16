/**
 * verify_build — post-build self-review tool.
 *
 * Takes the agent's just-built app (files in ctx.workspace), pushes
 * them into the per-user E2B desktop sandbox, runs npm install +
 * npm run dev, loads the resulting page with the already-booted
 * Chromium (via Playwright-over-CDP), screenshots it, and feeds the
 * screenshot to Claude Haiku vision for a match/issues verdict.
 *
 * If the review fails, the agent receives concrete issues to fix and
 * can call verify_build again (capped at 3 cycles in the system prompt).
 */
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentTool, ToolContext } from './types';
import { loadE2BConfig, connectDesktopSandbox, createDesktopSandbox } from '../computer/e2b-client';
import { getSession, upsertSession } from '../computer/e2b-session-store';
import { bootChromiumWithRetry } from '../computer/browser-handler';
import { VERIFY_EVENTS } from './verify-events.const';

interface VerifyBuildInput {
  userPrompt: string;
  port?: number;
  waitForMs?: number;
}

const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 240_000; // 4 min — first-ever npm install can crawl
const DEV_READY_TIMEOUT_MS = 60_000; // 60s — Vite first boot + HMR settle
const NODE_INSTALL_TIMEOUT_MS = 180_000;
const APP_ROOT = '/home/user/app';
const UPLOADS_BASE = path.join(__dirname, '../../../uploads/verify');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

async function pollDevReady(
  sandbox: { commands: { run: (cmd: string, opts?: { timeoutMs?: number }) => Promise<{ stdout: string; stderr: string; exitCode: number }> } },
  port: number,
  timeoutMs: number
): Promise<boolean> {
  // Single bash call that loops internally — saves ~60 E2B API
  // round-trips vs one command per probe.
  const attempts = Math.max(5, Math.ceil(timeoutMs / 1000));
  const cmd = `for i in $(seq 1 ${attempts}); do
    code=$(curl -sS -o /dev/null -w "%{http_code}" "http://localhost:${port}/" 2>/dev/null || echo "000")
    case "$code" in 2*|3*) echo READY; exit 0 ;; esac
    sleep 1
  done
  echo TIMEOUT
  exit 1`;
  try {
    const result = await sandbox.commands.run(cmd, { timeoutMs: timeoutMs + 5_000 });
    return /READY/.test(result.stdout);
  } catch {
    return false;
  }
}

async function reviewWithVision(
  pngBuffer: Buffer,
  userPrompt: string
): Promise<{ matches: boolean; issues: string[]; summary: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      matches: true,
      issues: [],
      summary: 'Vision review skipped — ANTHROPIC_API_KEY missing.',
    };
  }
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You review a just-built web app screenshot to judge whether it matches the user's request.

Reply with ONLY a JSON object, no prose:
{
  "matches": boolean,
  "issues": string[],  // specific, actionable fix items if matches is false; empty if true
  "summary": string    // 1-sentence verdict the assistant can speak to the user
}

Be strict but not petty. "matches: true" means the app is reasonable, on-topic, and not visibly broken. Issues must be concrete ("the hero image is missing", "the page shows a Vite error overlay", not "add more polish").`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: pngBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: `User originally asked: "${userPrompt}"\n\nDoes the screenshot satisfy that request?`,
          },
        ],
      },
    ],
  });
  const textBlock = response.content.find(
    (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text'
  );
  const raw = (textBlock?.text ?? '').trim();
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    return {
      matches: true,
      issues: [],
      summary: 'Vision model returned no JSON; assuming the build looks fine.',
    };
  }
  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      matches?: boolean;
      issues?: string[];
      summary?: string;
    };
    return {
      matches: parsed.matches !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 8) : [],
      summary:
        parsed.summary ??
        (parsed.matches ? 'Build verified.' : 'Build has issues to fix.'),
    };
  } catch {
    return {
      matches: true,
      issues: [],
      summary: 'Vision model JSON was malformed; assuming the build looks fine.',
    };
  }
}

async function acquireDesktopForVerify(
  userId: string
): Promise<{ sandbox: Awaited<ReturnType<typeof createDesktopSandbox>>; freshBoot: boolean }> {
  const config = loadE2BConfig();
  const session = getSession(userId);
  if (session?.desktopSandboxId) {
    try {
      const existing = await connectDesktopSandbox(config, session.desktopSandboxId);
      return { sandbox: existing, freshBoot: false };
    } catch {
      // stale — fall through
    }
  }
  const fresh = await createDesktopSandbox(config, { timeoutMs: SANDBOX_TIMEOUT_MS });
  upsertSession(userId, { desktopSandboxId: fresh.sandboxId, status: 'running' });
  return { sandbox: fresh, freshBoot: true };
}

export const verifyBuildTool: AgentTool = {
  definition: {
    name: 'verify_build',
    description:
      "Run the freshly-built app inside Mr8's Computer sandbox, load it in a browser, screenshot it, and review with a vision model. Call this exactly once at the end of every app build, right after the last write_file. Returns whether the build matches the user's request. If not, fix the issues and call verify_build again (max 3 cycles).",
    input_schema: {
      type: 'object' as const,
      properties: {
        userPrompt: {
          type: 'string',
          description:
            "The user's original request, verbatim. Used to ground the vision review.",
        },
        port: {
          type: 'number',
          description: 'Dev server port. Default 5173 (Vite).',
        },
      },
      required: ['userPrompt'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { userPrompt, port = 5173, waitForMs = DEV_READY_TIMEOUT_MS } = input as VerifyBuildInput;

    if (!userPrompt || userPrompt.trim().length === 0) {
      return 'verify_build failed: userPrompt is required.';
    }
    if (!ctx.userId) {
      return 'verify_build failed: userId missing from context.';
    }
    if (ctx.workspace.size === 0) {
      return 'verify_build failed: no files in workspace to verify.';
    }

    const toolCallId = ctx.toolCallId;
    const userKey = ctx.userId.toString();

    ctx.writer.send(VERIFY_EVENTS.STARTED, {
      toolCallId,
      fileCount: ctx.workspace.size,
      port,
    });

    // 1) Acquire desktop sandbox.
    let sandbox;
    try {
      const acquired = await acquireDesktopForVerify(userKey);
      sandbox = acquired.sandbox;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.writer.send(VERIFY_EVENTS.DONE, {
        toolCallId,
        matches: false,
        issues: [`Sandbox unavailable: ${msg}`],
        summary: 'Verification skipped — sandbox could not be acquired.',
      });
      return `verify_build failed: sandbox unavailable (${msg}). Skip verify and finish the build manually.`;
    }

    const sbx = sandbox as unknown as {
      files: { write: (path: string, data: string | Buffer) => Promise<unknown> };
      commands: {
        run: (
          cmd: string,
          opts?: { timeoutMs?: number; background?: boolean; user?: string }
        ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
      };
      screenshot: () => Promise<Uint8Array>;
    };

    // 2) Push files into the sandbox. Pre-create the full directory
    //    tree in ONE mkdir call (E2B round-trips are the bottleneck),
    //    then write files in parallel.
    try {
      const uniqueDirs = new Set<string>([APP_ROOT]);
      for (const relPath of ctx.workspace.keys()) {
        const abs = `${APP_ROOT}/${relPath}`;
        const lastSlash = abs.lastIndexOf('/');
        if (lastSlash > 0) uniqueDirs.add(abs.slice(0, lastSlash));
      }
      const mkdirArgs = [...uniqueDirs].map((d) => `"${d}"`).join(' ');
      await sbx.commands.run(`mkdir -p ${mkdirArgs}`, { timeoutMs: 10_000 });
      await Promise.all(
        [...ctx.workspace].map(([relPath, content]) =>
          sbx.files.write(`${APP_ROOT}/${relPath}`, content)
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.writer.send(VERIFY_EVENTS.DONE, {
        toolCallId,
        matches: false,
        issues: [`File push failed: ${msg}`],
        summary: 'Verification skipped — could not push files to sandbox.',
      });
      return `verify_build failed: file push (${msg}).`;
    }

    // 3) Node preflight — install Node 20 via official tarball into
    //    $HOME/.mr8-node (no sudo, no apt repo trust, no password
    //    prompts). First verify of the session pays the ~15s
    //    download; subsequent verifies find the binary already
    //    extracted. Adds $HOME/.mr8-node/bin to PATH for all
    //    downstream commands in this process.
    const NODE_DIR = '$HOME/.mr8-node';
    const NODE_PATH_EXPORT = `export PATH="$HOME/.mr8-node/bin:$PATH"`;
    try {
      const check = await sbx.commands.run(
        `${NODE_PATH_EXPORT}; command -v node && node --version`,
        { timeoutMs: 5_000 }
      );
      if (check.exitCode !== 0 || !check.stdout.trim()) {
        ctx.writer.send(VERIFY_EVENTS.INSTALL_LOG, {
          toolCallId,
          exitCode: 0,
          tail: "Installing Node.js inside Mr8's Computer (one-time setup)…",
        });
        // Use the official Node 20 LTS linux-x64 tarball. No sudo, no
        // apt, no trust-chain issues. Extract → rename → symlink bin.
        const install = await sbx.commands.run(
          [
            'set -e',
            'mkdir -p $HOME/.mr8-node',
            'cd /tmp',
            'curl -fsSL -o node.tar.xz https://nodejs.org/dist/v20.12.2/node-v20.12.2-linux-x64.tar.xz',
            'tar -xJf node.tar.xz',
            'rm -rf $HOME/.mr8-node/*',
            'mv node-v20.12.2-linux-x64/* $HOME/.mr8-node/',
            'rm -rf node-v20.12.2-linux-x64 node.tar.xz',
            `${NODE_PATH_EXPORT}`,
            'node --version',
            'npm --version',
          ].join(' && '),
          { timeoutMs: NODE_INSTALL_TIMEOUT_MS }
        );
        if (install.exitCode !== 0) {
          ctx.writer.send(VERIFY_EVENTS.DONE, {
            toolCallId,
            matches: false,
            issues: [`Node install failed: exit ${install.exitCode}`],
            summary: "Build verification skipped — Node could not be provisioned inside Mr8's Computer.",
          });
          return `verify_build failed: Node install exit ${install.exitCode}.\n${install.stdout.slice(-500)}\n${install.stderr.slice(-500)}`;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `verify_build failed: node preflight (${msg}).`;
    }

    // PATH prefix prepended to every subsequent shell command so node
    // and npm resolve from the tarball install.
    const P = `${NODE_PATH_EXPORT} && cd ${APP_ROOT} && `;

    // 4) npm install — capture exit code BEFORE piping through tail.
    try {
      const installed = await sbx.commands.run(
        `${P} npm install --no-audit --no-fund > /tmp/install.log 2>&1; echo "__exit__:$?"; tail -50 /tmp/install.log`,
        { timeoutMs: INSTALL_TIMEOUT_MS }
      );
      const exitMatch = installed.stdout.match(/__exit__:(\d+)/);
      const realExit = exitMatch ? parseInt(exitMatch[1], 10) : installed.exitCode;
      const logTail = installed.stdout.replace(/__exit__:\d+\n?/, '');
      ctx.writer.send(VERIFY_EVENTS.INSTALL_LOG, {
        toolCallId,
        exitCode: realExit,
        tail: logTail.slice(-2000),
      });
      if (realExit !== 0) {
        ctx.writer.send(VERIFY_EVENTS.DONE, {
          toolCallId,
          matches: false,
          issues: [`npm install failed with exit ${realExit}`],
          summary: 'Build verification failed — dependencies did not install.',
        });
        return `verify_build failed: npm install exit ${realExit}. Log tail:\n${logTail.slice(-800)}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.writer.send(VERIFY_EVENTS.DONE, {
        toolCallId,
        matches: false,
        issues: [`npm install error: ${msg}`],
        summary: 'Build verification skipped — npm install crashed.',
      });
      return `verify_build failed: npm install crashed (${msg}).`;
    }

    // 5) Start dev server in background. Force host bind + fixed port
    //    so the curl probe below matches what Vite serves.
    try {
      await sbx.commands.run(
        `${P} pkill -f vite || true; nohup $HOME/.mr8-node/bin/npm run dev -- --host 127.0.0.1 --port ${port} > /tmp/dev.log 2>&1 & echo $!`,
        { timeoutMs: 10_000 }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `verify_build failed: could not spawn dev server (${msg}).`;
    }

    // 6) Wait for the dev server to answer on the port.
    const ready = await pollDevReady(sbx, port, waitForMs);
    if (!ready) {
      const devLog = await sbx.commands
        .run('tail -60 /tmp/dev.log || true', { timeoutMs: 3_000 })
        .catch(() => ({ stdout: '', stderr: '', exitCode: 0 }));
      const logTail = devLog.stdout.slice(-1500);
      ctx.writer.send(VERIFY_EVENTS.INSTALL_LOG, {
        toolCallId,
        exitCode: -1,
        tail: `Dev server log tail:\n${logTail}`,
      });
      ctx.writer.send(VERIFY_EVENTS.DONE, {
        toolCallId,
        matches: false,
        issues: [
          `Dev server did not answer on port ${port} within ${waitForMs}ms`,
          ...(logTail.length > 0
            ? [`Dev log tail: ${logTail.slice(-400)}`]
            : []),
        ],
        summary: 'Build verification failed — dev server never became ready.',
      });
      return [
        `verify_build failed: dev server not ready on port ${port}.`,
        'Full dev log tail (inspect for the real cause — config errors, missing files, port clash, etc.):',
        logTail,
      ].join('\n');
    }

    // 7) Make sure Chromium is running inside the sandbox, then point
    //    it at the dev server. `sbx.screenshot()` captures the full
    //    desktop — if Chromium isn't booted we'd get a bare XFCE panel.
    try {
      await bootChromiumWithRetry(sandbox);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.writer.send(VERIFY_EVENTS.DONE, {
        toolCallId,
        matches: false,
        issues: [`Chromium boot failed: ${msg}`],
        summary: 'Build verification skipped — could not start the preview browser.',
      });
      return `verify_build failed: chromium boot (${msg}).`;
    }
    try {
      await sbx.commands.run(
        `DISPLAY=:99 xdotool search --onlyvisible --class chromium windowactivate 2>/dev/null || true; curl -sS "http://localhost:9222/json/version" >/dev/null 2>&1 && curl -sS -X PUT "http://localhost:9222/json/new?http://localhost:${port}/" >/dev/null 2>&1 || DISPLAY=:99 xdg-open "http://localhost:${port}/" 2>/dev/null || true`,
        { timeoutMs: 8_000 }
      );
      await new Promise((r) => setTimeout(r, 3_500));
    } catch {
      // fall through — screenshot captures whatever is visible
    }

    let pngBuffer: Buffer;
    try {
      const raw = await sbx.screenshot();
      pngBuffer = Buffer.from(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `verify_build failed: screenshot error (${msg}).`;
    }

    // 7) Save screenshot + expose via /uploads/verify.
    const userDir = path.join(UPLOADS_BASE, userKey);
    ensureDir(userDir);
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
    const absPath = path.join(userDir, filename);
    fs.writeFileSync(absPath, pngBuffer);
    const publicUrl = `/uploads/verify/${userKey}/${filename}`;

    ctx.writer.send(VERIFY_EVENTS.SCREENSHOT, {
      toolCallId,
      imageUrl: publicUrl,
    });

    // 8) Vision review.
    let verdict;
    try {
      verdict = await reviewWithVision(pngBuffer, userPrompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      verdict = {
        matches: true,
        issues: [],
        summary: `Vision review failed (${msg}) — assuming the build looks fine.`,
      };
    }

    ctx.writer.send(VERIFY_EVENTS.DONE, {
      toolCallId,
      matches: verdict.matches,
      issues: verdict.issues,
      summary: verdict.summary,
      screenshotUrl: publicUrl,
    });

    if (verdict.matches) {
      return [
        'Build verification passed.',
        `Summary: ${verdict.summary}`,
        "Tell the user the build is ready and STOP. Do not call verify_build again.",
      ].join('\n');
    }

    return [
      'Build verification found issues. Fix each one, then call verify_build again.',
      `Summary: ${verdict.summary}`,
      'Issues:',
      ...verdict.issues.map((s) => `- ${s}`),
    ].join('\n');
  },
};
