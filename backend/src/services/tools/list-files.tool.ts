import type { AgentTool, ToolContext } from './types';

export const listFilesTool: AgentTool = {
  definition: {
    name: 'list_files',
    description: 'List all files currently in the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async execute(_input: unknown, ctx: ToolContext): Promise<string> {
    const files = Array.from(ctx.workspace.keys());
    if (files.length === 0) return 'Workspace is empty';
    return files.join('\n');
  },
};
