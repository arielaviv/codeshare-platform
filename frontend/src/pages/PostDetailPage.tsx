import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
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

  if (postLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!post) {
    return <div className="p-8 text-center">Post not found</div>;
  }

  const comments = commentsData?.comments || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">{post.title}</h1>
          {post.description && <p className="text-gray-600 mb-4">{post.description}</p>}

          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto mb-4">
            <code>{post.code}</code>
          </pre>

          {user && (
            <button
              onClick={getAIExplanation}
              disabled={loadingAI}
              className="mb-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {loadingAI ? 'Getting explanation...' : 'Get AI Explanation'}
            </button>
          )}

          {aiExplanation && (
            <div className="bg-purple-50 p-4 rounded-lg mb-4">
              <h3 className="font-semibold mb-2">AI Explanation</h3>
              <p className="whitespace-pre-wrap">{aiExplanation}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Comments ({comments.length})</h2>

          {user && (
            <form
              onSubmit={handleSubmit((data) => addComment.mutate(data.content))}
              className="mb-6"
            >
              <textarea
                {...register('content')}
                rows={3}
                placeholder="Write a comment..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <button
                type="submit"
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Comment
              </button>
            </form>
          )}

          <div className="space-y-4">
            {comments.map((comment: Comment) => (
              <div key={comment._id} className="border-b pb-4">
                <div className="flex items-center mb-2">
                  <span className="font-medium">{comment.userId.username}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p>{comment.content}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
