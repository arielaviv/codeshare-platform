import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import { platformToolDefinitions, executePlatformTool, type PlatformToolInput } from './platform-tools';
import type { ChatMessage, ChatResponse, ToolUseRecord } from '../types/chat';

const SYSTEM_PROMPT = `You are Mr8 AI, an intelligent assistant for the Mr8 developer learning platform.

Your capabilities:
- Search and discover code snippets shared by the community
- Provide detailed explanations of code in any programming language
- Suggest improvements, best practices, and bug fixes for code
- Find posts by specific users
- Help users learn programming concepts through the platform's content

Guidelines:
- When showing search results, format them as a clear numbered list with title, language, and author
- When explaining code, use markdown formatting with headers and code blocks
- Be encouraging and educational — many users are students learning to code
- If you use a tool and get no results, suggest alternative search terms
- Always reference specific posts by their title when possible
- Keep responses focused and actionable
- Use code blocks with language annotations for any code you write or reference
- When the user shares code for review, be specific about line numbers and improvements`;

export async function chatWithTools(
  messages: ChatMessage[]
): Promise<ChatResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('AI service not configured');
  }

  const client = new Anthropic({ apiKey });
  const toolsUsed: ToolUseRecord[] = [];

  const apiMessages: MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: platformToolDefinitions,
    messages: apiMessages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use'
    );

    const toolResults: { type: 'tool_result'; tool_use_id: string; content: string }[] = [];

    for (const toolBlock of toolBlocks) {
      toolsUsed.push({
        name: toolBlock.name,
        input: toolBlock.input as Record<string, unknown>,
      });

      const result = await executePlatformTool(toolBlock.name, toolBlock.input as PlatformToolInput);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    apiMessages.push({ role: 'assistant', content: response.content });
    apiMessages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: platformToolDefinitions,
      messages: apiMessages,
    });
  }

  const textBlock = response.content.find(
    (block): block is Extract<ContentBlock, { type: 'text' }> =>
      block.type === 'text'
  );

  return {
    message: textBlock?.text || 'No response generated.',
    toolsUsed,
  };
}
