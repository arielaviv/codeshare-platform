import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Post } from '../types';
import CodeEditor from './CodeEditor';

interface Props {
  post: Post;
  onUpdate: () => void;
}

export default function PostCard({ post }: Props) {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(post.isLiked || false);
  const [likesCount, setLikesCount] = useState(post.likesCount);

  const handleLike = async () => {
    if (!user) return;
    try {
      const { data } = await api.post(`/posts/${post._id}/like`);
      setIsLiked(data.isLiked);
      setLikesCount(data.likesCount);
    } catch {
      // handled by UI state
    }
  };

  return (
    <div className="border border-edge dark:border-dark-border rounded p-5 bg-white dark:bg-dark-surface">
      <div className="flex items-center mb-3">
        <Link to={`/profile/${post.userId.id || (post.userId as unknown as string)}`}>
          {post.userId.profileImage ? (
            <img
              src={`http://localhost:5000${post.userId.profileImage}`}
              alt={post.userId.username}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-surface-tertiary dark:bg-dark-border text-ink-secondary dark:text-dark-text-secondary text-xs font-medium flex items-center justify-center">
              {post.userId.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </Link>
        <div className="ml-2.5">
          <Link
            to={`/profile/${post.userId.id || (post.userId as unknown as string)}`}
            className="text-sm font-medium text-ink dark:text-dark-text hover:text-accent dark:hover:text-white transition-colors"
          >
            {post.userId.username}
          </Link>
          <p className="text-[11px] uppercase text-ink-tertiary">
            {new Date(post.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <Link to={`/post/${post._id}`}>
        <h3 className="text-base font-semibold mb-1.5 hover:text-accent transition-colors">
          {post.title}
        </h3>
      </Link>

      {post.description && (
        <p className="text-sm text-ink-secondary dark:text-dark-text-secondary mb-3">{post.description}</p>
      )}

      <div className="mb-3">
        <div className="mb-1.5">
          <span className="text-xs text-ink-tertiary dark:text-dark-text-tertiary bg-surface-tertiary dark:bg-dark-border px-2 py-0.5 rounded">
            {post.language}
          </span>
        </div>
        <div className="rounded overflow-hidden">
          <CodeEditor value={post.code} language={post.language} height="200px" readOnly />
        </div>
      </div>

      {post.image && (
        <img
          src={`http://localhost:5000${post.image}`}
          alt="Post"
          className="rounded mb-3 max-h-96 object-cover w-full"
        />
      )}

      <div className="flex items-center gap-5 pt-3 border-t border-edge-light dark:border-dark-border">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            isLiked ? 'text-status-error' : 'text-ink-tertiary hover:text-status-error'
          }`}
          disabled={!user}
        >
          <span>{isLiked ? '❤️' : '🤍'}</span>
          <span>{likesCount}</span>
        </button>

        <Link
          to={`/post/${post._id}`}
          className="flex items-center gap-1.5 text-sm text-ink-tertiary hover:text-accent transition-colors"
        >
          <span>💬</span>
          <span>{post.commentsCount}</span>
        </Link>
      </div>
    </div>
  );
}
