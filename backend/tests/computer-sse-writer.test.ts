import { createComputerSSEWriter } from '../src/services/computer/sse-writer';

interface FakeRes {
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  on: jest.Mock;
  triggerClose: () => void;
}

function fakeResponse(): FakeRes {
  let closeCb: (() => void) | null = null;
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event: string, cb: () => void) => {
      if (event === 'close') closeCb = cb;
    }),
    triggerClose() {
      closeCb?.();
    },
  };
}

describe('computer SSE writer', () => {
  it('sets SSE headers on construction', () => {
    const res = fakeResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createComputerSSEWriter(res as any);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('emits events in SSE wire format', () => {
    const res = fakeResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = createComputerSSEWriter(res as any);
    writer.send('text_delta', { text: 'hello' });
    expect(res.write).toHaveBeenCalledWith('event: text_delta\n');
    expect(res.write).toHaveBeenCalledWith('data: {"text":"hello"}\n\n');
  });

  it('serializes nested event payloads', () => {
    const res = fakeResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = createComputerSSEWriter(res as any);
    writer.send('browser-action', {
      executionId: 'br-1',
      action: 'navigate',
      target: 'https://example.com',
      url: 'https://example.com',
      title: 'Example',
      timestamp: 1000,
    });
    const dataCall = res.write.mock.calls.find(([line]: [string]) => line.startsWith('data:'));
    expect(dataCall?.[0]).toContain('"action":"navigate"');
    expect(dataCall?.[0]).toContain('"target":"https://example.com"');
  });

  it('stops emitting after close', () => {
    const res = fakeResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = createComputerSSEWriter(res as any);
    res.triggerClose();
    writer.send('text_delta', { text: 'after close' });
    expect(res.write).not.toHaveBeenCalled();
  });

  it('end() closes once and is idempotent', () => {
    const res = fakeResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = createComputerSSEWriter(res as any);
    writer.end();
    writer.end();
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
