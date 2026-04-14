import { dispatchComputerTool } from '../src/services/computer/dispatch';
import type { ComputerSSEWriter } from '../src/services/computer/sse-writer';
import { _debugReset } from '../src/services/computer/e2b-session-store';

function fakeSSE(): ComputerSSEWriter & { calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    send: (event, data) => {
      calls.push([event as string, data]);
    },
    end: jest.fn(),
  };
}

describe('computer tool dispatch', () => {
  const TEST_CONFIG = { apiKey: 'test-key' };

  beforeEach(() => {
    _debugReset();
  });

  describe('input validation', () => {
    it('rejects python without code', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'python',
        { description: 'no code' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('code');
    });

    it('rejects browser without valid action', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'browser',
        { action: 'hack' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('valid');
    });

    it('rejects unknown tool name', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'unknown',
        {},
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('Unknown');
    });
  });

  describe('python tool happy path', () => {
    it('emits start + result SSE events for a valid run', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'python',
        { code: 'print(1)', description: 'hello' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(true);
      const eventNames = sse.calls.map(([name]) => name);
      expect(eventNames).toContain('code-execution-start');
      expect(eventNames).toContain('code-execution-result');
    });

    it('mounts workspace files that match input.files', async () => {
      const sse = fakeSSE();
      await dispatchComputerTool(
        'python',
        { code: 'x', files: ['a.py', 'missing.py'] },
        {
          userId: 'u1',
          workspace: { 'a.py': 'print(1)' },
          sse,
          config: TEST_CONFIG,
        }
      );
      const events = sse.calls.map(([name]) => name);
      expect(events).toContain('code-execution-result');
    });

    it('coerces non-string file entries out', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'python',
        { code: 'x', files: ['a.py', 123, 'b.py'] },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('browser tool happy path', () => {
    it('emits browser-start/action/end for navigate', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'browser',
        { action: 'navigate', url: 'https://example.com' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(true);
      const events = sse.calls.map(([name]) => name);
      expect(events).toContain('browser-start');
      expect(events).toContain('browser-action');
      expect(events).toContain('browser-end');
    });

    it('requires url for navigate', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'browser',
        { action: 'navigate' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(false);
    });

    it('requires query for search', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'browser',
        { action: 'search' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(false);
    });

    it('accepts close without other params', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'browser',
        { action: 'close' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(true);
    });

    it('normalizes invalid scroll direction to undefined', async () => {
      const sse = fakeSSE();
      const result = await dispatchComputerTool(
        'browser',
        { action: 'scroll', direction: 'sideways' },
        { userId: 'u1', workspace: {}, sse, config: TEST_CONFIG }
      );
      expect(result.ok).toBe(true);
    });
  });
});
