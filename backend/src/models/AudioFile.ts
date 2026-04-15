import mongoose, { Document, Schema } from 'mongoose';

export interface IAudioFile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  title: string;
  sourcePrompt: string;
  scriptText: string;
  voiceId: string;
  voiceName?: string;
  durationSec: number;
  audioUrl: string;
  audioPath: string;
  costCents: number;
  createdAt: Date;
  updatedAt: Date;
}

const audioSchema = new Schema<IAudioFile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'ChatSession', required: false, index: true },
    title: { type: String, required: true, maxlength: 200 },
    sourcePrompt: { type: String, required: true, maxlength: 5000 },
    scriptText: { type: String, required: true },
    voiceId: { type: String, required: true },
    voiceName: { type: String },
    durationSec: { type: Number, required: true, default: 0 },
    audioUrl: { type: String, required: true },
    audioPath: { type: String, required: true },
    costCents: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

audioSchema.index({ userId: 1, updatedAt: -1 });

export const AudioFile = mongoose.model<IAudioFile>('AudioFile', audioSchema);
