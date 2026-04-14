import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { UsageEvent } from '../models/UsageEvent';
import type {
  BlueprintPhase,
  BlueprintSpec,
  Complexity,
  FeatureTier,
  ModelTier,
  PricingEstimate,
} from '../types/blueprint';

export interface ScopePlanResult {
  plan: BlueprintSpec;
  pricing: PricingEstimate;
}

const SCOPING_MODEL = 'claude-haiku-4-5-20251001';

interface ScopeToolInput {
  title: string;
  summary: string;
  tier: FeatureTier;
  complexity: Complexity;
  archetype?: string;
  phases: { name: string; steps: string[] }[];
  features_included: string[];
}

const scopeTool: Tool = {
  name: 'scope_plan',
  description:
    'Record the scoped build plan for a Mr8 agentic-pricing quote. Breaks the user request into phases/steps and classifies it into a complexity tier.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short human-readable plan title (2–6 words).' },
      summary: { type: 'string', description: 'One-sentence summary of what will be built.' },
      tier: {
        type: 'string',
        enum: ['polish', 'brains', 'power'],
        description:
          "'polish' = UI skin, small CSS/content tweak. 'brains' = single logical feature with data/logic (DB, validation, form, search). 'power' = multi-feature integration (auth, Stripe, multi-page app, external API).",
      },
      complexity: {
        type: 'string',
        enum: ['atomic', 'multi-component', 'novel'],
        description:
          "'atomic' = single file/component. 'multi-component' = several files coordinated. 'novel' = unfamiliar domain or requires research.",
      },
      archetype: {
        type: 'string',
        description:
          'Optional app archetype hint (e.g. todo, crm, portfolio, shop, landing, dashboard). Used by future discovery upsell to pick relevant features.',
      },
      phases: {
        type: 'array',
        description: '1–3 phases. Each phase has a name and 1–5 concrete step descriptions.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            steps: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['name', 'steps'],
        },
      },
      features_included: {
        type: 'array',
        description:
          'Concrete user-facing features this plan delivers (e.g. ["live search", "dark mode", "CSV export"]).',
        items: { type: 'string' },
      },
    },
    required: ['title', 'summary', 'tier', 'complexity', 'phases', 'features_included'],
  },
};

const SCOPING_SYSTEM_PROMPT = `You scope Mr8 build requests into a structured plan for agentic pricing.

Always call the scope_plan tool.

TIER RULES (decides the price bucket):
- polish: UI-only change, one file, no new logic. Examples: "add dark mode", "change the button color", "make the hero text bigger".
- brains: single coherent feature involving state, data, or non-trivial logic. Examples: "add a search bar that filters the list", "store the notes in local storage", "add email validation to the form".
- power: multi-feature or integration work. Examples: "add login with Google + protected routes", "integrate Stripe checkout", "build a 5-page dashboard with charts + CSV export".

COMPLEXITY RULES:
- atomic: one file or one component.
- multi-component: 2–6 files coordinated (e.g. a feature spread across a context, a hook, and 2 components).
- novel: unfamiliar domain, requires research, or involves something tricky the model is unsure about.

PHASES RULES:
- 1 phase for polish.
- 1–2 phases for brains.
- 2–3 phases for power.
- Each phase has 1–5 terse step descriptions, imperative voice ("Add login form", "Wire state", etc.).

Be honest about complexity. Do not inflate tier to charge more. The pricing engine depends on accurate classification.`;

const TIER_CONFIG: Record<
  FeatureTier,
  {
    anchorCents: number;
    baseDealerCents: number;
    dealerRangeCents: number;
    modelTier: ModelTier;
    estimatedTurns: number;
    estInputTokens: number;
    estOutputTokens: number;
  }
> = {
  polish: {
    anchorCents: 499,
    baseDealerCents: 9,
    dealerRangeCents: 10,
    modelTier: 'haiku',
    estimatedTurns: 2,
    estInputTokens: 1200,
    estOutputTokens: 600,
  },
  brains: {
    anchorCents: 1999,
    baseDealerCents: 29,
    dealerRangeCents: 50,
    modelTier: 'sonnet',
    estimatedTurns: 3,
    estInputTokens: 8000,
    estOutputTokens: 3000,
  },
  power: {
    anchorCents: 4900,
    baseDealerCents: 99,
    dealerRangeCents: 100,
    modelTier: 'sonnet',
    estimatedTurns: 6,
    estInputTokens: 30000,
    estOutputTokens: 12000,
  },
};

function pricingForTier(tier: FeatureTier, complexity: Complexity): PricingEstimate {
  const cfg = TIER_CONFIG[tier];
  const complexityBoost = complexity === 'atomic' ? 0 : complexity === 'multi-component' ? 0.5 : 1;
  const dealerCents = cfg.baseDealerCents + Math.round(cfg.dealerRangeCents * complexityBoost);
  const riskPremiumCents = tier === 'power' ? 30 : tier === 'brains' ? 10 : 0;
  const revisionBudgetCents = Math.round(dealerCents * 0.15);

  return {
    anchorCents: cfg.anchorCents,
    dealerCents,
    tier,
    modelTier: cfg.modelTier,
    estimatedInputTokens: cfg.estInputTokens,
    estimatedOutputTokens: cfg.estOutputTokens,
    estimatedTurns: cfg.estimatedTurns,
    complexity,
    riskPremiumCents,
    revisionBudgetCents,
  };
}

function makePlanId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePhases(raw: ScopeToolInput['phases']): BlueprintPhase[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ name: 'Build', steps: [{ description: 'Generate files' }] }];
  }
  return raw.slice(0, 3).map((phase) => ({
    name: typeof phase.name === 'string' && phase.name.trim() ? phase.name : 'Build',
    steps: Array.isArray(phase.steps)
      ? phase.steps
          .slice(0, 5)
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((description) => ({ description }))
      : [{ description: 'Generate files' }],
  }));
}

export async function scopePlan(
  userPrompt: string,
  userId?: mongoose.Types.ObjectId,
): Promise<ScopePlanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('AI service not configured');
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: SCOPING_MODEL,
    max_tokens: 600,
    system: SCOPING_SYSTEM_PROMPT,
    tools: [scopeTool],
    tool_choice: { type: 'tool', name: 'scope_plan' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'scope_plan') {
    const fallback = pricingForTier('brains', 'multi-component');
    return {
      plan: {
        id: makePlanId(),
        title: 'Build',
        summary: 'Implement the requested feature.',
        phases: [{ name: 'Build', steps: [{ description: 'Generate files' }] }],
        featuresIncluded: [],
      },
      pricing: fallback,
    };
  }

  const input = toolUse.input as ScopeToolInput;
  const tier: FeatureTier = ['polish', 'brains', 'power'].includes(input.tier)
    ? input.tier
    : 'brains';
  const complexity: Complexity = ['atomic', 'multi-component', 'novel'].includes(input.complexity)
    ? input.complexity
    : 'multi-component';

  const pricing = pricingForTier(tier, complexity);
  const plan: BlueprintSpec = {
    id: makePlanId(),
    title: typeof input.title === 'string' && input.title.trim() ? input.title.slice(0, 80) : 'Build',
    summary:
      typeof input.summary === 'string' && input.summary.trim()
        ? input.summary.slice(0, 300)
        : 'Implement the requested feature.',
    archetype:
      typeof input.archetype === 'string' && input.archetype.trim()
        ? input.archetype.trim().slice(0, 40)
        : undefined,
    phases: sanitizePhases(input.phases),
    featuresIncluded: Array.isArray(input.features_included)
      ? input.features_included
          .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
          .map((f) => f.slice(0, 80))
          .slice(0, 10)
      : [],
  };

  if (userId) {
    const usage = response.usage;
    try {
      await UsageEvent.create({
        userId,
        feature: 'plan-proposal',
        modelName: SCOPING_MODEL,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        blueprint: plan,
        deliveryStatus: 'scoped',
      });
    } catch {
      // Usage tracking is best-effort
    }
  }

  return { plan, pricing };
}

export const __test__ = { pricingForTier, TIER_CONFIG, sanitizePhases };
