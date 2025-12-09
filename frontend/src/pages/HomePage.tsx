import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import InfiniteScroll from 'react-infinite-scroll-component';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Post } from '../types';
import PostCard from '../components/PostCard';
import CreatePostModal from '../components/CreatePostModal';
import Navbar from '../components/Navbar';

export default function HomePage() {
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, fetchNextPage, hasNextPage, refetch } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await api.get(`/posts?page=${pageParam}&limit=10`);
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    initialPageParam: 1,
  });

  const posts = data?.pages.flatMap((page) => page.posts) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {user && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full mb-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Share Code Snippet
          </button>
        )}

        {!user && (
          <div className="mb-6 p-4 bg-white rounded-lg shadow text-center">
            <p className="text-gray-600">
              <Link to="/login" className="text-blue-600 hover:underline">
                Sign in
              </Link>{' '}
              to share your code snippets
            </p>
          </div>
        )}

        <InfiniteScroll
          dataLength={posts.length}
          next={fetchNextPage}
          hasMore={!!hasNextPage}
          loader={<p className="text-center py-4">Loading...</p>}
          endMessage={
            <p className="text-center py-4 text-gray-500">No more posts</p>
          }
        >
          <div className="space-y-6">
            {posts.map((post: Post) => (
              <PostCard key={post._id} post={post} onUpdate={refetch} />
            ))}
          </div>
        </InfiniteScroll>
      </main>

      {showCreateModal && (
        <CreatePostModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
