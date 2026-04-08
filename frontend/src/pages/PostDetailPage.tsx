import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import CodeEditor from '../components/CodeEditor';
import { Post, Comment } from '../types';

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: post, isLoading: postLoading } = useQuery<Post>({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data } = await api.get(`/posts/${id}`);
      return data;
    },
  });

  const { data: commentsData } = useQuery({
    queryKey: ['comments', id],
    queryFn: async () => {
      const { data } = await api.get(`/posts/${id}/comments`);
      return data;
    },
  });

  const { register, handleSubmit, reset } = useForm<{ content: string }>();

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      await api.post(`/posts/${id}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
      reset();
    },
  });

  const getAIExplanation = async () => {
    setLoadingAI(true);
    try {
      const { data } = await api.post(`/ai/explain/${id}`);
      setAiExplanation(data.explanation);
    } catch {
      setAiExplanation('Failed to get AI explanation');
    }
    setLoadingAI(false);
  };

  if (postLoading) return <div className="p-8 text-center text-ink-tertiary dark:text-dark-text-tertiary">Loading...</div>;
  if (!post) return <div className="p-8 text-center text-ink-tertiary dark:text-dark-text-tertiary">Post not found</div>;

  const comments = commentsData?.comments || [];

  return (
    <div className="max-w-3xl px-6 py-6">
      <h1 className="section-label px-0 mb-4">Post</h1>

      <div className="border border-edge dark:border-dark-border rounded p-6 bg-white dark:bg-dark-surface mb-4">
        <h2 className="text-xl font-bold mb-3">{post.title}</h2>
        {post.description && <p className="text-sm text-ink-secondary dark:text-dark-text-secondary mb-4">{post.description}</p>}

        <div className="mb-4">
          <CodeEditor value={post.code} language={post.language} height="400px" readOnly showMinimap />
        </div>

        {user && (
          <button
            onClick={getAIExplanation}
            disabled={loadingAI}
            className="mb-4 px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 text-sm transition-colors"
          >
            {loadingAI ? 'Getting explanation...' : 'Get AI Explanation'}
          </button>
        )}

        {aiExplanation && (
          <div className="bg-accent-light border border-accent/20 p-4 rounded mb-4">
            <h3 className="font-semibold text-sm mb-2">AI Explanation</h3>
            <p className="text-sm whitespace-pre-wrap">{aiExplanation}</p>
          </div>
        )}

        {post.files && Object.keys(post.files).length > 0 && (() => {
          const files = post.files!;
          const html = files['index.html'] || '';
          if (!html) return null;
          const css = files['style.css'] || files['styles.css'] || '';
          const js = files['script.js'] || files['main.js'] || files['app.js'] || '';
          let preview = html;
          if (css && preview.includes('</head>')) preview = preview.replace('</head>', `<style>${css}</style>\n</head>`);
          if (js && preview.includes('</body>')) preview = preview.replace('</body>', `<script>${js}</script>\n</body>`);
          return (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-tertiary dark:text-dark-text-tertiary mb-2">Live Preview</h3>
              <div className="border border-edge dark:border-dark-border rounded overflow-hidden h-80">
                <iframe srcDoc={preview} sandbox="allow-scripts" className="w-full h-full border-0 bg-white" title="Live Preview" />
              </div>
            </div>
          );
        })()}
      </div>

      <div className="border border-edge dark:border-dark-border rounded p-6 bg-white dark:bg-dark-surface">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-tertiary mb-4">
          Comments ({comments.length})
        </h2>

        {user && (
          <form onSubmit={handleSubmit((data) => addComment.mutate(data.content))} className="mb-6">
            <textarea
              {...register('content')}
              rows={3}
              placeholder="Write a comment..."
              className="w-full px-3 py-2 border border-edge dark:border-dark-border rounded text-sm bg-white dark:bg-dark-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              className="mt-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover text-sm transition-colors"
            >
              Comment
            </button>
          </form>
        )}

        <div className="space-y-4">
          {comments.map((comment: Comment) => (
            <div key={comment._id} className="border-b border-edge-light dark:border-dark-border pb-4">
              <div className="flex items-center mb-1.5">
                <span className="text-sm font-medium">{comment.userId.username}</span>
                <span className="text-[11px] text-ink-tertiary dark:text-dark-text-tertiary ml-2">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-ink-secondary dark:text-dark-text-secondary">{comment.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
