import mongoose, { Document, Schema } from 'mongoose';
import { BOOK_THEME_IDS, type BookThemeId } from '../services/book/themes';

export type BookStatus =
  | 'outline-pending'
  | 'outline-ready'
  | 'drafting'
  | 'editing'
  | 'formatting'
  | 'cover-pending'
  | 'cover-ready'
  | 'narrating'
  | 'translating'
  | 'bundling'
  | 'done'
  | 'error';

/**
 * Physical trim size (KDP/IngramSpark). `themes/index.ts` specifies a default
 * per theme; `IBookProduction.trimSize` is the user's override (stored on the
 * book so re-formatting is deterministic).
 */
export type BookTrimSize = '5x8' | '5.5x8.5' | '6x9';

/**
 * Export format; controls which pandoc targets the Formatter (Slice 7) runs.
 */
export type BookExportFormat = 'pdf' | 'epub' | 'docx';

/**
 * Translation targets for Slice 9. v1 ships ES + FR only; RTL
 * (Arabic/Hebrew) is v2 — see decision log in the master plan.
 */
export type BookTranslationLanguage = 'es' | 'fr';

/**
 * Every file the Formatter / Bundler writes gets an entry here. The Studio's
 * Downloads section renders rows from this array, and the bundle zip step
 * (Slice 7.iii) picks them up by `kind` + `lang`. Translation re-runs
 * (Slice 9) push their own PDF/EPUB rows with `lang: 'es' | 'fr'`.
 */
export type BookArtifactKind =
  | 'pdf'
  | 'epub'
  | 'docx'
  | 'cover-wrap-paperback'
  | 'cover-wrap-hardcover'
  | 'cover-for-epub'
  | 'copyright-cert'
  | 'kdp-guide'
  | 'bundle-zip'
  | 'audiobook'
  | 'translation-pdf'
  | 'translation-epub';

export interface IBookBuildArtifact {
  kind: BookArtifactKind;
  /** Sandbox-relative path (e.g. 'build/book.pdf'). Used for re-bundling. */
  sandboxPath: string;
  /** Public URL on the disk mirror; served via `/uploads/books/...`. */
  url: string;
  sizeBytes: number;
  builtAt: Date;
  /** Which language edition this artifact belongs to; 'en' for the source. */
  lang?: string;
}

/**
 * User-selected production settings — governs what the Formatter / Narrator /
 * Translator do. Set at outline-ready with sensible defaults; editable from
 * Studio settings. All values are persisted so re-runs are deterministic.
 */
export interface IBookProduction {
  trimSize: BookTrimSize;
  formats: BookExportFormat[];
  enableNarration: boolean;
  narrationVoiceId?: string;
  enableTranslation: boolean;
  translationLanguages: BookTranslationLanguage[];
}

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

/**
 * Per-chapter status transitions across the pipeline:
 *   pending → drafting → drafted → editing → edited → proofing → proofed
 * `error` can be set at any stage; a regenerate flips the relevant fields
 * back to an earlier state.
 */
export type ChapterStatus =
  | 'pending'
  | 'drafting'
  | 'drafted'
  | 'editing'
  | 'edited'
  | 'proofing'
  | 'proofed'
  | 'error';

export interface IBookChapter {
  n: number;
  title: string;
  beat: string;
  estimatedWords: number;
  status: ChapterStatus;
  /** Sandbox-relative paths (no leading /); filled as the pipeline advances. */
  draftPath?: string;   // chapters/chXX.md
  editedPath?: string;  // edited/chXX.md (Slice 5)
  proofedPath?: string; // proofed/chXX.md (Slice 5)
  audioPath?: string;   // audio/chXX.mp3 (Slice 8)
  /** Realized word count (final prose, not estimate). */
  wordCount?: number;
  /** Brief summary of what the Line Editor changed — shown in Final mode. */
  editingNotes?: string;
  /** Per-chunk skip log for line-edit safeguards; shown in Reader gutter. */
  skippedChunkIdxs?: number[];
  /** Last error for this chapter (draft/edit/proof). */
  errorMessage?: string;
}

export type EditAggressiveness = 'light' | 'standard' | 'heavy';

export interface IBookAuditIssue {
  kind: 'character' | 'timeline' | 'setting' | 'name' | 'tone' | 'continuity';
  /** 1-based chapter indexes. Single-chapter issues have one element; cross-chapter
   *  contradictions list every chapter involved. */
  chapterRange: number[];
  description: string;
  suggestedFix: string;
  /** Flipped to true by the Line Editor when it applies a fix in that chapter's range. */
  resolved?: boolean;
}

export interface IBookEditingChoices {
  aggressiveness: EditAggressiveness;
  /** Optional author-written note injected into the Line Editor's system prompt. */
  directives?: string;
  /** Timestamp of the user's choice, for the stepper. */
  chosenAt?: Date;
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
  /**
   * Per-chapter tracking — materialized from outline.chapters at draft-start.
   * Authoritative (the sidebar + Reader read from here, not the sandbox).
   * Survives E2B sandbox death and is the source of truth for regenerate flows.
   */
  chapters?: IBookChapter[];
  /** Continuity audit results; populated by the Slice 5 auditor. */
  auditIssues?: IBookAuditIssue[];
  /** User's picks for the Polish pipeline (aggressiveness + directives). */
  editingChoices?: IBookEditingChoices;
  /** AI-picked at outline-complete from pickThemeForOutline(); user-overridable via Studio dropdown. */
  themeId: BookThemeId;
  /** User-selected export / narration / translation settings (Slice 7+). */
  production?: IBookProduction;
  /** Every file the Formatter / Bundler produced — source of truth for the Downloads section. */
  artifacts?: IBookBuildArtifact[];
  /** Public URL of the final Mr8-Book-<slug>.zip once the Bundler (Slice 7.iii) succeeds. */
  bundleUrl?: string;
  /** Set alongside `bundleUrl` when bundling completes. */
  publishedBundleAt?: Date;
  status: BookStatus;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const chapterOutlineSchema = new Schema<IBookChapterOutline>(
  {
    n: { type: Number, required: true },
    title: { type: String, required: true, maxlength: 200 },
    // 3000 so the craft-bible's "because"-clause themes and longer beat prose
    // (anaphora monologues, multi-sentence beats) fit without rejection.
    beat: { type: String, required: true, maxlength: 3000 },
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

const chapterSchema = new Schema<IBookChapter>(
  {
    n: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, maxlength: 200 },
    beat: { type: String, required: true, maxlength: 3000 },
    estimatedWords: { type: Number, required: true, default: 0, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'drafting', 'drafted', 'editing', 'edited', 'proofing', 'proofed', 'error'],
      default: 'pending',
    },
    draftPath: { type: String, required: false },
    editedPath: { type: String, required: false },
    proofedPath: { type: String, required: false },
    audioPath: { type: String, required: false },
    wordCount: { type: Number, required: false, min: 0 },
    editingNotes: { type: String, required: false, maxlength: 500 },
    skippedChunkIdxs: { type: [Number], default: undefined },
    errorMessage: { type: String, required: false, maxlength: 1000 },
  },
  { _id: false }
);

const auditIssueSchema = new Schema<IBookAuditIssue>(
  {
    kind: {
      type: String,
      required: true,
      enum: ['character', 'timeline', 'setting', 'name', 'tone', 'continuity'],
    },
    chapterRange: { type: [Number], required: true },
    description: { type: String, required: true, maxlength: 1000 },
    suggestedFix: { type: String, required: true, maxlength: 1000 },
    resolved: { type: Boolean, required: false, default: false },
  },
  { _id: false }
);

const editingChoicesSchema = new Schema<IBookEditingChoices>(
  {
    aggressiveness: {
      type: String,
      required: true,
      enum: ['light', 'standard', 'heavy'],
      default: 'standard',
    },
    directives: { type: String, required: false, maxlength: 1000 },
    chosenAt: { type: Date, required: false },
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

const buildArtifactSchema = new Schema<IBookBuildArtifact>(
  {
    kind: {
      type: String,
      required: true,
      enum: [
        'pdf',
        'epub',
        'docx',
        'cover-wrap-paperback',
        'cover-wrap-hardcover',
        'cover-for-epub',
        'copyright-cert',
        'kdp-guide',
        'bundle-zip',
        'audiobook',
        'translation-pdf',
        'translation-epub',
      ],
    },
    sandboxPath: { type: String, required: true, maxlength: 500 },
    url: { type: String, required: true, maxlength: 500 },
    sizeBytes: { type: Number, required: true, min: 0 },
    builtAt: { type: Date, required: true, default: () => new Date() },
    lang: { type: String, required: false, maxlength: 8 },
  },
  { _id: false }
);

const productionSchema = new Schema<IBookProduction>(
  {
    trimSize: {
      type: String,
      required: true,
      enum: ['5x8', '5.5x8.5', '6x9'],
      default: '6x9',
    },
    formats: {
      type: [String],
      required: true,
      default: ['pdf', 'epub', 'docx'],
      validate: {
        validator: (arr: string[]) =>
          arr.every((f) => f === 'pdf' || f === 'epub' || f === 'docx'),
        message: 'formats may only contain pdf, epub, or docx',
      },
    },
    enableNarration: { type: Boolean, required: true, default: false },
    narrationVoiceId: { type: String, required: false, maxlength: 120 },
    enableTranslation: { type: Boolean, required: true, default: false },
    translationLanguages: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator: (arr: string[]) => arr.every((l) => l === 'es' || l === 'fr'),
        message: 'translationLanguages may only contain es or fr',
      },
    },
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
    chapters: { type: [chapterSchema], default: undefined },
    auditIssues: { type: [auditIssueSchema], default: undefined },
    editingChoices: { type: editingChoicesSchema, required: false },
    themeId: {
      type: String,
      required: true,
      enum: BOOK_THEME_IDS,
      default: 'literary-classic',
    },
    production: { type: productionSchema, required: false },
    artifacts: { type: [buildArtifactSchema], default: undefined },
    bundleUrl: { type: String, required: false, maxlength: 500 },
    publishedBundleAt: { type: Date, required: false },
    status: {
      type: String,
      enum: [
        'outline-pending',
        'outline-ready',
        'drafting',
        'editing',
        'formatting',
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
