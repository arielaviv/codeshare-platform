import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { UsageEvent } from '../models/UsageEvent';

export type UserIntent = 'deck' | 'code-app' | 'code-explain' | 'computer' | 'book';

export interface ClassifyResult {
  intent: UserIntent;
  confidence: number;
  needsResearch: boolean;
  researchQuery?: string;
}

const INTENT_MODEL = 'claude-haiku-4-5-20251001';

const classifyTool: Tool = {
  name: 'record_intent',
  description: 'Record the classified intent of the user prompt, and whether web research would improve accuracy before generation.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string',
        enum: ['deck', 'code-app', 'code-explain', 'computer', 'book'],
        description:
          "'deck' = slide deck/presentation. 'code-app' = application built (HTML/React/etc). 'code-explain' = existing code explained. 'computer' = user explicitly wants browser + Python sandbox automation (e.g. 'browse the web for…', 'scrape this page', 'run python to…'). 'book' = user wants a full book/novel/novella/non-fiction manuscript drafted (e.g. 'write a book about X', 'draft a short novel', 'write me a 30-page guide to Y').",
      },
      confidence: {
        type: 'number',
        description: 'Confidence score 0–1.',
      },
      needs_research: {
        type: 'boolean',
        description: 'True if the topic would benefit from web research BEFORE generation to ground facts. See system prompt for rules.',
      },
      research_query: {
        type: 'string',
        description: 'Required when needs_research is true — a concise 5-15 word web search query for the research agent.',
      },
    },
    required: ['intent', 'confidence', 'needs_research'],
  },
};

const SYSTEM_PROMPT = `You classify user prompts into one of five intents for the Mr8 platform:

- "deck"          → user wants a slide deck / presentation / pitch / report
- "code-app"      → user wants an app / website / component built
- "code-explain"  → user wants existing code explained or analyzed
- "computer"      → user explicitly wants to use a browser + Python sandbox (e.g. "browse the web for…", "scrape this site", "run python to…", "open this URL and click X")
- "book"          → user wants a multi-chapter book / novel / novella / non-fiction manuscript drafted. Signals: "write a book", "draft a novel", "write me a novella about", "a children's book about", "a non-fiction guide to", "a 30-page book on", explicit chapter/word-count asks for prose that is clearly a book rather than a single article or deck.

Always call the record_intent tool. If ambiguous, default to the most useful interpretation and report lower confidence.

You ALSO decide whether the topic would benefit from web research BEFORE generation.

needs_research = true when:
- Topic concerns recent events, schedules, or data likely outside model training cutoff
- User asks about real companies, products, people, prices, statistics, market data
- Accuracy would suffer without fresh facts
- User did NOT paste the data, code, or a detailed outline themselves

needs_research = false when:
- User pasted the data themselves (tables, lists, code, outline)
- Topic is purely creative or template-like (e.g. "design a product launch deck structure", "make me a tic-tac-toe game")
- User explicitly said "don't search" or "use only what I gave you"
- Prompt is about the user's own content (their codebase, their post, their data)

If needs_research is true, also set research_query to a concise 5-15 word web query focused on what facts would ground the output.

Intent "computer" implies needs_research is irrelevant (the agent will browse itself) — still set needs_research to false for this intent.`;

export async function classifyIntent(
  prompt: string,
  userId?: mongoose.Types.ObjectId
): Promise<ClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('AI service not configured');
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: INTENT_MODEL,
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    tools: [classifyTool],
    tool_choice: { type: 'tool', name: 'record_intent' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'record_intent') {
    // Defensive fallback: treat as code-app with low confidence
    return { intent: 'code-app', confidence: 0.3, needsResearch: false };
  }

  const input = toolUse.input as {
    intent: UserIntent;
    confidence: number;
    needs_research?: boolean;
    research_query?: string;
  };

  if (userId) {
    const usage = response.usage;
    try {
      await UsageEvent.create({
        userId,
        feature: 'intent-classify',
        modelName: INTENT_MODEL,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
      });
    } catch {
      // Usage tracking is best-effort; don't fail the classify call
    }
  }

  const needsResearch = Boolean(input.needs_research) && input.intent !== 'computer';
  const researchQuery =
    needsResearch && typeof input.research_query === 'string' && input.research_query.trim().length > 0
      ? input.research_query.trim()
      : undefined;

  return {
    intent: input.intent,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    needsResearch,
    researchQuery,
  };
}
