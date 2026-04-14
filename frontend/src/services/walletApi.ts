import api from './api';
import type { Wallet } from '../types/wallet';

export interface WalletSnapshot {
  balanceCents: number;
  transactions: Wallet['transactions'];
}

export const WALLET_CHANGED_EVENT = 'mr8:wallet-changed';

export function notifyWalletChanged(): void {
  window.dispatchEvent(new CustomEvent(WALLET_CHANGED_EVENT));
}

export const walletApi = {
  get: (): Promise<WalletSnapshot> => api.get('/wallet').then((r) => r.data),

  topUp: (amountCents: number): Promise<{ balanceCents: number }> =>
    api.post('/wallet/topup', { amountCents }).then((r) => r.data),
};
