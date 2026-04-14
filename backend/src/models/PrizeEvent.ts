import mongoose, { Document, Schema } from 'mongoose';

export interface IPrizeEvent extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amountCents: number;
  reason: string;
  source: 'agent' | 'milestone' | 'manual';
  createdAt: Date;
}

const prizeEventSchema = new Schema<IPrizeEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    amountCents: {
      type: Number,
      required: true,
      min: [1, 'Prize must be positive'],
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      maxlength: [280, 'Reason cannot exceed 280 characters'],
    },
    source: {
      type: String,
      enum: ['agent', 'milestone', 'manual'],
      default: 'agent',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

prizeEventSchema.index({ userId: 1, createdAt: -1 });

export const PrizeEvent = mongoose.model<IPrizeEvent>('PrizeEvent', prizeEventSchema);
