/**
 * SSE event names for verify_build. Shared across backend emitter +
 * frontend consumer (frontend imports the same string values via
 * `frontend/src/types/verify-events.const.ts`). Keep in sync.
 */
export const VERIFY_EVENTS = {
  STARTED: 'verify_started',
  INSTALL_LOG: 'verify_install_log',
  SCREENSHOT: 'verify_screenshot',
  DONE: 'verify_done',
} as const;

export type VerifyEventName = (typeof VERIFY_EVENTS)[keyof typeof VERIFY_EVENTS];
