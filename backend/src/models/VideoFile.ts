import mongoose, { Document, Schema } from 'mongoose';

export type VideoStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface IVideoFile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  title: string;
  sourcePrompt: string;
  refinedPrompt?: string;
  durationSec: number;
  videoUrl?: string;
  videoPath?: string;
  posterUrl?: string;
  costCents: number;
  runwayJobId?: string;
  status: VideoStatus;
  failReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const videoSchema = new Schema<IVideoFile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'ChatSession', required: false, index: true },
    title: { type: String, required: true, maxlength: 200 },
    sourcePrompt: { type: String, required: true, maxlength: 5000 },
    refinedPrompt: { type: String, maxlength: 5000 },
    durationSec: { type: Number, default: 5 },
    videoUrl: { type: String },
    videoPath: { type: String },
    posterUrl: { type: String },
    costCents: { type: Number, default: 0 },
    runwayJobId: { type: String },
    status: { type: String, enum: ['queued', 'running', 'succeeded', 'failed'], default: 'queued' },
    failReason: { type: String },
  },
  { timestamps: true }
);

videoSchema.index({ userId: 1, updatedAt: -1 });

export const VideoFile = mongoose.model<IVideoFile>('VideoFile', videoSchema);
