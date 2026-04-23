import mongoose, { Document, Schema } from 'mongoose';

/**
 * Gartner-level spreadsheet schema.
 *
 * Each cell carries its displayed value AND an optional formula; the viewer
 * renders the computed `value` while `formula` gets written back into the
 * Excel export so cells stay live when opened in Excel / Sheets.
 *
 * A `role` tag (header / section / label / data / subtotal / total) drives
 * typography + banding in the viewer. A `format` tag picks the number format
 * (currency / percent / integer / number / text) — the model is asked to
 * render values already formatted so the viewer never guesses.
 */
export type CellRole = 'header' | 'section' | 'label' | 'data' | 'subtotal' | 'total' | 'blank';
export type CellFormat = 'text' | 'number' | 'integer' | 'currency' | 'percent';

export interface ICell {
  value: string;
  formula?: string;
  role?: CellRole;
  format?: CellFormat;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export type SheetPalette = 'gartner-blue' | 'gartner-warm' | 'light' | 'dark' | 'emerald' | 'slate';

export interface ISheetTheme {
  palette: SheetPalette;
  accentColor: string;
  /** Optional explicit override colors; if absent the palette supplies them. */
  headerBg?: string;
  headerFg?: string;
  sectionBg?: string;
  sectionFg?: string;
  subtotalBg?: string;
  totalBg?: string;
  zebra?: boolean;
}

export interface ISheet {
  name: string;
  /** Preferred shape. 2D grid of cells; cells[row][col]. */
  cells?: ICell[][];
  /** Legacy shape — kept so old documents keep rendering. */
  rows?: string[][];
  columnWidths?: number[];
  /** Number of top rows to treat as sticky / frozen. Default 1. */
  frozenRows?: number;
  frozenCols?: number;
  theme?: ISheetTheme;
}

export interface ISpreadsheetFile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  sheets: ISheet[];
  /** Top-level theme applied to any sheet that doesn't declare its own. */
  theme?: ISheetTheme;
  sourcePrompt?: string;
  /** Public URL to the openpyxl-built, fully-styled .xlsx (served from /uploads). */
  xlsxUrl?: string;
  /** E2B sandbox id where this workbook was built; kept so we can re-open it. */
  sandboxId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cellSubSchema = new Schema<ICell>(
  {
    value: { type: String, required: true, default: '' },
    formula: { type: String },
    role: {
      type: String,
      enum: ['header', 'section', 'label', 'data', 'subtotal', 'total', 'blank'],
    },
    format: {
      type: String,
      enum: ['text', 'number', 'integer', 'currency', 'percent'],
    },
    bold: { type: Boolean },
    align: { type: String, enum: ['left', 'center', 'right'] },
  },
  { _id: false }
);

const themeSubSchema = new Schema<ISheetTheme>(
  {
    palette: {
      type: String,
      enum: ['gartner-blue', 'gartner-warm', 'light', 'dark', 'emerald', 'slate'],
      default: 'gartner-blue',
    },
    accentColor: { type: String, default: '#002060' },
    headerBg: { type: String },
    headerFg: { type: String },
    sectionBg: { type: String },
    sectionFg: { type: String },
    subtotalBg: { type: String },
    totalBg: { type: String },
    zebra: { type: Boolean },
  },
  { _id: false }
);

const sheetSubSchema = new Schema<ISheet>(
  {
    name: { type: String, required: true, maxlength: 80 },
    cells: { type: [[cellSubSchema]], default: undefined },
    rows: { type: [[String]], default: undefined },
    columnWidths: { type: [Number], default: undefined },
    frozenRows: { type: Number, default: 1 },
    frozenCols: { type: Number, default: 1 },
    theme: { type: themeSubSchema, default: undefined },
  },
  { _id: false }
);

const spreadsheetSchema = new Schema<ISpreadsheetFile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    sheets: { type: [sheetSubSchema], default: [] },
    theme: { type: themeSubSchema, default: undefined },
    sourcePrompt: { type: String, maxlength: 5000 },
    xlsxUrl: { type: String, maxlength: 500 },
    sandboxId: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);

spreadsheetSchema.index({ userId: 1, updatedAt: -1 });

export const SpreadsheetFile = mongoose.model<ISpreadsheetFile>(
  'SpreadsheetFile',
  spreadsheetSchema
);
