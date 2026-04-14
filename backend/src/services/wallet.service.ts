import mongoose from 'mongoose';
import { Wallet } from '../models/Wallet';
import type { WalletDebitResult, WalletTransactionKind } from '../types/wallet';

export type CreditKind = Exclude<WalletTransactionKind, 'feature-debit'>;

export async function getBalance(
  userId: mongoose.Types.ObjectId
): Promise<number> {
  const doc = await Wallet.findOne({ userId }).select('balanceCents').lean();
  return doc?.balanceCents ?? 0;
}

export async function topUp(
  userId: mongoose.Types.ObjectId,
  amountCents: number,
  kind: CreditKind = 'topup'
): Promise<WalletDebitResult> {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, newBalanceCents: await getBalance(userId), reason: 'invalid_amount' };
  }

  const doc = await Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balanceCents: amountCents },
      $push: {
        transactions: {
          $each: [{ kind, amountCents, createdAt: new Date() }],
          $slice: -200,
        },
      },
      $setOnInsert: { userId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { ok: true, newBalanceCents: doc.balanceCents };
}

export async function appendCredit(
  userId: mongoose.Types.ObjectId,
  amountCents: number,
  kind: CreditKind,
  reason?: string
): Promise<WalletDebitResult> {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, newBalanceCents: await getBalance(userId), reason: 'invalid_amount' };
  }

  const doc = await Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balanceCents: amountCents },
      $push: {
        transactions: {
          $each: [{ kind, amountCents, reason, createdAt: new Date() }],
          $slice: -200,
        },
      },
      $setOnInsert: { userId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { ok: true, newBalanceCents: doc.balanceCents };
}

export async function debitForFeature(
  userId: mongoose.Types.ObjectId,
  cents: number,
  featureId?: string
): Promise<WalletDebitResult> {
  if (!Number.isFinite(cents) || cents <= 0) {
    return { ok: false, newBalanceCents: await getBalance(userId), reason: 'invalid_amount' };
  }

  const doc = await Wallet.findOneAndUpdate(
    { userId, balanceCents: { $gte: cents } },
    {
      $inc: { balanceCents: -cents },
      $push: {
        transactions: {
          $each: [
            {
              kind: 'feature-debit',
              amountCents: -cents,
              featureId,
              createdAt: new Date(),
            },
          ],
          $slice: -200,
        },
      },
    },
    { new: true }
  );

  if (!doc) {
    return {
      ok: false,
      newBalanceCents: await getBalance(userId),
      reason: 'insufficient_balance',
    };
  }

  return { ok: true, newBalanceCents: doc.balanceCents };
}
