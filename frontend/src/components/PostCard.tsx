import { useState } from 'react';
import { Link } from 'react-router-dom';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Post } from '../types';

interface Props {
  post: Post;
  onUpdate: () => void;
}

export default function PostCard({ post, onUpdate }: Props) {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(post.isLiked || false);
  const [likesCount, setLikesCount] = useState(post.likesCount);

  const handleLike = async () => {
    if (!user) return;
    try {
      const { data } = await api.post(`/posts/${post._id}/like`);
      setIsLiked(data.isLiked);
      setLikesCount(data.likesCount);
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  const highlightedCode = Prism.highlight(
    post.code,
    Prism.languages.javascript,
    'javascript'
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-4">
        <Link to={`/profile/${post.userId.id || (post.userId as unknown as string)}`}>
          {post.userId.profileImage ? (
            <img
              src={`http://localhost:5000${post.userId.profileImage}`}
              alt={post.userId.username}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
              {post.userId.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </Link>
        <div className="ml-3">
          <Link
            to={`/profile/${post.userId.id || (post.userId as unknown as string)}`}
            className="font-medium text-gray-900 hover:underline"
          >
            {post.userId.username}
          </Link>
          <p className="text-sm text-gray-500">
            {new Date(post.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <Link to={`/post/${post._id}`}>
        <h3 className="text-xl font-semibold mb-2 hover:text-blue-600">
          {post.title}
        </h3>
      </Link>

      {post.description && (
        <p className="text-gray-600 mb-4">{post.description}</p>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {post.language}
          </span>
        </div>
        <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <code
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>

      {post.image && (
        <img
          src={`http://localhost:5000${post.image}`}
          alt="Post"
          className="rounded-lg mb-4 max-h-96 object-cover w-full"
        />
      )}

      <div className="flex items-center space-x-6 pt-4 border-t">
        <button
          onClick={handleLike}
          className={`flex items-center space-x-2 ${
            isLiked ? 'text-red-500' : 'text-gray-500'
          } hover:text-red-500`}
          disabled={!user}
        >
          <span>{isLiked ? '❤️' : '🤍'}</span>
          <span>{likesCount}</span>
        </button>

        <Link
          to={`/post/${post._id}`}
          className="flex items-center space-x-2 text-gray-500 hover:text-blue-500"
        >
          <span>💬</span>
          <span>{post.commentsCount}</span>
        </Link>
      </div>
    </div>
  );
}
