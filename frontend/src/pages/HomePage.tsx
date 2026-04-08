import { useInfiniteQuery } from '@tanstack/react-query';
import InfiniteScroll from 'react-infinite-scroll-component';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Post } from '../types';
import PostCard from '../components/PostCard';
import { SkeletonCard, SkeletonProjectCard } from '../components/Skeleton';

export default function HomePage() {
  const { user } = useAuth();

  const { data, fetchNextPage, hasNextPage, refetch, isLoading } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await api.get(`/posts?page=${pageParam}&limit=20`);
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    initialPageParam: 1,
  });

  const allPosts = data?.pages.flatMap((page) => page.posts) || [];
  const projects = allPosts.filter((p: Post) => p.files && Object.keys(p.files).length > 0);
  const snippets = allPosts.filter((p: Post) => !p.files || Object.keys(p.files).length === 0);

  if (isLoading) {
    return (
      <div className="max-w-4xl px-6 py-6">
        <div className="section-label px-0 mb-4">Feed</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          {[1, 2, 3].map((i) => <SkeletonProjectCard key={i} />)}
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl px-6 py-6 subtle-scrollbar">
      {!user && (
        <div className="mb-6 p-4 border border-edge dark:border-[#2A2A2A] rounded text-center dark:bg-[#141414]">
          <p className="text-ink-secondary dark:text-[#A0A0A0] text-sm">
            <Link to="/login" className="text-accent dark:text-white hover:underline">Sign in</Link>{' '}
            to share your code snippets
          </p>
        </div>
      )}

      {projects.length > 0 && (
        <div className="mb-8">
          <h2 className="section-label px-0 mb-3">Projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((post: Post) => (
              <Link
                key={post._id}
                to={`/project/${post._id}`}
                className="bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg p-4 hover:border-[#3B82F6]/50 transition-colors group"
              >
                <h3 className="text-sm font-semibold mb-1 text-ink dark:text-[#E8E8E8] group-hover:text-[#3B82F6] transition-colors truncate">
                  {post.title}
                </h3>
                <p className="text-xs text-ink-tertiary dark:text-[#666] mb-3 truncate">
                  by {post.userId.username}
                </p>
                <div className="flex gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 bg-surface-tertiary dark:bg-[#1A1A1A] rounded-full text-ink-tertiary dark:text-[#888]">
                    {post.language}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-surface-tertiary dark:bg-[#1A1A1A] rounded-full text-ink-tertiary dark:text-[#888]">
                    {post.files ? Object.keys(post.files).length : 0} files
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="section-label px-0 mb-3">{projects.length > 0 ? 'Code Snippets' : 'Feed'}</h2>

      <InfiniteScroll
        dataLength={snippets.length}
        next={fetchNextPage}
        hasMore={!!hasNextPage}
        loader={<SkeletonCard />}
        endMessage={<p className="text-center py-4 text-ink-tertiary dark:text-[#666] text-xs">No more posts</p>}
        scrollableTarget="main-content"
      >
        <div className="space-y-4">
          {snippets.map((post: Post) => (
            <PostCard key={post._id} post={post} onUpdate={refetch} />
          ))}
        </div>
      </InfiniteScroll>
    </div>
  );
}
