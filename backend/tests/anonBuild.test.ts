import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { createTestUser, getAuthHeader } from './setup';
import { AnonBuild } from '../src/models/AnonBuild';
import { User } from '../src/models/User';

const MockAnthropic = Anthropic as unknown as jest.Mock;

// Queues a sequence of responses: one tool_use per file, then a final text
// response that ends the loop.
function mockAnonRun(files: Array<{ path: string; content: string }>): void {
  const createFn = jest.fn();
  files.forEach((f, i) => {
    createFn.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: `tu_${i}`,
          name: 'write_file',
          input: { path: f.path, content: f.content },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 300 },
    });
  });
  createFn.mockResolvedValueOnce({
    content: [
      { type: 'text', text: 'Preview ready. Sign up to extend it into a full app.' },
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 50, output_tokens: 30 },
  });
  MockAnthropic.mockImplementation(() => ({
    messages: { create: createFn },
  }));
}

async function collectSSE(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; events: Array<{ event: string; data: unknown }> }> {
  const res = await request(app)
    .post('/api/ai/anon-build')
    .set(headers)
    .send(body);

  if (res.status !== 200) {
    return { status: res.status, events: [] };
  }
  const raw = res.text || '';
  const parts = raw.split('\n\n').filter(Boolean);
  const events = parts
    .map((part) => {
      const lines = part.split('\n');
      let event = '';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (!event) return null;
      try {
        return { event, data: JSON.parse(data) };
      } catch {
        return { event, data };
      }
    })
    .filter((e): e is { event: string; data: unknown } => e !== null);
  return { status: res.status, events };
}

describe('POST /api/ai/anon-build', () => {
  beforeEach(() => {
    MockAnthropic.mockReset();
  });

  it('streams a build and persists an AnonBuild doc', async () => {
    mockAnonRun([
      { path: 'index.html', content: '<h1>Hi</h1>' },
      { path: 'styles.css', content: 'body { margin:0 }' },
    ]);

    const { status, events } = await collectSSE(
      { prompt: 'build me a hello page' },
      { 'X-Forwarded-For': '10.0.0.1' }
    );

    expect(status).toBe(200);
    const eventTypes = events.map((e) => e.event);
    expect(eventTypes).toContain('tool_call');
    expect(eventTypes).toContain('file_write');
    expect(eventTypes[eventTypes.length - 1]).toBe('done');

    const done = events[events.length - 1].data as { buildId: string; filesModified: string[] };
    expect(done.buildId).toBeDefined();
    expect(done.filesModified).toEqual(expect.arrayContaining(['index.html', 'styles.css']));

    const persisted = await AnonBuild.findById(done.buildId);
    expect(persisted).not.toBeNull();
    expect(persisted!.prompt).toBe('build me a hello page');
    expect(persisted!.files['index.html']).toBe('<h1>Hi</h1>');
    expect(persisted!.ip).toBe('10.0.0.1');
  });

  it('rate-limits a second call from the same IP within the window', async () => {
    mockAnonRun([{ path: 'index.html', content: '<h1>a</h1>' }]);
    const first = await collectSSE(
      { prompt: 'first build' },
      { 'X-Forwarded-For': '10.0.0.2' }
    );
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/ai/anon-build')
      .set('X-Forwarded-For', '10.0.0.2')
      .send({ prompt: 'second build' });
    expect(second.status).toBe(429);
  });

  it('allows concurrent builds from different IPs', async () => {
    mockAnonRun([{ path: 'index.html', content: '<h1>a</h1>' }]);
    const a = await collectSSE(
      { prompt: 'from A' },
      { 'X-Forwarded-For': '10.0.1.1' }
    );
    expect(a.status).toBe(200);

    mockAnonRun([{ path: 'index.html', content: '<h1>b</h1>' }]);
    const b = await collectSSE(
      { prompt: 'from B' },
      { 'X-Forwarded-For': '10.0.1.2' }
    );
    expect(b.status).toBe(200);
  });

  it('rejects a too-short prompt (400)', async () => {
    const res = await request(app)
      .post('/api/ai/anon-build')
      .set('X-Forwarded-For', '10.0.2.1')
      .send({ prompt: 'a' });
    expect(res.status).toBe(400);
  });

  it('rejects a too-long prompt (400)', async () => {
    const res = await request(app)
      .post('/api/ai/anon-build')
      .set('X-Forwarded-For', '10.0.2.2')
      .send({ prompt: 'x'.repeat(301) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/anon-build/:buildId/adopt', () => {
  beforeEach(() => {
    MockAnthropic.mockReset();
  });

  async function createAnonBuildFixture(ip = '10.0.3.1'): Promise<string> {
    mockAnonRun([{ path: 'index.html', content: '<h1>Hi</h1>' }]);
    const { events } = await collectSSE(
      { prompt: 'hello app' },
      { 'X-Forwarded-For': ip }
    );
    const done = events[events.length - 1].data as { buildId: string };
    return done.buildId;
  }

  it('adopts the build, grants $5 welcome bonus, returns files', async () => {
    const buildId = await createAnonBuildFixture('10.0.3.1');
    const { user, accessToken } = await createTestUser();

    const res = await request(app)
      .post(`/api/ai/anon-build/${buildId}/adopt`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.prompt).toBe('hello app');
    expect(res.body.files['index.html']).toBe('<h1>Hi</h1>');
    expect(res.body.awardedCents).toBe(500);
    expect(res.body.newBalanceCents).toBe(500);

    const u = await User.findById(user.id);
    expect(u!.hasClaimedWelcomeBonus).toBe(true);
    expect(u!.creditsCents).toBe(500);
  });

  it('does not re-award the welcome bonus if user already claimed', async () => {
    const buildId = await createAnonBuildFixture('10.0.3.2');
    const { user, accessToken } = await createTestUser();

    // Manually flag the user as already having claimed
    await User.findByIdAndUpdate(user.id, {
      hasClaimedWelcomeBonus: true,
      creditsCents: 500,
    });

    const res = await request(app)
      .post(`/api/ai/anon-build/${buildId}/adopt`)
      .set(getAuthHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.awardedCents).toBe(0);
    expect(res.body.newBalanceCents).toBe(500);
  });

  it('rejects second adopt attempt with 409', async () => {
    const buildId = await createAnonBuildFixture('10.0.3.3');
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const first = await request(app)
      .post(`/api/ai/anon-build/${buildId}/adopt`)
      .set(getAuthHeader(user1.accessToken));
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/ai/anon-build/${buildId}/adopt`)
      .set(getAuthHeader(user2.accessToken));
    expect(second.status).toBe(409);
  });

  it('rejects unauthenticated adopt', async () => {
    const buildId = await createAnonBuildFixture('10.0.3.4');
    const res = await request(app).post(`/api/ai/anon-build/${buildId}/adopt`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent buildId', async () => {
    const { accessToken } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post(`/api/ai/anon-build/${fakeId}/adopt`)
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed buildId', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/ai/anon-build/not-a-valid-id/adopt')
      .set(getAuthHeader(accessToken));
    expect(res.status).toBe(400);
  });
});
