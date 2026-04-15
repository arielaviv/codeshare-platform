import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { AgentTool, ToolContext } from './types';
import { writeFileTool } from './write-file.tool';
import { readFileTool } from './read-file.tool';
import { listFilesTool } from './list-files.tool';
import { deleteFileTool } from './delete-file.tool';
import { awardPrizeTool } from './award-prize.tool';
import { proposePlanTool } from './propose-plan.tool';
import { proposeGoalTool } from './propose-goal.tool';
import { completeGoalTool } from './complete-goal.tool';
import {
  platformToolDefinitions,
  executePlatformTool,
  type PlatformToolInput,
} from '../platform-tools';

const builtinTools: AgentTool[] = [
  writeFileTool,
  readFileTool,
  listFilesTool,
  deleteFileTool,
  awardPrizeTool,
  proposePlanTool,
  proposeGoalTool,
  completeGoalTool,
];

const builtinByName: Map<string, AgentTool> = new Map(
  builtinTools.map((tool) => [tool.definition.name, tool]),
);

export const allToolDefinitions: Tool[] = [
  ...builtinTools.map((tool) => tool.definition),
  ...platformToolDefinitions,
];

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<string> {
  const builtin = builtinByName.get(name);
  if (builtin) return builtin.execute(input, ctx);
  return executePlatformTool(name, input as PlatformToolInput);
}

export type { AgentTool, ToolContext } from './types';
