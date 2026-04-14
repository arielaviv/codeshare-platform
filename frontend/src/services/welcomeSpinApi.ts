import api from './api';
import type { SpinOutcome } from '../components/SlotMachine';

export interface WelcomeSpinResult {
  spins: [SpinOutcome, SpinOutcome];
  awardedCents: number;
  newBalanceCents: number;
}

export interface WelcomeSpinStatus {
  claimed: boolean;
  balanceCents: number;
}

export const welcomeSpinApi = {
  claim: (): Promise<WelcomeSpinResult> =>
    api.post('/welcome-spin/claim').then((r) => r.data),

  status: (): Promise<WelcomeSpinStatus> =>
    api.get('/welcome-spin/status').then((r) => r.data),
};
