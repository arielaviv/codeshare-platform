import mongoose, { Document, Schema } from 'mongoose';

export interface IPost extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  code: string;
  language: string;
  description?: string;
  image?: string;
  aiExplanation?: string;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema<IPost>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    code: {
      type: String,
      required: [true, 'Code is required'],
      maxlength: [10000, 'Code cannot exceed 10000 characters'],
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    image: {
      type: String,
      default: null,
    },
    aiExplanation: {
      type: String,
      default: null,
    },
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
postSchema.index({ userId: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ language: 1 });

export const Post = mongoose.model<IPost>('Post', postSchema);
