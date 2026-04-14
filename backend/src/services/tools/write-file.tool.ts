import type { AgentTool, ToolContext } from './types';

interface WriteFileInput {
  path: string;
  content?: string;
}

export const writeFileTool: AgentTool = {
  definition: {
    name: 'write_file',
    description: 'Create or overwrite a file in the workspace. Use this to build code files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path (e.g. index.html, style.css, main.js)' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { path, content } = input as WriteFileInput;
    ctx.workspace.set(path, content || '');
    ctx.writer.send('file_write', { path, content });
    ctx.filesModified.add(path);
    return `Wrote ${path} (${(content || '').length} chars)`;
  },
};
