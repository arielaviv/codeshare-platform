import mongoose from 'mongoose';
import { ComputerSession } from '../src/models/ComputerSession';

describe('ComputerSession model', () => {
  const userId = new mongoose.Types.ObjectId();

  it('creates a minimal session', async () => {
    const s = await ComputerSession.create({
      userId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    expect(s.status).toBe('running');
    expect(s.logs).toEqual([]);
    expect(s.totalBrowserActions).toBe(0);
    expect(s.totalPythonExecutions).toBe(0);
    expect(s.createdAt).toBeInstanceOf(Date);
  });

  it('enforces status enum', async () => {
    await expect(
      ComputerSession.create({
        userId,
        status: 'bogus',
        expiresAt: new Date(),
      } as never)
    ).rejects.toThrow();
  });

  it('requires expiresAt', async () => {
    await expect(ComputerSession.create({ userId } as never)).rejects.toThrow();
  });

  it('supports full lifecycle update', async () => {
    const s = await ComputerSession.create({
      userId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    s.status = 'paused';
    s.computeSandboxId = 'sbx_123';
    s.desktopSandboxId = 'dsk_456';
    s.currentUrl = 'https://example.com';
    s.currentTitle = 'Example';
    s.logs.push('navigated');
    s.totalBrowserActions = 3;
    await s.save();

    const loaded = await ComputerSession.findById(s._id);
    expect(loaded?.status).toBe('paused');
    expect(loaded?.computeSandboxId).toBe('sbx_123');
    expect(loaded?.desktopSandboxId).toBe('dsk_456');
    expect(loaded?.currentUrl).toBe('https://example.com');
    expect(loaded?.logs).toEqual(['navigated']);
    expect(loaded?.totalBrowserActions).toBe(3);
  });

  it('rejects URL longer than 2048 chars', async () => {
    const longUrl = 'https://' + 'a'.repeat(2050);
    await expect(
      ComputerSession.create({
        userId,
        currentUrl: longUrl,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
    ).rejects.toThrow();
  });

  it('indexes userId + status for fast active-session lookup', () => {
    const indexes = ComputerSession.schema.indexes();
    const hasIndex = indexes.some(
      ([fields]) =>
        fields && 'userId' in fields && 'status' in fields && fields.userId === 1 && fields.status === 1
    );
    expect(hasIndex).toBe(true);
  });
});
