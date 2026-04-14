import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import { dispatchComputerTool } from './computer/dispatch';
import { computerTools } from './computer/tool-schemas';
import { acquireLock } from './computer/e2b-session-store';
import type { ComputerSSEWriter } from './computer/sse-writer';
import type { E2BClientConfig } from './computer/e2b-client';
import type { ChatMessage } from '../types/chat';

const MAX_ITERATIONS = 25;

export interface ComputerAgentOptions {
  messages: ChatMessage[];
  workspace?: Record<string, string>;
  userId: string;
  model?: string;
  sse: ComputerSSEWriter;
  apiKey: string;
  config?: E2BClientConfig;
}

const ALLOWED_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];

function pickModel(requested?: string): AllowedModel {
  if (requested && (ALLOWED_MODELS as readonly string[]).includes(requested)) {
    return requested as AllowedModel;
  }
  return 'claude-opus-4-6';
}

function buildSystemPrompt(): string {
  return [
    'You are the Mr8 Computer agent.',
    '',
    'You have two tools: `python` (persistent REPL in a Linux sandbox) and `browser` (a real Chromium the user is watching live over WebRTC).',
    '',
    'How to choose:',
    '- Use `browser` for web research, live data lookups, forms, and anything on a real website. Prefer `search` over `navigate` when you do not already have a URL. Only call `close` when you are completely done.',
    '- Use `python` for data transformation, chart generation, document creation (xlsx / pptx / pdf), scraping with httpx/beautifulsoup when a browser is overkill, and any pure computation. State (imports, variables, pandas frames) persists across python calls in the same session.',
    '- You can hand off between the two: scrape a page with `browser`, then parse the extracted text with `python`.',
    '',
    'Be decisive. Do not ask the user what to do next if the task is clear — just act. The user sees every tool call live in a timeline, so narrate briefly between calls and focus on doing the work.',
    '',
    'Cost discipline:',
    '- Each browser action takes ~2s; keep your plan tight.',
    '- Close the browser when the task is complete.',
    '- Hard cap: 25 tool calls per user message. If you hit it without a result, summarize what you learned and stop.',
  ].join('\n');
}

export async function runComputerAgent(options: ComputerAgentOptions): Promise<void> {
  const { messages, workspace = {}, userId, model, sse, apiKey, config } = options;

  const release = await acquireLock(userId);
  const start = Date.now();
  let iterations = 0;

  try {
    const client = new Anthropic({ apiKey });
    const apiMessages: MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    while (iterations < MAX_ITERATIONS) {
      iterations += 1;

      const response = await client.messages.create({
        model: pickModel(model),
        max_tokens: 8192,
        system: buildSystemPrompt(),
        tools: computerTools,
        messages: apiMessages,
      });

      const toolBlocks = response.content.filter(
        (block): block is Extract<ContentBlock, { type: 'tool_use' }> => block.type === 'tool_use'
      );
      const textBlocks = response.content.filter(
        (block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text'
      );

      for (const block of textBlocks) {
        if (block.text) sse.send('text_delta', { text: block.text });
      }

      if (response.stop_reason !== 'tool_use' || toolBlocks.length === 0) {
        break;
      }

      const toolResultBlocks: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];

      for (const toolBlock of toolBlocks) {
        sse.send('tool_call', {
          toolUseId: toolBlock.id,
          name: toolBlock.name,
          input: toolBlock.input,
        });

        const result = await dispatchComputerTool(toolBlock.name, toolBlock.input, {
          userId,
          workspace,
          sse,
          config,
        });

        sse.send('tool_result', {
          toolUseId: toolBlock.id,
          name: toolBlock.name,
          ok: result.ok,
          summary: result.summary,
        });

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result.summary,
          is_error: !result.ok,
        });
      }

      apiMessages.push({ role: 'assistant', content: response.content });
      apiMessages.push({ role: 'user', content: toolResultBlocks });
    }

    sse.send('done', {
      iterations,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sse.send('error', { message });
  } finally {
    sse.end();
    release();
  }
}
