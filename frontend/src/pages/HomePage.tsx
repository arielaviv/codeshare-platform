import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import InfiniteScroll from 'react-infinite-scroll-component';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Post } from '../types';
import FeedCard from '../components/feed/FeedCard';
import { SkeletonCard } from '../components/Skeleton';

export default function HomePage() {
  const { user } = useAuth();

  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await api.get(`/posts?page=${pageParam}&limit=20`);
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    initialPageParam: 1,
  });

  const allPosts = useMemo<Post[]>(
    () => data?.pages.flatMap((page) => page.posts) ?? [],
    [data?.pages],
  );

  if (isLoading) {
    return (
      <div className="max-w-3xl px-6 py-6">
        <div className="section-label px-0 mb-4">Feed</div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl px-6 py-6 subtle-scrollbar">
      {!user && (
        <div className="mb-6 p-4 border border-edge dark:border-[#2A2A2A] rounded text-center dark:bg-[#141414]">
          <p className="text-ink-secondary dark:text-[#A0A0A0] text-sm">
            <Link to="/login" className="text-accent dark:text-white hover:underline">Sign in</Link>{' '}
            to share what you build with Mr8
          </p>
        </div>
      )}

      <h2 className="section-label px-0 mb-3">Feed</h2>

      <InfiniteScroll
        dataLength={allPosts.length}
        next={fetchNextPage}
        hasMore={!!hasNextPage}
        loader={<SkeletonCard />}
        endMessage={
          <p className="text-center py-4 text-ink-tertiary dark:text-[#666] text-xs">
            {allPosts.length === 0 ? 'Nothing shared yet — be the first.' : 'No more posts'}
          </p>
        }
        scrollableTarget="main-content"
      >
        <div className="space-y-4">
          {allPosts.map((post) => (
            <FeedCard key={post._id} post={post} />
          ))}
        </div>
      </InfiniteScroll>
    </div>
  );
}
