import type { Response } from 'express';
import type { ComputerSSEEventMap, ComputerSSEEventName } from './types';

export interface ComputerSSEWriter {
  send<E extends ComputerSSEEventName>(event: E, data: ComputerSSEEventMap[E]): void;
  end(): void;
}

export function createComputerSSEWriter(res: Response): ComputerSSEWriter {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;

  res.on('close', () => {
    closed = true;
  });

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (closed) return;
      closed = true;
      res.end();
    },
  };
}
