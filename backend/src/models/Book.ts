import mongoose, { Document, Schema } from 'mongoose';

export type BookStatus =
  | 'outline-pending'
  | 'outline-ready'
  | 'drafting'
  | 'editing'
  | 'cover-pending'
  | 'cover-ready'
  | 'narrating'
  | 'translating'
  | 'bundling'
  | 'done'
  | 'error';

export type BookTitleTreatment =
  | 'bold-sans'
  | 'serif-elegant'
  | 'display-script'
  | 'condensed-tall'
  | 'distressed'
  | 'modern-mono';

export type BookTitlePosition = 'top' | 'center' | 'bottom';

export interface IBookCoverVariant {
  idx: number;
  conceptName: string;
  brief: string;
  imageUrl: string;
  titleTreatment: BookTitleTreatment;
  titleColor: string;
  authorColor: string;
  titlePosition: BookTitlePosition;
  paletteHexes: string[];
  costCents: number;
}

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
  author?: string;
  sourcePrompt: string;
  targetWords: number;
  language: string;
  sandboxId?: string;
  outline?: IBookOutline;
  coverVariants?: IBookCoverVariant[];
  selectedCoverIdx?: number;
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

const coverVariantSchema = new Schema<IBookCoverVariant>(
  {
    idx: { type: Number, required: true },
    conceptName: { type: String, required: true, maxlength: 200 },
    brief: { type: String, required: true, maxlength: 2000 },
    imageUrl: { type: String, required: true },
    titleTreatment: {
      type: String,
      required: true,
      enum: ['bold-sans', 'serif-elegant', 'display-script', 'condensed-tall', 'distressed', 'modern-mono'],
    },
    titleColor: { type: String, required: true, default: '#FFFFFF' },
    authorColor: { type: String, required: true, default: '#FFFFFF' },
    titlePosition: { type: String, required: true, enum: ['top', 'center', 'bottom'], default: 'center' },
    paletteHexes: { type: [String], default: [] },
    costCents: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const bookSchema = new Schema<IBook>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'ChatSession', required: false, index: true },
    title: { type: String, required: true, maxlength: 200 },
    author: { type: String, required: false, maxlength: 120 },
    sourcePrompt: { type: String, required: true, maxlength: 5000 },
    targetWords: { type: Number, required: true, default: 2000 },
    language: { type: String, required: true, default: 'en' },
    sandboxId: { type: String, required: false },
    outline: { type: outlineSchema, required: false },
    coverVariants: { type: [coverVariantSchema], default: undefined },
    selectedCoverIdx: { type: Number, required: false, min: 1, max: 12 },
    status: {
      type: String,
      enum: [
        'outline-pending',
        'outline-ready',
        'drafting',
        'editing',
        'cover-pending',
        'cover-ready',
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
