import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ContentBlock, Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  handleBrowserExec,
  type BrowserHandlerContext,
} from '../computer/browser-handler';
import { browserTool } from '../computer/tool-schemas';
import type { ComputerSSEWriter } from '../computer/sse-writer';
import type { E2BClientConfig } from '../computer/e2b-client';
import type { ResearchBrief, ResearchSource } from './research-brief.types';

const MAX_ACTIONS = 12;
const MAX_DURATION_MS = 90_000;
const MAX_ITERATIONS = 8;

const briefTool: Tool = {
  name: 'emit_research_brief',
  description:
    'Record your final research brief. Call this exactly once when you have gathered enough sources to summarize the topic. Do not call other tools after this.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: 'A 2-4 sentence synthesis of the findings.',
      },
      keyFacts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 20 bullet-sized factual statements pulled from the sources.',
      },
      sources: {
        type: 'array',
        items: {
          type: 'object' as const,
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            snippet: { type: 'string' },
            relevance: { type: 'number' },
          },
          required: ['url', 'title', 'snippet', 'relevance'],
        },
        description: '3-8 sources actually visited. relevance is 0-1.',
      },
    },
    required: ['summary', 'keyFacts', 'sources'],
  },
};

const RESEARCH_SYSTEM_PROMPT = `You are the Mr8 research agent. You have one tool besides the brief submission: \`browser\`.

Goal: do quick, accurate web research on the topic the user provides, then call \`emit_research_brief\` once.

Process:
1. Start with \`browser\` action=search with a focused query.
2. Follow 2-4 promising links via action=navigate and extract the useful text via action=extract.
3. Close the browser with action=close once you have what you need.
4. Call \`emit_research_brief\` with 3-8 sources and 10-20 key facts.

Constraints:
- You have at most 12 browser actions or 90 seconds total — whichever comes first. Plan accordingly.
- Prefer primary sources (official sites, documentation) over aggregators.
- Do not open more tabs than you can summarize.
- If the topic is genuinely unknowable from the web (private data, future predictions), return the best partial brief you have and note the limitation in the summary.`;

export interface ResearchContext {
  userId: string;
  sse: ComputerSSEWriter;
  apiKey: string;
  config?: E2BClientConfig;
}

interface BriefInput {
  summary: string;
  keyFacts: string[];
  sources: ResearchSource[];
}

function isBriefInput(input: unknown): input is BriefInput {
  if (typeof input !== 'object' || input === null) return false;
  const r = input as Record<string, unknown>;
  return (
    typeof r.summary === 'string' &&
    Array.isArray(r.keyFacts) &&
    Array.isArray(r.sources)
  );
}

export async function runResearchAgent(
  query: string,
  ctx: ResearchContext
): Promise<ResearchBrief> {
  const client = new Anthropic({ apiKey: ctx.apiKey });
  const start = Date.now();
  let browserActions = 0;
  let cappedAt: 'actions' | 'time' | undefined;
  let brief: BriefInput | undefined;

  const apiMessages: MessageParam[] = [
    { role: 'user', content: `Research topic: ${query}` },
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
    const elapsed = Date.now() - start;
    if (elapsed > MAX_DURATION_MS) {
      cappedAt = 'time';
      break;
    }
    if (browserActions >= MAX_ACTIONS) {
      cappedAt = 'actions';
      break;
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: RESEARCH_SYSTEM_PROMPT,
      tools: [browserTool, briefTool],
      messages: apiMessages,
    });

    const toolBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_use' }> => block.type === 'tool_use'
    );
    const textBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text'
    );

    for (const block of textBlocks) {
      if (block.text) ctx.sse.send('text_delta', { text: block.text });
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

    let briefReceived = false;

    for (const toolBlock of toolBlocks) {
      ctx.sse.send('tool_call', {
        toolUseId: toolBlock.id,
        name: toolBlock.name,
        input: toolBlock.input,
      });

      if (toolBlock.name === 'emit_research_brief') {
        if (isBriefInput(toolBlock.input)) {
          brief = toolBlock.input;
          briefReceived = true;
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: 'Brief recorded.',
          });
        } else {
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: 'emit_research_brief requires {summary, keyFacts, sources}.',
            is_error: true,
          });
        }
        continue;
      }

      if (toolBlock.name === 'browser') {
        browserActions += 1;
        if (browserActions > MAX_ACTIONS) {
          cappedAt = 'actions';
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: 'Browser action cap reached. Call emit_research_brief with what you have.',
            is_error: true,
          });
          continue;
        }

        const handlerCtx: BrowserHandlerContext = {
          userId: ctx.userId,
          sse: ctx.sse,
          config: ctx.config,
        };
        const result = await handleBrowserExec(
          toolBlock.input as never,
          handlerCtx
        );
        ctx.sse.send('tool_result', {
          toolUseId: toolBlock.id,
          name: 'browser',
          ok: result.ok,
          summary: result.summary,
        });
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result.summary,
          is_error: !result.ok,
        });
        continue;
      }

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: `Unknown tool: ${toolBlock.name}`,
        is_error: true,
      });
    }

    apiMessages.push({ role: 'assistant', content: response.content });
    apiMessages.push({ role: 'user', content: toolResultBlocks });

    if (briefReceived) break;
  }

  const durationMs = Date.now() - start;
  const finalBrief: ResearchBrief = {
    query,
    summary: brief?.summary ?? `Partial brief for "${query}" — no summary emitted before cap.`,
    keyFacts: brief?.keyFacts ?? [],
    sources: brief?.sources ?? [],
    durationMs,
    cappedAt,
  };
  return finalBrief;
}

export const RESEARCH_CONSTANTS = {
  MAX_ACTIONS,
  MAX_DURATION_MS,
  MAX_ITERATIONS,
};
