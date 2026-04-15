import mongoose, { Document, Schema } from 'mongoose';

export interface ISheet {
  name: string;
  rows: string[][]; // cells as strings; formulas written "=..." literal
  columnWidths?: number[]; // optional per-column width hint for viewer
}

export interface ISpreadsheetFile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  sheets: ISheet[];
  sourcePrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sheetSubSchema = new Schema<ISheet>(
  {
    name: { type: String, required: true, maxlength: 80 },
    rows: { type: [[String]], default: [] },
    columnWidths: { type: [Number], default: undefined },
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
    sourcePrompt: { type: String, maxlength: 5000 },
  },
  { timestamps: true }
);

spreadsheetSchema.index({ userId: 1, updatedAt: -1 });

export const SpreadsheetFile = mongoose.model<ISpreadsheetFile>(
  'SpreadsheetFile',
  spreadsheetSchema
);
