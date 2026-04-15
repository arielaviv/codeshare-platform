import mongoose, { Document, Schema } from 'mongoose';

export type ScheduledTaskMode =
  | 'auto'
  | 'code'
  | 'research'
  | 'sheet'
  | 'visualization'
  | 'audio'
  | 'video'
  | 'chat'
  | 'deck'
  | 'design';

export interface IScheduledTask extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  prompt: string;
  mode: ScheduledTaskMode;
  cronExpression: string; // e.g. "0 9 * * 1" — Mon 9am
  timezone: string;
  enabled: boolean;
  nextRunAt?: Date;
  lastRunAt?: Date;
  lastRunSessionId?: mongoose.Types.ObjectId;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const scheduledTaskSchema = new Schema<IScheduledTask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    prompt: { type: String, required: true, maxlength: 5000 },
    mode: {
      type: String,
      required: true,
      enum: ['auto', 'code', 'research', 'sheet', 'visualization', 'audio', 'video', 'chat', 'deck', 'design'],
      default: 'auto',
    },
    cronExpression: { type: String, required: true, maxlength: 60 },
    timezone: { type: String, default: 'UTC' },
    enabled: { type: Boolean, default: true },
    nextRunAt: { type: Date },
    lastRunAt: { type: Date },
    lastRunSessionId: { type: Schema.Types.ObjectId, ref: 'ChatSession' },
    runCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

scheduledTaskSchema.index({ enabled: 1, nextRunAt: 1 });
scheduledTaskSchema.index({ userId: 1, updatedAt: -1 });

export const ScheduledTask = mongoose.model<IScheduledTask>('ScheduledTask', scheduledTaskSchema);
