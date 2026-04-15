import Anthropic from '@anthropic-ai/sdk';
import { ChatSession } from '../models/ChatSession';
import type { ChatSessionSkill } from '../models/ChatSession';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

const SYSTEM_PROMPT = `You name chat sessions for Mr8.

Given a user's first message, return a 2–7 word title in Title Case, no
punctuation at the end, no quotes. Concrete and specific.

Examples:
- "Build me a todo app" → "Todo App with React"
- "Sales deck for Palantir" → "Palantir B2B Sales Presentation"
- "Logo for a coffee shop" → "Coffee Shop Logo Design"
- "Spreadsheet to track expenses" → "Expense Tracker Spreadsheet"
- "Hi" → "New Chat"
- "What can you design?" → "Design Capabilities Overview"

Reply with ONLY the title — no preamble, no explanation, no markdown.`;

/**
 * Names a session asynchronously using Haiku. Updates the ChatSession in
 * place when the title is ready. Best-effort: failures fall back to a
 * truncated version of the user message.
 */
export async function nameSessionAsync(
  sessionId: string,
  firstUserMessage: string
): Promise<void> {
  try {
    const trimmed = firstUserMessage.trim();
    if (!trimmed || trimmed.length < 2) {
      await ChatSession.findByIdAndUpdate(sessionId, {
        title: 'New Chat',
        titleStatus: 'named',
      });
      return;
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: trimmed }],
    });

    const block = response.content.find((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text');
    let title = (block?.text ?? '').trim();

    // Sanity guards: if Haiku returns garbage, fall back.
    if (!title || title.length > 80 || title.length < 2) {
      title = trimmed.slice(0, 60);
    }
    // Strip surrounding quotes / trailing punctuation.
    title = title.replace(/^["'`]+|["'`]+$/g, '').replace(/[.!?]+$/g, '').trim();

    await ChatSession.findByIdAndUpdate(sessionId, { title, titleStatus: 'named' });
  } catch {
    // Naming is best-effort; on failure the original truncated firstUserMessage
    // already lives in the title field as a fallback.
    await ChatSession.findByIdAndUpdate(sessionId, { titleStatus: 'failed' }).catch(() => null);
  }
}

/** Heuristic: classify a fresh prompt into one of the four skills. */
export function inferSkillFromPrompt(prompt: string): ChatSessionSkill {
  const p = prompt.toLowerCase();
  if (/\b(deck|presentation|pitch|slides?|powerpoint|keynote)\b/.test(p)) return 'slides';
  if (/\b(spreadsheet|sheet|excel|csv|table|budget|tracker|invoice|expenses?)\b/.test(p)) return 'sheet';
  if (/\b(logo|design|illustrat|mockup|hero image|infographic|artwork|graphic|icon)\b/.test(p)) return 'design';
  if (/\b(app|website|page|landing|dashboard|todo|build|component|react)\b/.test(p)) return 'apps';
  return 'unknown';
}
