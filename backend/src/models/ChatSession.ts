import mongoose, { Document, Schema } from 'mongoose';

export type ChatSessionSkill = 'apps' | 'slides' | 'sheet' | 'design' | 'mixed' | 'unknown';
export type ChatSessionTitleStatus = 'pending' | 'named' | 'failed';

export interface IChatSession extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  titleStatus: ChatSessionTitleStatus;
  skill: ChatSessionSkill;
  firstUserMessage: string;
  messageCount: number;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

const chatSessionSchema = new Schema<IChatSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, default: 'New chat', maxlength: 200 },
    titleStatus: {
      type: String,
      enum: ['pending', 'named', 'failed'],
      default: 'pending',
    },
    skill: {
      type: String,
      enum: ['apps', 'slides', 'sheet', 'design', 'mixed', 'unknown'],
      default: 'unknown',
    },
    firstUserMessage: { type: String, required: true, maxlength: 5000 },
    messageCount: { type: Number, default: 0 },
    unreadCount: { type: Number, default: 0 },
    closedAt: { type: Date, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

chatSessionSchema.index({ userId: 1, updatedAt: -1 });

export const ChatSession = mongoose.model<IChatSession>('ChatSession', chatSessionSchema);
