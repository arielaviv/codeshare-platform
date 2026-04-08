import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { Post } from '../models/Post';
import { User } from '../models/User';

export interface SearchPostsInput {
  query: string;
  language?: string;
  limit?: number;
}

export interface PostIdInput {
  postId: string;
}

export interface UsernameInput {
  username: string;
}

export type PlatformToolInput = SearchPostsInput | PostIdInput | UsernameInput;

export const platformToolDefinitions: Tool[] = [
  {
    name: 'search_posts',
    description: 'Search code posts by keyword. Matches against title, code, description, and language.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term' },
        language: { type: 'string', description: 'Filter by language' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_post_details',
    description: 'Fetch full details of a specific post by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postId: { type: 'string', description: 'MongoDB ObjectId of the post' },
      },
      required: ['postId'],
    },
  },
  {
    name: 'explain_code',
    description: "Get a beginner-friendly explanation of a post's code.",
    input_schema: {
      type: 'object' as const,
      properties: {
        postId: { type: 'string', description: 'Post ID to explain' },
      },
      required: ['postId'],
    },
  },
  {
    name: 'suggest_improvements',
    description: "Review a post's code and suggest improvements.",
    input_schema: {
      type: 'object' as const,
      properties: {
        postId: { type: 'string', description: 'Post ID to review' },
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
        username: { type: 'string', description: 'Username to search' },
      },
      required: ['username'],
    },
  },
];

export async function executePlatformTool(name: string, input: PlatformToolInput): Promise<string> {
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
      if (language) filter.language = language.toLowerCase();
      const posts = await Post.find(filter).populate('userId', 'username').sort({ createdAt: -1 }).limit(limit).lean();
      if (posts.length === 0) return JSON.stringify({ results: [], message: 'No posts found' });
      const results = posts.map((p) => ({
        id: p._id, title: p.title, language: p.language,
        author: (p.userId as { username?: string })?.username || 'Unknown',
        description: p.description?.slice(0, 100) || '',
        likesCount: p.likesCount, commentsCount: p.commentsCount,
      }));
      return JSON.stringify({ results, total: results.length });
    }
    case 'get_post_details': {
      const { postId } = input as PostIdInput;
      const post = await Post.findById(postId).populate('userId', 'username profileImage').lean();
      if (!post) return JSON.stringify({ error: 'Post not found' });
      return JSON.stringify({
        id: post._id, title: post.title, code: post.code, language: post.language,
        description: post.description,
        author: (post.userId as { username?: string })?.username || 'Unknown',
        likesCount: post.likesCount, commentsCount: post.commentsCount, createdAt: post.createdAt,
      });
    }
    case 'explain_code': {
      const { postId } = input as PostIdInput;
      const post = await Post.findById(postId).lean();
      if (!post) return JSON.stringify({ error: 'Post not found' });
      return JSON.stringify({
        title: post.title, language: post.language, code: post.code,
        instruction: 'Explain this code in a clear, beginner-friendly way.',
      });
    }
    case 'suggest_improvements': {
      const { postId } = input as PostIdInput;
      const post = await Post.findById(postId).lean();
      if (!post) return JSON.stringify({ error: 'Post not found' });
      return JSON.stringify({
        title: post.title, language: post.language, code: post.code,
        instruction: 'Suggest improvements for readability, performance, and best practices.',
      });
    }
    case 'find_user_posts': {
      const { username } = input as UsernameInput;
      const user = await User.findOne({ username: { $regex: `^${username}$`, $options: 'i' } });
      if (!user) return JSON.stringify({ error: `User "${username}" not found` });
      const posts = await Post.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean();
      const results = posts.map((p) => ({
        id: p._id, title: p.title, language: p.language,
        description: p.description?.slice(0, 100) || '', likesCount: p.likesCount,
      }));
      return JSON.stringify({ username: user.username, results, total: results.length });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
