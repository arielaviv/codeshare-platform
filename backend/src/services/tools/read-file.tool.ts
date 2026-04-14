import type { AgentTool, ToolContext } from './types';

interface ReadFileInput {
  path: string;
}

export const readFileTool: AgentTool = {
  definition: {
    name: 'read_file',
    description: 'Read the content of a file in the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path to read' },
      },
      required: ['path'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { path } = input as ReadFileInput;
    const content = ctx.workspace.get(path);
    if (content === undefined) return `File not found: ${path}`;
    return content;
  },
};
