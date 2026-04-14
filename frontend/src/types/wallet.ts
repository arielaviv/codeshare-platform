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
  createdAt: string;
}

export interface Wallet {
  userId: string;
  balanceCents: number;
  transactions: WalletTransaction[];
  updatedAt: string;
}

export interface WalletDebitResult {
  ok: boolean;
  newBalanceCents: number;
  reason?: string;
}
