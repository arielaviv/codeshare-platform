import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type mongoose from 'mongoose';
import type { SSEWriter } from '../code-agent.types';

export interface ToolContext {
  workspace: Map<string, string>;
  writer: SSEWriter;
  userId: mongoose.Types.ObjectId | null;
  filesModified: Set<string>;
}

export interface AgentTool {
  definition: Tool;
  execute(input: unknown, ctx: ToolContext): Promise<string>;
}
