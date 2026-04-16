import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type mongoose from 'mongoose';
import type { SSEWriter } from '../code-agent.types';

export interface ToolContext {
  workspace: Map<string, string>;
  writer: SSEWriter;
  userId: mongoose.Types.ObjectId | null;
  filesModified: Set<string>;
  /** Anthropic tool_use id for the currently-executing call. Used to tag
   *  downstream SSE events (e.g., media_generating → media_ready) so the
   *  frontend can correlate them back to the originating tool_call. */
  toolCallId?: string;
}

export interface AgentTool {
  definition: Tool;
  execute(input: unknown, ctx: ToolContext): Promise<string>;
}
