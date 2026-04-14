import mongoose, { Document, Schema } from 'mongoose';

export type SlidePalette = 'dark' | 'light' | 'gartner-blue' | 'gartner-warm';

export type SlideType =
  | 'title'
  | 'bullets'
  | 'two-column'
  | 'image'
  | 'chart-bar'
  | 'chart-line'
  | 'chart-pie'
  | 'stat'
  | 'quote'
  | 'comparison';

export interface ISlide {
  id: string;
  type: SlideType;
  content: Record<string, unknown>;
  elements?: Array<Record<string, unknown>>;
  notes?: string;
}

export interface IDeck extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  theme: {
    palette: SlidePalette;
    accentColor: string;
    fontFamily: string;
  };
  slides: ISlide[];
  isPublic: boolean;
  thumbnail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const slideSubSchema = new Schema<ISlide>(
  {
    id: {
      type: String,
      required: [true, 'Slide id is required'],
    },
    type: {
      type: String,
      required: [true, 'Slide type is required'],
      enum: [
        'title',
        'bullets',
        'two-column',
        'image',
        'chart-bar',
        'chart-line',
        'chart-pie',
        'stat',
        'quote',
        'comparison',
      ],
    },
    content: {
      type: Schema.Types.Mixed,
      default: {},
    },
    elements: {
      type: [Schema.Types.Mixed],
      default: undefined,
    },
    notes: {
      type: String,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
  },
  { _id: false }
);

const deckSchema = new Schema<IDeck>(
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
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    theme: {
      palette: {
        type: String,
        enum: ['dark', 'light', 'gartner-blue', 'gartner-warm'],
        default: 'gartner-blue',
      },
      accentColor: {
        type: String,
        default: '#002060',
      },
      fontFamily: {
        type: String,
        default: 'Inter, system-ui, sans-serif',
      },
    },
    slides: {
      type: [slideSubSchema],
      default: [],
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    thumbnail: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
deckSchema.index({ userId: 1 });
deckSchema.index({ createdAt: -1 });
deckSchema.index({ isPublic: 1 });

export const SlideDeck = mongoose.model<IDeck>('SlideDeck', deckSchema);
