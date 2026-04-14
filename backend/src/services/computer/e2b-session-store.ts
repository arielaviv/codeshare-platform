import type { ComputerSessionRecord, ComputerSessionStatus } from './types';

const SESSION_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

type Waiter = () => void;

interface StoredSession extends ComputerSessionRecord {
  mutexQueue: Waiter[];
  mutexLocked: boolean;
}

const store = new Map<string, StoredSession>();
let lastCleanupAt = 0;

function now(): number {
  return Date.now();
}

function createFresh(userId: string): StoredSession {
  const t = now();
  return {
    userId,
    status: 'running',
    createdAt: t,
    lastUsedAt: t,
    expiresAt: t + SESSION_TTL_MS,
    metadata: { logs: [] },
    mutexQueue: [],
    mutexLocked: false,
  };
}

function touch(session: StoredSession): void {
  const t = now();
  session.lastUsedAt = t;
  session.expiresAt = t + SESSION_TTL_MS;
}

function cleanExpired(t: number): void {
  for (const [key, session] of store) {
    if (t > session.expiresAt && !session.mutexLocked) {
      store.delete(key);
    }
  }
}

function maybeCleanup(): void {
  const t = now();
  if (t - lastCleanupAt > CLEANUP_INTERVAL_MS) {
    cleanExpired(t);
    lastCleanupAt = t;
  }
}

export function getSession(userId: string): ComputerSessionRecord | undefined {
  maybeCleanup();
  const session = store.get(userId);
  if (!session) return undefined;
  if (now() > session.expiresAt) {
    if (!session.mutexLocked) {
      store.delete(userId);
    }
    return undefined;
  }
  touch(session);
  return toRecord(session);
}

export function upsertSession(
  userId: string,
  patch: Partial<Omit<ComputerSessionRecord, 'userId' | 'createdAt'>>
): ComputerSessionRecord {
  let session = store.get(userId);
  if (!session) {
    session = createFresh(userId);
    store.set(userId, session);
  }
  if (patch.computeSandboxId !== undefined) session.computeSandboxId = patch.computeSandboxId;
  if (patch.desktopSandboxId !== undefined) session.desktopSandboxId = patch.desktopSandboxId;
  if (patch.status !== undefined) session.status = patch.status;
  if (patch.metadata !== undefined) {
    session.metadata = { ...session.metadata, ...patch.metadata };
  }
  touch(session);
  return toRecord(session);
}

export function setStatus(userId: string, status: ComputerSessionStatus): void {
  const session = store.get(userId);
  if (!session) return;
  session.status = status;
  touch(session);
}

export function appendLog(userId: string, line: string): void {
  const session = store.get(userId);
  if (!session) return;
  session.metadata.logs.push(line);
  if (session.metadata.logs.length > 200) {
    session.metadata.logs.splice(0, session.metadata.logs.length - 200);
  }
  touch(session);
}

export function clearSession(userId: string): void {
  store.delete(userId);
}

export function acquireLock(userId: string): Promise<() => void> {
  let session = store.get(userId);
  if (!session) {
    session = createFresh(userId);
    store.set(userId, session);
  }

  return new Promise<() => void>((resolve) => {
    const release = (): void => {
      const s = store.get(userId);
      if (!s) return;
      const next = s.mutexQueue.shift();
      if (next) {
        next();
      } else {
        s.mutexLocked = false;
      }
    };

    if (!session!.mutexLocked) {
      session!.mutexLocked = true;
      resolve(release);
      return;
    }
    session!.mutexQueue.push(() => resolve(release));
  });
}

export function _debugReset(): void {
  store.clear();
  lastCleanupAt = 0;
}

export function _debugSize(): number {
  return store.size;
}

function toRecord(session: StoredSession): ComputerSessionRecord {
  return {
    userId: session.userId,
    computeSandboxId: session.computeSandboxId,
    desktopSandboxId: session.desktopSandboxId,
    status: session.status,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    metadata: {
      currentUrl: session.metadata.currentUrl,
      currentTitle: session.metadata.currentTitle,
      logs: [...session.metadata.logs],
    },
  };
}

export const SESSION_CONSTANTS = {
  TTL_MS: SESSION_TTL_MS,
  CLEANUP_INTERVAL_MS,
};
