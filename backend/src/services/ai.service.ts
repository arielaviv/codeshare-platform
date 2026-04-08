import Anthropic from '@anthropic-ai/sdk';
import { Post } from '../models/Post';

interface AIResponse {
  explanation: string;
  cached: boolean;
}

export const getCodeExplanation = async (
  postId: string,
  forceRefresh = false
): Promise<AIResponse> => {
  const post = await Post.findById(postId);

  if (!post) {
    throw new Error('Post not found');
  }

  if (post.aiExplanation && !forceRefresh) {
    return {
      explanation: post.aiExplanation,
      cached: true,
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('AI service not configured');
  }

  const client = new Anthropic({ apiKey });

  const prompt = `Explain the following ${post.language} code in a clear, beginner-friendly way.
Include:
- What the code does
- Key concepts used
- Any potential improvements

Code:
\`\`\`${post.language}
${post.code}
\`\`\`

Keep the explanation concise (max 300 words).`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const explanation = textBlock ? textBlock.text : 'Unable to generate explanation';

  post.aiExplanation = explanation;
  await post.save();

  return {
    explanation,
    cached: false,
  };
};
