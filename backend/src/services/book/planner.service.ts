import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { UsageEvent } from '../../models/UsageEvent';

/**
 * Book Planner — the agentic meta-step that runs BEFORE outline generation.
 *
 * Reads the user's book prompt, classifies it, and decides what Mr8 should
 * deliver first. Four strategies; detection rules live in the system prompt.
 *
 *   ask                 → prompt too vague; return 2–3 clarifying questions
 *   outline-first       → nuanced voice cues; steer early before cover budget
 *   outline-plus-cover  → default for specific prompts; 2-beat flow
 *   full-drop           → fully specified; all three artifacts in one drop
 *
 * The frontend renders Mr8's chosen strategy as a chat card with inline CTA
 * buttons. User can always override to outline-first.
 *
 * Haiku, ~300 input tokens + ~150 output tokens, sub-2-second latency.
 */

export type BookPlanStrategy = 'ask' | 'outline-first' | 'outline-plus-cover' | 'full-drop';

export interface BookPlanResult {
  strategy: BookPlanStrategy;
  /** One-line rationale Mr8 shows in chat. ≤20 words. */
  rationale: string;
  /** Populated only when strategy='ask'. 2–3 concise questions. */
  questions?: string[];
}

const PLANNER_MODEL = 'claude-haiku-4-5-20251001';

const planBookTool: Tool = {
  name: 'plan_book',
  description:
    'Classify the opening strategy for a book generation. Always call this tool; never return plain text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      strategy: {
        type: 'string',
        enum: ['ask', 'outline-first', 'outline-plus-cover', 'full-drop'],
        description:
          "'ask' = prompt too vague, must ask 2–3 questions first. 'outline-first' = nuanced style/voice cues, pause after outline. 'outline-plus-cover' = default for specific prompts. 'full-drop' = fully specified (length+genre+tone+hook all present), deliver outline+covers+ch1 together.",
      },
      rationale: {
        type: 'string',
        description: 'One short sentence (≤20 words) Mr8 shows the user.',
      },
      questions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Required ONLY when strategy="ask". 2–3 very short questions (≤8 words each). e.g. "What genre?", "How long (pages or words)?", "Who is this for?"',
      },
    },
    required: ['strategy', 'rationale'],
  },
};

const PLANNER_SYSTEM_PROMPT = `You are the Mr8 Book Planner. Given a user's book prompt, pick the best OPENING STRATEGY — the first thing Mr8 delivers.

Always call the plan_book tool. Return JSON-shaped output only.

PICK RULES (in priority order):

1. "ask" — when the prompt is missing TWO OR MORE of {genre, length, subject} OR is too vague to act. Example: "write me a book". Populate 2–3 short clarifying questions.

2. "outline-first" — when the prompt contains nuanced STYLE or VOICE mimicry cues. Any of these triggers it:
   - "in the style of <author>"
   - "like <specific author>"
   - "sparse / minimal / maximal / lyrical / ornate prose"
   - Nuanced literary tone descriptors ("quiet", "introspective", "Robinson-esque")
   Rationale: voice nuance needs early user steering; don't burn cover budget.

3. "full-drop" — ALL of these are present:
   - Concrete length (word count, page count, or clear short-form signal like "novella", "picture book")
   - Concrete genre
   - Clear hook or inciting incident
   - Tone indicator
   Rationale: the brief is vivid enough to demo the whole first-act in one drop.

4. "outline-plus-cover" — DEFAULT for everything else. Specific prompts without style mimicry, without one of the {length, genre, hook, tone} signals missing — default to this. Two-beat flow: outline approval before covers.

RATIONALE TONE: friendly, direct, Mr8's voice. Examples:
- "This brief is vivid enough — I'll outline, design covers, and draft chapter 1 so you can feel it. ~2 minutes."
- "Voice cues here need your eye early — outline first, then covers after you approve."
- "Couple quick questions first so I don't drift."
- "Clear enough to start; outline in 30 seconds, then we'll pick a cover."`;

export async function planBook(
  prompt: string,
  userId?: mongoose.Types.ObjectId
): Promise<BookPlanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 400,
    system: PLANNER_SYSTEM_PROMPT,
    tools: [planBookTool],
    tool_choice: { type: 'tool', name: 'plan_book' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'plan_book') {
    // Defensive fallback — treat as the default strategy with an apologetic rationale.
    return {
      strategy: 'outline-plus-cover',
      rationale: "I'll draft an outline, then we'll design covers after you approve.",
    };
  }

  const input = toolUse.input as {
    strategy?: string;
    rationale?: string;
    questions?: string[];
  };

  const strategy: BookPlanStrategy =
    input.strategy === 'ask' ||
    input.strategy === 'outline-first' ||
    input.strategy === 'outline-plus-cover' ||
    input.strategy === 'full-drop'
      ? input.strategy
      : 'outline-plus-cover';

  const rationale =
    typeof input.rationale === 'string' && input.rationale.trim().length > 0
      ? input.rationale.trim().slice(0, 240)
      : "I'll draft an outline first.";

  const questions =
    strategy === 'ask' && Array.isArray(input.questions)
      ? input.questions
          .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
          .slice(0, 3)
          .map((q) => q.trim())
      : undefined;

  // Best-effort usage tracking.
  if (userId) {
    try {
      await UsageEvent.create({
        userId,
        feature: 'book-plan',
        modelName: PLANNER_MODEL,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch {
      // ignore
    }
  }

  return {
    strategy,
    rationale,
    questions,
  };
}
