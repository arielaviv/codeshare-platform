/**
 * Mirror of `backend/src/services/tools/verify-events.const.ts`.
 * The two files MUST stay in lock-step — if you rename an event on the
 * backend, update both.
 */
export const VERIFY_EVENTS = {
  STARTED: 'verify_started',
  INSTALL_LOG: 'verify_install_log',
  SCREENSHOT: 'verify_screenshot',
  DONE: 'verify_done',
} as const;

export type VerifyEventName = (typeof VERIFY_EVENTS)[keyof typeof VERIFY_EVENTS];
