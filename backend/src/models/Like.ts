import mongoose, { Document, Schema } from 'mongoose';

export interface ILike extends Document {
  _id: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const likeSchema = new Schema<ILike>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Post ID is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index to prevent duplicate likes
likeSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const Like = mongoose.model<ILike>('Like', likeSchema);
