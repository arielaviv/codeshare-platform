import type mongoose from 'mongoose';
import type { WalletDebitResult } from '../types/wallet';

// Stub for W1 integration. W2 replaces this file with the real implementation
// backed by a Wallet Mongoose model. Keep the signature stable — W1 and future
// callers depend on it.

export async function debitForFeature(
  _userId: mongoose.Types.ObjectId,
  _amountCents: number,
  _featureId?: string,
): Promise<WalletDebitResult> {
  return { ok: true, newBalanceCents: 0, reason: 'w2-pending' };
}

export async function getBalance(_userId: mongoose.Types.ObjectId): Promise<number> {
  return 0;
}
