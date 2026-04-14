import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { AnonBuild } from '../models/AnonBuild';
import { User } from '../models/User';
import { ApiError } from '../middleware/error.middleware';
import { WELCOME_BONUS_CENTS } from './welcome-spin.service';

export interface SSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

// Restricted to workspace tools only — no platform tools, no award_prize.
// The whole point of the anon flow is they can SEE work happen, then register
// to claim it — they don't get prizes until they have an account.
const ANON_TOOLS: Tool[] = [
  {
    name: 'write_file',
    description: 'Create or overwrite a file in the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List the files currently in the workspace.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
];

const ANON_MODEL = 'claude-haiku-4-5-20251001';
const ANON_MAX_ITERATIONS = 5;
const ANON_MAX_TOKENS = 1200;

function buildAnonSystemPrompt(): string {
  return `You are Mr8, a teaser version of an AI app builder. The user is trying you out anonymously — they have not registered yet.

Your job: build a TINY, working preview of what the user describes. ONE main file (index.html with inline CSS+JS), maybe a second supporting file. Keep it focused. Don't write a 50-file React project — write a single index.html that runs in a browser tab.

Constraints (hard limits):
- AT MOST 2 files total.
- AT MOST ~600 lines of code total.
- Use vanilla HTML/CSS/JS only — no React, no build tools, no npm.
- Modern, clean visual style. Mobile-friendly.

Tone:
- Be brief in your text response. 2–3 sentences max introducing what you built.
- After files are written, end with "Preview ready. Sign up to extend it into a full app." (as your last sentence — NOT before).

Use the write_file tool to create files. Don't explain each file — just write them.`;
}

interface AnonRunInput {
  prompt: string;
  ip: string;
}

interface AnonRunResult {
  buildId: mongoose.Types.ObjectId;
}

function executeAnonTool(
  name: string,
  input: { path?: string; content?: string },
  workspace: Map<string, string>,
  writer: SSEWriter
): string {
  if (name === 'write_file') {
    const path = input.path || '';
    const content = input.content || '';
    workspace.set(path, content);
    writer.send('file_write', { path, content });
    return `Wrote ${path} (${content.length} chars)`;
  }
  if (name === 'list_files') {
    const list = Array.from(workspace.keys());
    return list.length === 0 ? 'Workspace is empty' : list.join('\n');
  }
  return `Unknown tool: ${name}`;
}

export async function runAnonBuild(
  { prompt, ip }: AnonRunInput,
  writer: SSEWriter
): Promise<AnonRunResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'AI service not configured' });
    writer.end();
    return null;
  }

  const client = new Anthropic({ apiKey });
  const workspace = new Map<string, string>();
  let assistantText = '';

  const apiMessages: MessageParam[] = [
    { role: 'user', content: prompt },
  ];

  let iterations = 0;

  try {
    while (iterations < ANON_MAX_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model: ANON_MODEL,
        max_tokens: ANON_MAX_TOKENS,
        system: buildAnonSystemPrompt(),
        tools: ANON_TOOLS,
        messages: apiMessages,
      });

      const toolBlocks = response.content.filter(
        (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use'
      );
      const textBlocks = response.content.filter(
        (b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text'
      );

      for (const tb of textBlocks) {
        if (tb.text) {
          writer.send('text_delta', { content: tb.text });
          assistantText += tb.text;
        }
      }

      if (response.stop_reason !== 'tool_use' || toolBlocks.length === 0) {
        break;
      }

      const toolResults: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
      }> = [];

      for (const tb of toolBlocks) {
        writer.send('tool_call', { name: tb.name, input: tb.input });
        const result = executeAnonTool(
          tb.name,
          tb.input as { path?: string; content?: string },
          workspace,
          writer
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: result,
        });
      }

      apiMessages.push({ role: 'assistant', content: response.content });
      apiMessages.push({ role: 'user', content: toolResults });
    }

    const build = new AnonBuild({
      prompt,
      files: Object.fromEntries(workspace),
      assistantText,
      ip,
    });
    await build.save();

    writer.send('done', {
      buildId: build._id.toString(),
      filesModified: Array.from(workspace.keys()),
    });
    writer.end();
    return { buildId: build._id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Build failed';
    writer.send('error', { message });
    writer.end();
    return null;
  }
}

export interface AdoptResult {
  prompt: string;
  files: Record<string, string>;
  assistantText: string;
  awardedCents: number;
  newBalanceCents: number;
}

export async function adoptAnonBuild(
  buildId: string,
  userId: mongoose.Types.ObjectId
): Promise<AdoptResult> {
  if (!mongoose.isValidObjectId(buildId)) {
    throw new ApiError('Invalid build id', 400);
  }
  const build = await AnonBuild.findById(buildId);
  if (!build) {
    throw new ApiError('Build not found or expired', 404);
  }
  if (build.claimedByUserId) {
    throw new ApiError('Build already claimed', 409);
  }

  build.claimedByUserId = userId;
  await build.save();

  // Apply the welcome bonus if this user hasn't claimed it yet.
  const user = await User.findById(userId);
  if (!user) throw new ApiError('User not found', 404);

  let awardedCents = 0;
  if (!user.hasClaimedWelcomeBonus) {
    user.hasClaimedWelcomeBonus = true;
    user.creditsCents = (user.creditsCents || 0) + WELCOME_BONUS_CENTS;
    awardedCents = WELCOME_BONUS_CENTS;
    await user.save();
  }

  return {
    prompt: build.prompt,
    files: build.files || {},
    assistantText: build.assistantText,
    awardedCents,
    newBalanceCents: user.creditsCents,
  };
}
