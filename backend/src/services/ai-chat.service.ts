import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import { Post } from '../models/Post';
import { User } from '../models/User';
import type { ChatMessage, ChatResponse, ToolUseRecord } from '../types/chat';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are CodeShare AI, an intelligent assistant for the CodeShare developer learning platform.

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

const tools: Tool[] = [
  {
    name: 'search_posts',
    description:
      'Search code posts by keyword. Matches against title, code, description, and language fields.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search term (matches title, code, description)',
        },
        language: {
          type: 'string',
          description: 'Filter by programming language (e.g. python, javascript)',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_post_details',
    description: 'Fetch full details of a specific post by its ID, including code and author info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postId: {
          type: 'string',
          description: 'The MongoDB ObjectId of the post',
        },
      },
      required: ['postId'],
    },
  },
  {
    name: 'explain_code',
    description: 'Get a beginner-friendly explanation of a post\'s code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postId: {
          type: 'string',
          description: 'The post ID whose code to explain',
        },
      },
      required: ['postId'],
    },
  },
  {
    name: 'suggest_improvements',
    description: 'Review a post\'s code and suggest improvements, best practices, or fixes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postId: {
          type: 'string',
          description: 'The post ID whose code to review',
        },
      },
      required: ['postId'],
    },
  },
  {
    name: 'find_user_posts',
    description: 'Find all posts by a specific username.',
    input_schema: {
      type: 'object' as const,
      properties: {
        username: {
          type: 'string',
          description: 'The username to search for',
        },
      },
      required: ['username'],
    },
  },
];

interface SearchPostsInput {
  query: string;
  language?: string;
  limit?: number;
}

interface PostIdInput {
  postId: string;
}

interface UsernameInput {
  username: string;
}

type ToolInput = SearchPostsInput | PostIdInput | UsernameInput;

async function executeTool(
  name: string,
  input: ToolInput
): Promise<string> {
  switch (name) {
    case 'search_posts': {
      const { query, language, limit = 5 } = input as SearchPostsInput;
      const filter: Record<string, unknown> = {
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { code: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ],
      };
      if (language) {
        filter.language = language.toLowerCase();
      }
      const posts = await Post.find(filter)
        .populate('userId', 'username')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      if (posts.length === 0) {
        return JSON.stringify({ results: [], message: 'No posts found' });
      }

      const results = posts.map((p) => ({
        id: p._id,
        title: p.title,
        language: p.language,
        author: (p.userId as { username?: string })?.username || 'Unknown',
        description: p.description?.slice(0, 100) || '',
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
      }));

      return JSON.stringify({ results, total: results.length });
    }

    case 'get_post_details': {
      const { postId } = input as PostIdInput;
      const post = await Post.findById(postId)
        .populate('userId', 'username profileImage')
        .lean();

      if (!post) {
        return JSON.stringify({ error: 'Post not found' });
      }

      return JSON.stringify({
        id: post._id,
        title: post.title,
        code: post.code,
        language: post.language,
        description: post.description,
        author: (post.userId as { username?: string })?.username || 'Unknown',
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        createdAt: post.createdAt,
      });
    }

    case 'explain_code': {
      const { postId } = input as PostIdInput;
      const post = await Post.findById(postId).lean();
      if (!post) {
        return JSON.stringify({ error: 'Post not found' });
      }

      return JSON.stringify({
        title: post.title,
        language: post.language,
        code: post.code,
        instruction: 'Explain this code in a clear, beginner-friendly way. Cover what it does, key concepts, and potential improvements.',
      });
    }

    case 'suggest_improvements': {
      const { postId } = input as PostIdInput;
      const post = await Post.findById(postId).lean();
      if (!post) {
        return JSON.stringify({ error: 'Post not found' });
      }

      return JSON.stringify({
        title: post.title,
        language: post.language,
        code: post.code,
        instruction: 'Review this code. Suggest improvements for readability, performance, best practices, and potential bugs.',
      });
    }

    case 'find_user_posts': {
      const { username } = input as UsernameInput;
      const user = await User.findOne({
        username: { $regex: `^${username}$`, $options: 'i' },
      });

      if (!user) {
        return JSON.stringify({ error: `User "${username}" not found` });
      }

      const posts = await Post.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      const results = posts.map((p) => ({
        id: p._id,
        title: p.title,
        language: p.language,
        description: p.description?.slice(0, 100) || '',
        likesCount: p.likesCount,
      }));

      return JSON.stringify({ username: user.username, results, total: results.length });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function chatWithTools(
  messages: ChatMessage[]
): Promise<ChatResponse> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('AI service not configured');
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const toolsUsed: ToolUseRecord[] = [];

  const apiMessages: MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response = await client.messages.create({
    model: 'claude-haiku-4-20250414',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools,
    messages: apiMessages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use'
    );

    const toolResults: {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
    }[] = [];

    for (const toolBlock of toolBlocks) {
      toolsUsed.push({
        name: toolBlock.name,
        input: toolBlock.input as Record<string, unknown>,
      });

      const result = await executeTool(toolBlock.name, toolBlock.input as ToolInput);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    apiMessages.push({ role: 'assistant', content: response.content });
    apiMessages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-haiku-4-20250414',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools,
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
