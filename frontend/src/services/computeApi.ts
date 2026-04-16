import api from './api';

export interface ComputeSession {
  sandboxId: string;
  ready: boolean;
  reused: boolean;
}

export const computeApi = {
  /** Spawn or reconnect the per-user E2B desktop sandbox. Idempotent. */
  spawn: (): Promise<ComputeSession> =>
    api.post('/compute/session').then((r) => r.data),

  /** Refresh TTL — call every ~5 min while chat tab is focused. */
  keepalive: (): Promise<{ ok: boolean }> =>
    api.post('/compute/keepalive').then((r) => r.data),

  /** Tear down the sandbox. Used via sendBeacon on beforeunload. */
  release: (): Promise<{ ok: boolean }> =>
    api.delete('/compute/session').then((r) => r.data),
};
