import mongoose, { Schema, Document } from 'mongoose';

export interface IImageSearchCache extends Document {
  key: string; // sha256(query::orientation)
  query: string;
  orientation: 'landscape' | 'portrait' | 'squarish';
  results: Array<{
    id: string;
    url: string;
    alt: string;
    author: string;
    width: number;
    height: number;
  }>;
  createdAt: Date;
}

const ImageSearchCacheSchema = new Schema<IImageSearchCache>(
  {
    key: { type: String, required: true, unique: true, index: true },
    query: { type: String, required: true },
    orientation: { type: String, required: true, enum: ['landscape', 'portrait', 'squarish'] },
    results: [
      {
        id: String,
        url: String,
        alt: String,
        author: String,
        width: Number,
        height: Number,
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// 7-day TTL on cached search results
ImageSearchCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const ImageSearchCache = mongoose.model<IImageSearchCache>(
  'ImageSearchCache',
  ImageSearchCacheSchema
);
