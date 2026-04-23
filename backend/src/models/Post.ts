import mongoose, { Document, Schema } from 'mongoose';

/**
 * Artifact kinds — one per product module. A post carries a single artifact;
 * the feed card renders a thumbnail matching what Mr8 shows at completion.
 * `snippet` is the legacy manual-share path from CreatePostModal.
 */
export type PostKind =
  | 'snippet'
  | 'code-app'
  | 'deck'
  | 'book'
  | 'video'
  | 'audio'
  | 'image'
  | 'visualization'
  | 'spreadsheet'
  | 'research';

export const POST_KINDS: PostKind[] = [
  'snippet',
  'code-app',
  'deck',
  'book',
  'video',
  'audio',
  'image',
  'visualization',
  'spreadsheet',
  'research',
];

export interface IPost extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  kind: PostKind;
  title: string;
  code: string;
  language: string;
  description?: string;
  image?: string;
  files?: Map<string, string>;
  /** Points to the source document (deckId, bookId, filename, etc). */
  artifactRef?: string;
  /** Thumbnail URL shown on the feed card. May be absolute, `/uploads/...`,
   *  or a data: URI. */
  thumbnail?: string;
  /** Kind-specific structured data used to render the feed card thumbnail
   *  without a second fetch (e.g. slide subtitle + bullet count, audio
   *  duration + voice, video duration, research summary). */
  meta?: Record<string, unknown>;
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
    kind: {
      type: String,
      enum: POST_KINDS,
      default: 'snippet',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    code: {
      type: String,
      default: '',
      maxlength: [10000, 'Code cannot exceed 10000 characters'],
    },
    language: {
      type: String,
      default: 'text',
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
    files: {
      type: Map,
      of: String,
      default: undefined,
    },
    artifactRef: {
      type: String,
      default: null,
      maxlength: 200,
    },
    thumbnail: {
      type: String,
      default: null,
      maxlength: 2048,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: undefined,
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

postSchema.index({ userId: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ language: 1 });

export const Post = mongoose.model<IPost>('Post', postSchema);
