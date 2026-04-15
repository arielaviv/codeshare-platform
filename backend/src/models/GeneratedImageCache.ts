import mongoose, { Schema, Document } from 'mongoose';

export interface IGeneratedImageCache extends Document {
  key: string;
  userId: mongoose.Types.ObjectId | null;
  prompt: string;
  imageUrl: string;
  path: string;
  width: number;
  height: number;
  size: string;
  quality: string;
  costCents: number;
  createdAt: Date;
}

const GeneratedImageCacheSchema = new Schema<IGeneratedImageCache>(
  {
    key: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    prompt: { type: String, required: true },
    imageUrl: { type: String, required: true },
    path: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    size: { type: String, required: true },
    quality: { type: String, required: true },
    costCents: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Auto-purge after 30 days to keep storage bounded.
GeneratedImageCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const GeneratedImageCache = mongoose.model<IGeneratedImageCache>(
  'GeneratedImageCache',
  GeneratedImageCacheSchema
);
