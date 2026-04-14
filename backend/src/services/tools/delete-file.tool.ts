import type { AgentTool, ToolContext } from './types';

interface DeleteFileInput {
  path: string;
}

export const deleteFileTool: AgentTool = {
  definition: {
    name: 'delete_file',
    description: 'Delete a file from the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path to delete' },
      },
      required: ['path'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { path } = input as DeleteFileInput;
    if (!ctx.workspace.has(path)) return `File not found: ${path}`;
    ctx.workspace.delete(path);
    ctx.writer.send('file_delete', { path });
    ctx.filesModified.add(path);
    return `Deleted ${path}`;
  },
};
