import type {
  BlueprintSpec,
  PricingEstimate,
  DeliveryStatus,
  FeatureTier,
  FeatureUpsell,
  PermissionMode,
  TierWeights,
} from './blueprint';
import type { SoulArchetype } from './soul';

export type AgentSSEEventName =
  | 'text_delta'
  | 'file_write'
  | 'file_delete'
  | 'tool_call'
  | 'tool_result'
  | 'prize_awarded'
  | 'error'
  | 'done'
  | 'plan_proposed'
  | 'plan_accepted'
  | 'plan_rejected'
  | 'price_quoted'
  | 'delivery_status'
  | 'slot_spin_triggered'
  | 'powerup_gifted'
  | 'feature_proposed'
  | 'profile_updated';

export interface TextDeltaEvent {
  content: string;
}

export interface FileWriteEvent {
  path: string;
  content: string;
}

export interface FileDeleteEvent {
  path: string;
}

export interface ToolCallEvent {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  name: string;
  preview: string;
}

export interface PrizeAwardedEvent {
  amountCents: number;
  newBalanceCents: number;
  reason: string;
}

export interface ErrorEvent {
  message: string;
}

export interface DoneEvent {
  filesModified: string[];
}

export interface PlanProposedEvent {
  planId: string;
  plan: BlueprintSpec;
  pricing?: PricingEstimate;
}

export interface PlanAcceptedEvent {
  planId: string;
  mode: PermissionMode;
  clearContext?: boolean;
}

export interface PlanRejectedEvent {
  planId: string;
  reason?: string;
}

export interface PriceQuotedEvent {
  pricing: PricingEstimate;
}

export interface DeliveryStatusEvent {
  planId: string;
  status: DeliveryStatus;
  attempt: number;
  reason?: string;
}

export interface SlotSpinTriggeredEvent {
  reason: string;
  tierWeights: TierWeights;
}

export interface PowerupGiftedEvent {
  tier: FeatureTier;
  reason: string;
  featureName: string;
}

export interface FeatureProposedEvent {
  feature: FeatureUpsell;
}

export interface ProfileUpdatedEvent {
  archetype?: SoulArchetype;
  momentumDelta?: number;
}

export interface AgentSSEEventMap {
  text_delta: TextDeltaEvent;
  file_write: FileWriteEvent;
  file_delete: FileDeleteEvent;
  tool_call: ToolCallEvent;
  tool_result: ToolResultEvent;
  prize_awarded: PrizeAwardedEvent;
  error: ErrorEvent;
  done: DoneEvent;
  plan_proposed: PlanProposedEvent;
  plan_accepted: PlanAcceptedEvent;
  plan_rejected: PlanRejectedEvent;
  price_quoted: PriceQuotedEvent;
  delivery_status: DeliveryStatusEvent;
  slot_spin_triggered: SlotSpinTriggeredEvent;
  powerup_gifted: PowerupGiftedEvent;
  feature_proposed: FeatureProposedEvent;
  profile_updated: ProfileUpdatedEvent;
}
