import mongoose, { Document, Schema, Types } from 'mongoose';
import type { WalletTransactionKind } from '../types/wallet';

export interface IWalletTransaction {
  _id: Types.ObjectId;
  kind: WalletTransactionKind;
  amountCents: number;
  featureId?: string;
  reason?: string;
  createdAt: Date;
}

export interface IWallet extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  balanceCents: number;
  transactions: Types.DocumentArray<IWalletTransaction>;
  createdAt: Date;
  updatedAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    kind: {
      type: String,
      enum: [
        'topup',
        'feature-debit',
        'prize-credit',
        'milestone-credit',
        'welcome-credit',
        'refund',
      ],
      required: true,
    },
    amountCents: {
      type: Number,
      required: true,
    },
    featureId: {
      type: String,
      required: false,
    },
    reason: {
      type: String,
      maxlength: 280,
      required: false,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: true }
);

const walletSchema = new Schema<IWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    balanceCents: {
      type: Number,
      default: 0,
      min: 0,
    },
    transactions: {
      type: [walletTransactionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export const Wallet = mongoose.model<IWallet>('Wallet', walletSchema);
