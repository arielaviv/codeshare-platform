import mongoose, { Document, Schema } from 'mongoose';
import type { BlueprintSpec, DeliveryStatus } from '../types/blueprint';

export type UsageFeature =
  | 'deck-generation'
  | 'code-explanation'
  | 'code-agent'
  | 'code-chat'
  | 'intent-classify'
  | 'plan-proposal'
  | 'feature-upsell'
  | 'delivery-verify'
  | 'book-outline'
  | 'book-cover'
  | 'book-plan'
  | 'book-draft-chapter'
  | 'book-audit'
  | 'book-line-edit'
  | 'book-copy-edit'
  | 'book-format'
  | 'book-bundle';

export interface IUsageEvent extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  feature: UsageFeature;
  modelName: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  blueprint?: BlueprintSpec;
  deliveryStatus?: DeliveryStatus;
  createdAt: Date;
}

const usageEventSchema = new Schema<IUsageEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: false,
      index: true,
    },
    feature: {
      type: String,
      required: [true, 'Feature is required'],
      enum: [
        'deck-generation',
        'code-explanation',
        'code-agent',
        'code-chat',
        'intent-classify',
        'plan-proposal',
        'feature-upsell',
        'delivery-verify',
        'book-outline',
        'book-cover',
        'book-plan',
        'book-draft-chapter',
        'book-audit',
        'book-line-edit',
        'book-copy-edit',
        'book-format',
        'book-bundle',
      ],
    },
    modelName: {
      type: String,
      required: [true, 'Model is required'],
    },
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
    costCents: {
      type: Number,
      default: 0,
    },
    blueprint: {
      type: Schema.Types.Mixed,
      required: false,
    },
    deliveryStatus: {
      type: String,
      enum: [
        'scoped',
        'accepted',
        'building',
        'verifying',
        'verified',
        'delivered',
        'failed',
        'cancelled',
      ],
      required: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index for per-user usage queries
usageEventSchema.index({ userId: 1, createdAt: -1 });
usageEventSchema.index({ feature: 1, createdAt: -1 });

export const UsageEvent = mongoose.model<IUsageEvent>('UsageEvent', usageEventSchema);
