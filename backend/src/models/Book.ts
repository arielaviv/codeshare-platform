import mongoose, { Document, Schema } from 'mongoose';

export type BookStatus =
  | 'outline-pending'
  | 'outline-ready'
  | 'drafting'
  | 'editing'
  | 'cover-pending'
  | 'narrating'
  | 'translating'
  | 'bundling'
  | 'done'
  | 'error';

export interface IBookChapterOutline {
  n: number;
  title: string;
  beat: string;
  estimatedWords: number;
}

export interface IBookOutline {
  chapters: IBookChapterOutline[];
  totalEstimatedWords: number;
  themes: string[];
  pov: string;
  genre: string;
  tone: string;
}

export interface IBook extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  title: string;
  sourcePrompt: string;
  targetWords: number;
  language: string;
  sandboxId?: string;
  outline?: IBookOutline;
  status: BookStatus;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const chapterOutlineSchema = new Schema<IBookChapterOutline>(
  {
    n: { type: Number, required: true },
    title: { type: String, required: true, maxlength: 200 },
    beat: { type: String, required: true, maxlength: 1000 },
    estimatedWords: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const outlineSchema = new Schema<IBookOutline>(
  {
    chapters: { type: [chapterOutlineSchema], default: [] },
    totalEstimatedWords: { type: Number, required: true, default: 0 },
    themes: { type: [String], default: [] },
    pov: { type: String, required: true, default: 'third-person-limited' },
    genre: { type: String, required: true, default: 'fiction' },
    tone: { type: String, required: true, default: 'literary' },
  },
  { _id: false }
);

const bookSchema = new Schema<IBook>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'ChatSession', required: false, index: true },
    title: { type: String, required: true, maxlength: 200 },
    sourcePrompt: { type: String, required: true, maxlength: 5000 },
    targetWords: { type: Number, required: true, default: 2000 },
    language: { type: String, required: true, default: 'en' },
    sandboxId: { type: String, required: false },
    outline: { type: outlineSchema, required: false },
    status: {
      type: String,
      enum: [
        'outline-pending',
        'outline-ready',
        'drafting',
        'editing',
        'cover-pending',
        'narrating',
        'translating',
        'bundling',
        'done',
        'error',
      ],
      default: 'outline-pending',
      required: true,
    },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

bookSchema.index({ userId: 1, updatedAt: -1 });

export const Book = mongoose.model<IBook>('Book', bookSchema);
