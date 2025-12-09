import { Post } from '../models/Post';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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

  // Return cached explanation if available
  if (post.aiExplanation && !forceRefresh) {
    return {
      explanation: post.aiExplanation,
      cached: true,
    };
  }

  if (!OPENAI_API_KEY) {
    throw new Error('AI service not configured');
  }

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

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error('AI service unavailable');
  }

  const data = await response.json();
  const explanation = data.choices[0]?.message?.content || 'Unable to generate explanation';

  // Cache the explanation
  post.aiExplanation = explanation;
  await post.save();

  return {
    explanation,
    cached: false,
  };
};
