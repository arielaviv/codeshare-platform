import mongoose, { Document, Schema } from 'mongoose';

export type ComputerSessionStatus = 'running' | 'paused' | 'expired' | 'failed';

export interface IComputerSession extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  computeSandboxId?: string;
  desktopSandboxId?: string;
  status: ComputerSessionStatus;
  currentUrl?: string;
  currentTitle?: string;
  logs: string[];
  totalBrowserActions: number;
  totalPythonExecutions: number;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

const computerSessionSchema = new Schema<IComputerSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    computeSandboxId: {
      type: String,
      default: null,
    },
    desktopSandboxId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['running', 'paused', 'expired', 'failed'],
      default: 'running',
      required: true,
    },
    currentUrl: {
      type: String,
      maxlength: [2048, 'URL cannot exceed 2048 characters'],
    },
    currentTitle: {
      type: String,
      maxlength: [512, 'Title cannot exceed 512 characters'],
    },
    logs: {
      type: [String],
      default: [],
    },
    totalBrowserActions: {
      type: Number,
      default: 0,
    },
    totalPythonExecutions: {
      type: Number,
      default: 0,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

computerSessionSchema.index({ userId: 1, status: 1 });
computerSessionSchema.index({ expiresAt: 1 });
computerSessionSchema.index({ userId: 1, createdAt: -1 });

export const ComputerSession = mongoose.model<IComputerSession>(
  'ComputerSession',
  computerSessionSchema
);
