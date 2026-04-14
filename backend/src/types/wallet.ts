export type WalletTransactionKind =
  | 'topup'
  | 'feature-debit'
  | 'prize-credit'
  | 'milestone-credit'
  | 'welcome-credit'
  | 'refund';

export interface WalletTransaction {
  id: string;
  kind: WalletTransactionKind;
  amountCents: number;
  featureId?: string;
  reason?: string;
  createdAt: Date;
}

export interface Wallet {
  userId: string;
  balanceCents: number;
  transactions: WalletTransaction[];
  updatedAt: Date;
}

export interface WalletDebitResult {
  ok: boolean;
  newBalanceCents: number;
  reason?: string;
}
