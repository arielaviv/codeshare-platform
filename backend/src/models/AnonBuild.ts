import mongoose, { Document, Schema } from 'mongoose';

// Anonymous build artifact. Created when an unauthenticated visitor uses the
// landing-page anon agent. Auto-deletes 24h after creation via TTL index.
// Adopted into a real user's account via /api/ai/anon-build/:id/adopt.

export interface IAnonBuild extends Document {
  _id: mongoose.Types.ObjectId;
  prompt: string;
  files: Record<string, string>;
  assistantText: string;
  ip: string;
  claimedByUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const anonBuildSchema = new Schema<IAnonBuild>(
  {
    prompt: {
      type: String,
      required: true,
      maxlength: [300, 'Prompt cannot exceed 300 characters'],
    },
    files: {
      type: Schema.Types.Mixed,
      default: {},
    },
    assistantText: {
      type: String,
      default: '',
    },
    ip: {
      type: String,
      required: true,
    },
    claimedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL — Mongo deletes the document 24h after createdAt
anonBuildSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
anonBuildSchema.index({ ip: 1, createdAt: -1 });

export const AnonBuild = mongoose.model<IAnonBuild>('AnonBuild', anonBuildSchema);
