import mongoose, { Document, Schema } from 'mongoose';
import type {
  InteractionMode,
  MomentumSnapshot,
  SoulArchetype,
  SoulPreferences,
  WtpSignal,
  WtpSignalKind,
} from '../types/soul';

export interface ISoulProfile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  preferences: SoulPreferences;
  wtpSignals: WtpSignal[];
  interactionMode: InteractionMode;
  momentum: MomentumSnapshot;
  conversionTriggers: string[];
  aversions: string[];
  archetype: SoulArchetype;
  // --- Phase 6 Personalization fields (user-editable) ---
  nickname?: string;
  occupation?: string;
  aboutYou?: string;
  customInstructions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const wtpSignalKinds: WtpSignalKind[] = [
  'plan-accepted',
  'plan-rejected',
  'feature-accepted',
  'feature-rejected',
  'spin-won',
  'spin-lost',
  'powerup-claimed',
  'delivery-accepted',
  'delivery-rejected',
];

const interactionModes: InteractionMode[] = ['typer', 'clicker', 'mixed'];

const archetypes: SoulArchetype[] = [
  'builder',
  'dabbler',
  'professional',
  'hustler',
  'unknown',
];

const wtpSignalSchema = new Schema<WtpSignal>(
  {
    kind: { type: String, enum: wtpSignalKinds, required: true },
    featureTier: { type: String, enum: ['polish', 'brains', 'power'] },
    priceCents: { type: Number, min: 0 },
    context: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const preferencesSchema = new Schema<SoulPreferences>(
  {
    designStyle: { type: String },
    colorPalette: { type: String },
    frameworks: { type: [String], default: undefined },
    verbosity: { type: String, enum: ['terse', 'balanced', 'verbose'] },
    defaultVoiceId: { type: String, maxlength: 60 },
    defaultVoiceName: { type: String, maxlength: 60 },
  },
  { _id: false }
);

const momentumSchema = new Schema<MomentumSnapshot>(
  {
    score: { type: Number, default: 0 },
    lastEventAt: { type: Date },
    lastEventKind: { type: String },
  },
  { _id: false }
);

const soulProfileSchema = new Schema<ISoulProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    preferences: { type: preferencesSchema, default: () => ({}) },
    wtpSignals: { type: [wtpSignalSchema], default: [] },
    interactionMode: {
      type: String,
      enum: interactionModes,
      default: 'mixed',
    },
    momentum: { type: momentumSchema, default: () => ({ score: 0 }) },
    conversionTriggers: { type: [String], default: [] },
    aversions: { type: [String], default: [] },
    archetype: {
      type: String,
      enum: archetypes,
      default: 'unknown',
    },
    nickname: { type: String, maxlength: 60 },
    occupation: { type: String, maxlength: 80 },
    aboutYou: { type: String, maxlength: 2000 },
    customInstructions: { type: String, maxlength: 3000 },
  },
  { timestamps: true }
);

export const SoulProfile = mongoose.model<ISoulProfile>(
  'SoulProfile',
  soulProfileSchema
);
