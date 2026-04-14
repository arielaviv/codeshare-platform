export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export type FeatureTier = 'polish' | 'brains' | 'power';

export type Complexity = 'atomic' | 'multi-component' | 'novel';

export type PermissionMode = 'auto' | 'ask';

export type DeliveryStatus =
  | 'scoped'
  | 'accepted'
  | 'building'
  | 'verifying'
  | 'verified'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface BlueprintStep {
  id?: string;
  description: string;
}

export interface BlueprintPhase {
  name: string;
  steps: BlueprintStep[];
}

export interface BlueprintSpec {
  id: string;
  title: string;
  summary: string;
  archetype?: string;
  phases: BlueprintPhase[];
  featuresIncluded: string[];
}

export interface PricingEstimate {
  anchorCents: number;
  dealerCents: number;
  tier: FeatureTier;
  modelTier: ModelTier;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTurns: number;
  complexity: Complexity;
  riskPremiumCents: number;
  revisionBudgetCents: number;
}

export interface TierWeights {
  polish: number;
  brains: number;
  power: number;
}

export interface FeatureUpsell {
  id: string;
  name: string;
  description: string;
  tier: FeatureTier;
  archetype: string;
  templateKey?: string;
  anchorCents: number;
  dealerCents: number;
}
