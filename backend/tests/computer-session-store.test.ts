import {
  acquireLock,
  appendLog,
  clearSession,
  getSession,
  SESSION_CONSTANTS,
  setStatus,
  upsertSession,
  _debugReset,
  _debugSize,
} from '../src/services/computer/e2b-session-store';

describe('computer session store', () => {
  beforeEach(() => {
    _debugReset();
  });

  describe('upsertSession / getSession', () => {
    it('creates a session on first upsert', () => {
      const record = upsertSession('u1', { computeSandboxId: 'sbx_1' });
      expect(record.userId).toBe('u1');
      expect(record.computeSandboxId).toBe('sbx_1');
      expect(record.status).toBe('running');
    });

    it('returns undefined for unknown user', () => {
      expect(getSession('nobody')).toBeUndefined();
    });

    it('patches existing session without losing fields', () => {
      upsertSession('u1', { computeSandboxId: 'sbx_1' });
      upsertSession('u1', { desktopSandboxId: 'dsk_1' });
      const record = getSession('u1');
      expect(record?.computeSandboxId).toBe('sbx_1');
      expect(record?.desktopSandboxId).toBe('dsk_1');
    });

    it('extends expiresAt on access', async () => {
      upsertSession('u1', { computeSandboxId: 'sbx_1' });
      const before = getSession('u1');
      await new Promise((r) => setTimeout(r, 10));
      const after = getSession('u1');
      expect(after?.expiresAt).toBeGreaterThan(before?.expiresAt ?? 0);
    });
  });

  describe('TTL eviction', () => {
    it('removes sessions past expiresAt on next getSession', () => {
      const record = upsertSession('u1', { computeSandboxId: 'sbx_1' });
      const session = getSession('u1');
      expect(session).toBeDefined();

      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(record.expiresAt + 1);
      const expired = getSession('u1');
      expect(expired).toBeUndefined();
      nowSpy.mockRestore();
    });

    it('session TTL is 30 minutes', () => {
      expect(SESSION_CONSTANTS.TTL_MS).toBe(30 * 60 * 1000);
    });
  });

  describe('status + logs', () => {
    it('updates status', () => {
      upsertSession('u1', { computeSandboxId: 'sbx_1' });
      setStatus('u1', 'paused');
      expect(getSession('u1')?.status).toBe('paused');
    });

    it('appends logs and caps at 200 lines', () => {
      upsertSession('u1', {});
      for (let i = 0; i < 250; i += 1) {
        appendLog('u1', `line ${i}`);
      }
      const record = getSession('u1');
      expect(record?.metadata.logs.length).toBe(200);
      expect(record?.metadata.logs[0]).toBe('line 50');
      expect(record?.metadata.logs[199]).toBe('line 249');
    });
  });

  describe('clearSession', () => {
    it('removes a session', () => {
      upsertSession('u1', {});
      expect(_debugSize()).toBe(1);
      clearSession('u1');
      expect(_debugSize()).toBe(0);
      expect(getSession('u1')).toBeUndefined();
    });
  });

  describe('acquireLock (mutex)', () => {
    it('serializes concurrent lock holders', async () => {
      const order: string[] = [];

      const release1 = await acquireLock('u1');
      order.push('got-1');

      const second = acquireLock('u1').then((release) => {
        order.push('got-2');
        return release;
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(order).toEqual(['got-1']);

      release1();
      const release2 = await second;
      expect(order).toEqual(['got-1', 'got-2']);
      release2();
    });

    it('different users do not block each other', async () => {
      const r1 = await acquireLock('u1');
      const r2 = await acquireLock('u2');
      expect(typeof r1).toBe('function');
      expect(typeof r2).toBe('function');
      r1();
      r2();
    });

    it('lock is reentrant-safe after release', async () => {
      const r1 = await acquireLock('u1');
      r1();
      const r2 = await acquireLock('u1');
      expect(typeof r2).toBe('function');
      r2();
    });

    it('queued waiters unblock in FIFO order', async () => {
      const order: number[] = [];
      const r1 = await acquireLock('u1');

      const p2 = acquireLock('u1').then((r) => {
        order.push(2);
        return r;
      });
      const p3 = acquireLock('u1').then((r) => {
        order.push(3);
        return r;
      });

      await new Promise((r) => setTimeout(r, 20));
      r1();
      const r2 = await p2;
      r2();
      const r3 = await p3;
      r3();

      expect(order).toEqual([2, 3]);
    });
  });
});
