import mongoose, { Document, Schema } from 'mongoose';

export interface IAppChatWidget extends Document {
  _id: mongoose.Types.ObjectId;
  widgetId: string;
  userId: mongoose.Types.ObjectId;
  projectName: string;
  jwt: string;
  monthlyCostCents: number;
  dailyRequests: number;
  lastUsedAt?: Date;
  usageMonth: string; // YYYY-MM for the current monthly accounting window
  usageDay: string;   // YYYY-MM-DD for the current daily accounting window
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAppChatWidget>(
  {
    widgetId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    projectName: { type: String, required: true, maxlength: 200 },
    jwt: { type: String, required: true },
    monthlyCostCents: { type: Number, default: 0 },
    dailyRequests: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
    usageMonth: { type: String, required: true },
    usageDay: { type: String, required: true },
  },
  { timestamps: true }
);

export const AppChatWidget = mongoose.model<IAppChatWidget>('AppChatWidget', schema);
