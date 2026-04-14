import mongoose, { Document, Schema } from 'mongoose';

export type UsageFeature =
  | 'deck-generation'
  | 'code-explanation'
  | 'code-agent'
  | 'code-chat'
  | 'intent-classify';

export interface IUsageEvent extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  feature: UsageFeature;
  modelName: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  createdAt: Date;
}

const usageEventSchema = new Schema<IUsageEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index for per-user usage queries
usageEventSchema.index({ userId: 1, createdAt: -1 });
usageEventSchema.index({ feature: 1, createdAt: -1 });

export const UsageEvent = mongoose.model<IUsageEvent>('UsageEvent', usageEventSchema);
