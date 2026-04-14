export type SoulArchetype = 'builder' | 'dabbler' | 'professional' | 'hustler' | 'unknown';

export type InteractionMode = 'typer' | 'clicker' | 'mixed';

export type WtpSignalKind =
  | 'plan-accepted'
  | 'plan-rejected'
  | 'feature-accepted'
  | 'feature-rejected'
  | 'spin-won'
  | 'spin-lost'
  | 'powerup-claimed'
  | 'delivery-accepted'
  | 'delivery-rejected';

export interface WtpSignal {
  kind: WtpSignalKind;
  featureTier?: 'polish' | 'brains' | 'power';
  priceCents?: number;
  context?: string;
  createdAt: string;
}

export interface MomentumSnapshot {
  score: number;
  lastEventAt?: string;
  lastEventKind?: string;
}

export interface SoulPreferences {
  designStyle?: string;
  colorPalette?: string;
  frameworks?: string[];
  verbosity?: 'terse' | 'balanced' | 'verbose';
}

export interface SoulProfile {
  userId: string;
  preferences: SoulPreferences;
  wtpSignals: WtpSignal[];
  interactionMode: InteractionMode;
  momentum: MomentumSnapshot;
  conversionTriggers: string[];
  aversions: string[];
  archetype: SoulArchetype;
  updatedAt: string;
}
