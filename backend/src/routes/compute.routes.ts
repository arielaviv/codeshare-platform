/**
 * Always-on Mr8's Computer lifecycle.
 *
 * Manus UX parity: a sandbox is spawned on the user's first message and
 * stays visible in the chat transcript from turn 1. The sandbox uses
 * E2B's native timeoutMs so it self-terminates after 15 min of inactivity
 * — no cron, no background process on our side.
 *
 * Activity (any tool call from browser-handler / python-handler) refreshes
 * the TTL via `setTimeout`. A heartbeat from the frontend keeps it alive
 * during focused-but-idle chat sessions. Browser-tab close fires
 * DELETE via navigator.sendBeacon.
 */
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  loadE2BConfig,
  createDesktopSandbox,
  connectDesktopSandbox,
  setDesktopTimeout,
  killDesktopSandbox,
} from '../services/computer/e2b-client';
import {
  getSession,
  upsertSession,
  killSession as killStoreEntry,
} from '../services/computer/e2b-session-store';

const router = Router();

/** 15 min idle timeout — matches the session-store TTL range. */
const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * POST /api/compute/session
 * Spawn or reconnect a desktop sandbox for the authenticated user.
 * Idempotent: repeated calls return the same sandbox + bump the TTL.
 */
router.post('/session', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  let config;
  try {
    config = loadE2BConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ message: `E2B not configured: ${msg}` });
    return;
  }

  // Reuse path: if we have a stored sandbox id, try reconnecting + TTL bump.
  const existing = getSession(userId);
  if (existing?.desktopSandboxId) {
    try {
      await connectDesktopSandbox(config, existing.desktopSandboxId);
      try {
        await setDesktopTimeout(config, existing.desktopSandboxId, SANDBOX_TIMEOUT_MS);
      } catch {
        // setTimeout can fail if the sandbox was already killed — fall
        // through to spawn a fresh one below.
      }
      res.json({
        sandboxId: existing.desktopSandboxId,
        ready: true,
        reused: true,
      });
      return;
    } catch {
      // stale sandbox id — fall through to fresh spawn
    }
  }

  // Fresh spawn with explicit timeout. Chromium boot is deferred to the
  // first browser tool call (keeps first-message latency low).
  try {
    const sandbox = await createDesktopSandbox(config, { timeoutMs: SANDBOX_TIMEOUT_MS });
    upsertSession(userId, {
      desktopSandboxId: sandbox.sandboxId,
      status: 'running',
    });
    res.json({ sandboxId: sandbox.sandboxId, ready: true, reused: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ message: `Failed to spawn sandbox: ${msg}` });
  }
});

/**
 * POST /api/compute/keepalive
 * Extend the sandbox TTL while the chat tab is focused. The frontend
 * calls this on a 5-min interval.
 */
router.post('/keepalive', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const session = getSession(userId);
  if (!session?.desktopSandboxId) {
    res.json({ ok: false, reason: 'no-session' });
    return;
  }
  try {
    const config = loadE2BConfig();
    await setDesktopTimeout(config, session.desktopSandboxId, SANDBOX_TIMEOUT_MS);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Stale sandbox — wipe the store slot so the next /session spawns fresh.
    killStoreEntry(userId);
    res.json({ ok: false, reason: msg });
  }
});

/**
 * DELETE /api/compute/session
 * Tear down the sandbox. Called via navigator.sendBeacon on browser
 * unload. Best-effort: a failed kill still wipes the local store slot.
 *
 * NOTE: beacon requests cannot set custom verbs — they POST. Accept both.
 */
async function handleRelease(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const removed = killStoreEntry(userId);
  if (removed?.desktopSandboxId) {
    try {
      const config = loadE2BConfig();
      await killDesktopSandbox(config, removed.desktopSandboxId);
    } catch {
      // swallow — sandbox may already be gone; local state is wiped
    }
  }
  res.json({ ok: true });
}

router.delete('/session', authenticate, handleRelease);
router.post('/release', authenticate, handleRelease);

export default router;
