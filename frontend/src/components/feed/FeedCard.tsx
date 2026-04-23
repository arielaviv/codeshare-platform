/**
 * FeedCard — single entry point the HomePage feed uses for every post kind.
 * Thumbnails mirror the inline completion cards Mr8 shows in chat so the
 * feed reads as a visual continuation of each generation.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Code2, Presentation, BookOpen, Video, AudioLines, Image as ImageIcon,
  BarChart3, Table2, Search, MessageCircle, Heart,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import type { Post, PostKind } from '../../types';
import { getStaticBase, resolveAssetUrl } from '../../lib/apiBase';
import { formatDurationSec } from '../../utils/format';
import CodeEditor from '../CodeEditor';

interface Props {
  post: Post;
}

function getMeta<T = unknown>(post: Post, key: string): T | undefined {
  const m = post.meta;
  if (!m || typeof m !== 'object') return undefined;
  return (m as Record<string, unknown>)[key] as T | undefined;
}

const KIND_META: Record<PostKind, { label: string; Icon: LucideIcon }> = {
  'snippet':       { label: 'Snippet',  Icon: Code2 },
  'code-app':      { label: 'App',      Icon: Code2 },
  'deck':          { label: 'Deck',     Icon: Presentation },
  'book':          { label: 'Book',     Icon: BookOpen },
  'video':         { label: 'Video',    Icon: Video },
  'audio':         { label: 'Audio',    Icon: AudioLines },
  'image':         { label: 'Image',    Icon: ImageIcon },
  'visualization': { label: 'Chart',    Icon: BarChart3 },
  'spreadsheet':   { label: 'Sheet',    Icon: Table2 },
  'research':      { label: 'Research', Icon: Search },
};

function Thumbnail({ post }: { post: Post }): JSX.Element | null {
  const kind = (post.kind ?? 'snippet') as PostKind;
  const { Icon } = KIND_META[kind];

  if (kind === 'deck') {
    const firstSlide = getMeta<{ title?: string; subtitle?: string; bulletCount?: number; slideType?: string }>(post, 'firstSlide');
    const slideCount = getMeta<number>(post, 'slideCount') ?? 0;
    const bullets = firstSlide?.bulletCount ?? 0;
    return (
      <div className="relative aspect-[16/9] bg-gradient-to-br from-surface-secondary to-white dark:from-[#141414] dark:to-[#0A0A0A] p-5 flex flex-col justify-center overflow-hidden">
        <div className="text-ink dark:text-[#E8E8E8] text-[18px] font-bold leading-snug line-clamp-3">
          {firstSlide?.title || post.title}
        </div>
        {firstSlide?.subtitle && (
          <div className="mt-1.5 text-ink-secondary dark:text-[#A0A0A0] text-[11px] line-clamp-2">
            {firstSlide.subtitle}
          </div>
        )}
        {bullets > 0 && (
          <div className="mt-3 space-y-1.5">
            {Array.from({ length: Math.min(4, bullets) }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-ink-tertiary dark:bg-[#555]" />
                <span className="flex-1 h-1.5 rounded-full bg-surface-tertiary dark:bg-[#2A2A2A]" style={{ width: `${70 - i * 6}%` }} />
              </div>
            ))}
          </div>
        )}
        {slideCount > 0 && (
          <div className="absolute top-2 right-2 text-[9px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] bg-white dark:bg-[#0A0A0A] px-1.5 py-0.5 rounded border border-edge dark:border-[#2A2A2A]">
            {slideCount} slides
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#0A2540] dark:bg-brand-orange" />
      </div>
    );
  }

  if (kind === 'book') {
    const cover = resolveAssetUrl(post.thumbnail) ?? resolveAssetUrl(getMeta<string>(post, 'coverImageUrl'));
    const author = getMeta<string>(post, 'author');
    const wordCount = getMeta<number>(post, 'wordCount');
    return (
      <div className="bg-gradient-to-br from-brand-orange/8 via-white to-white dark:from-brand-orange/10 dark:via-[#0F0F0F] dark:to-[#0A0A0A] p-5 flex gap-4 items-start">
        {cover ? (
          <img
            src={cover}
            alt={`${post.title} cover`}
            className="w-24 h-32 rounded-md object-cover shadow-md border border-edge dark:border-[#2A2A2A] flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-24 h-32 rounded-md bg-surface-tertiary dark:bg-[#1A1A1A] flex-shrink-0 flex items-center justify-center text-ink-tertiary">
            <Icon size={24} />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-brand-orange font-semibold">Book</div>
          <div className="text-base font-semibold text-ink dark:text-[#E8E8E8] line-clamp-2">{post.title}</div>
          {author && <div className="text-xs text-ink-tertiary dark:text-[#888] truncate">by {author}</div>}
          {typeof wordCount === 'number' && wordCount > 0 && (
            <div className="text-[11px] text-ink-tertiary dark:text-[#777]">{wordCount.toLocaleString()} words</div>
          )}
        </div>
      </div>
    );
  }

  if (kind === 'video') {
    const videoUrl = resolveAssetUrl(post.thumbnail) ?? resolveAssetUrl(getMeta<string>(post, 'videoUrl'));
    const dur = getMeta<number>(post, 'durationSec') ?? 0;
    return (
      <div className="aspect-video bg-black relative flex items-center justify-center">
        {videoUrl ? (
          // preload="none" keeps the feed light — metadata/first frame only
          // loads when the user clicks play on that specific card.
          <video src={videoUrl} controls preload="none" className="w-full h-full" />
        ) : (
          <div className="text-white/60 text-xs">Video unavailable</div>
        )}
        {dur > 0 && (
          <span className="absolute bottom-2 right-2 text-[10px] tabular-nums bg-black/70 text-white px-1.5 py-0.5 rounded">
            {formatDurationSec(dur)}
          </span>
        )}
      </div>
    );
  }

  if (kind === 'audio') {
    const audioUrl = resolveAssetUrl(post.thumbnail) ?? resolveAssetUrl(getMeta<string>(post, 'audioUrl'));
    const dur = getMeta<number>(post, 'durationSec') ?? 0;
    const voice = getMeta<string>(post, 'voiceName');
    const audioKind = getMeta<'tts' | 'sfx' | 'music'>(post, 'audioKind') ?? 'tts';
    const label = audioKind === 'music' ? 'Music' : audioKind === 'sfx' ? 'Sound effect' : 'Voiceover';
    return (
      <div className="bg-gradient-to-br from-surface-secondary to-white dark:from-[#141414] dark:to-[#0A0A0A] p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-orange/15 flex items-center justify-center flex-shrink-0 text-brand-orange">
            <Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#888] font-semibold">{label}</div>
            <div className="text-[13px] font-medium text-ink dark:text-[#E8E8E8] truncate">
              {voice ? `${voice} · ` : ''}{formatDurationSec(dur)}
            </div>
          </div>
          <div className="flex items-end gap-0.5 h-8" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="w-0.5 rounded-full bg-brand-orange/60"
                style={{ height: `${30 + ((i * 37) % 60)}%` }}
              />
            ))}
          </div>
        </div>
        {audioUrl && (
          <audio controls src={audioUrl} preload="none" className="w-full h-8" />
        )}
      </div>
    );
  }

  if (kind === 'image') {
    const src = resolveAssetUrl(post.thumbnail) ?? resolveAssetUrl(getMeta<string>(post, 'imageUrl'));
    if (!src) return null;
    return (
      <img src={src} alt={post.title} className="w-full max-h-[420px] object-contain bg-white dark:bg-[#0A0A0A]" loading="lazy" />
    );
  }

  if (kind === 'visualization') {
    const src = resolveAssetUrl(post.thumbnail) ?? resolveAssetUrl(getMeta<string>(post, 'imageUrl'));
    const chartKind = getMeta<string>(post, 'chartKind');
    return (
      <div className="bg-white dark:bg-[#0A0A0A] flex items-center justify-center min-h-[200px] relative">
        {src ? (
          <img src={src} alt={post.title} className="max-w-full max-h-[420px] object-contain" loading="lazy" />
        ) : (
          <div className="text-ink-tertiary text-xs py-10">Chart unavailable</div>
        )}
        {chartKind && chartKind !== 'unknown' && (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] bg-white dark:bg-[#0A0A0A] px-1.5 py-0.5 rounded border border-edge dark:border-[#2A2A2A]">
            {chartKind}
          </span>
        )}
      </div>
    );
  }

  if (kind === 'spreadsheet') {
    const sheetsMeta = getMeta<Array<{ name: string; rows: number; cols: number }>>(post, 'sheetsMeta') ?? [];
    const first = sheetsMeta[0];
    const colCount = first ? Math.min(first.cols, 6) : 6;
    const rowCount = first ? Math.min(first.rows, 5) : 5;
    return (
      <div className="bg-white dark:bg-[#0A0A0A] p-5 flex flex-col gap-3">
        <div className="border border-edge dark:border-[#2A2A2A] rounded overflow-hidden">
          <div className="grid bg-surface-secondary dark:bg-[#141414]" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
            {Array.from({ length: colCount }).map((_, i) => (
              <div key={i} className="text-[10px] font-semibold text-ink-tertiary dark:text-[#888] px-2 py-1 border-r last:border-r-0 border-edge dark:border-[#2A2A2A] truncate">
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
          {Array.from({ length: rowCount }).map((_, r) => (
            <div key={r} className="grid border-t border-edge dark:border-[#2A2A2A]" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
              {Array.from({ length: colCount }).map((_, c) => (
                <div key={c} className="px-2 py-1 border-r last:border-r-0 border-edge dark:border-[#2A2A2A]">
                  <span className="block h-1.5 rounded-full bg-surface-tertiary dark:bg-[#1F1F1F]" style={{ width: `${40 + ((r * 7 + c * 11) % 50)}%` }} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="text-[11px] text-ink-tertiary dark:text-[#888]">
          {sheetsMeta.length > 0
            ? `${sheetsMeta.length} sheet${sheetsMeta.length === 1 ? '' : 's'} · ${first?.rows ?? 0} × ${first?.cols ?? 0}`
            : 'Spreadsheet'}
        </div>
      </div>
    );
  }

  if (kind === 'research') {
    const summary = getMeta<string>(post, 'summary') ?? post.description ?? '';
    const facts = getMeta<string[]>(post, 'keyFacts') ?? [];
    const sources = getMeta<unknown[]>(post, 'sources') ?? [];
    return (
      <div className="bg-surface-secondary dark:bg-[#0F0F0F] p-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-2">
          <Icon size={12} /> Research brief
        </div>
        {summary && (
          <p className="text-[14px] leading-relaxed text-ink dark:text-[#E8E8E8] line-clamp-4">{summary}</p>
        )}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-tertiary dark:text-[#888]">
          {facts.length > 0 && <span>{facts.length} key facts</span>}
          {facts.length > 0 && sources.length > 0 && <span className="text-edge dark:text-[#2A2A2A]">·</span>}
          {sources.length > 0 && <span>{sources.length} sources</span>}
        </div>
      </div>
    );
  }

  if (kind === 'code-app') {
    const fileCount = post.files ? Object.keys(post.files).length : 0;
    return (
      <div className="bg-gradient-to-br from-surface-secondary to-white dark:from-[#141414] dark:to-[#0A0A0A] p-5 flex gap-3 items-center">
        <div className="w-14 h-14 rounded-md bg-brand-orange/10 flex items-center justify-center flex-shrink-0 border border-brand-orange/30 text-brand-orange">
          <Icon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.15em] text-brand-orange font-semibold">App</div>
          <div className="text-sm font-semibold text-ink dark:text-[#E8E8E8] truncate">{post.title}</div>
          <div className="text-[11px] text-ink-tertiary dark:text-[#888]">
            {post.language} · {fileCount} file{fileCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded overflow-hidden border border-edge dark:border-dark-border">
      <CodeEditor value={post.code} language={post.language || 'text'} height="200px" readOnly />
    </div>
  );
}

function FeedCard({ post }: Props): JSX.Element {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(post.isLiked || false);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [likeInflight, setLikeInflight] = useState(false);
  const kind = (post.kind ?? 'snippet') as PostKind;
  const { label: kindLabelText, Icon: KindIcon } = KIND_META[kind];

  const handleLike = async () => {
    if (!user || likeInflight) return;
    setLikeInflight(true);
    try {
      const { data } = await api.post(`/posts/${post._id}/like`);
      setIsLiked(data.isLiked);
      setLikesCount(data.likesCount);
    } catch {
      // UI state stays optimistic-free; toast would live in a feed-level provider
    } finally {
      setLikeInflight(false);
    }
  };

  const openPath = kind === 'code-app' ? `/project/${post._id}` : `/post/${post._id}`;
  const profilePath = `/profile/${post.userId.id}`;

  return (
    <article className="border border-edge dark:border-dark-border rounded-lg overflow-hidden bg-white dark:bg-dark-surface hover:border-ink-tertiary dark:hover:border-[#3B3B3B] transition-colors">
      <header className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <Link to={profilePath} aria-label={`${post.userId.username} profile`}>
          {post.userId.profileImage ? (
            <img
              src={`${getStaticBase()}${post.userId.profileImage}`}
              alt={post.userId.username}
              className="w-7 h-7 rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-surface-tertiary dark:bg-dark-border text-ink-secondary dark:text-dark-text-secondary text-xs font-medium flex items-center justify-center">
              {post.userId.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={profilePath} className="text-sm font-medium text-ink dark:text-dark-text hover:text-accent dark:hover:text-white transition-colors">
            {post.userId.username}
          </Link>
          <p className="text-[11px] uppercase text-ink-tertiary">
            {new Date(post.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-tertiary dark:text-[#888] bg-surface-tertiary dark:bg-[#1A1A1A] px-2 py-0.5 rounded-full">
          <KindIcon size={12} />
          {kindLabelText}
        </span>
      </header>

      <div className="px-4 pb-3">
        <Link to={openPath}>
          <h3 className="text-base font-semibold text-ink dark:text-dark-text hover:text-accent transition-colors line-clamp-2">
            {post.title}
          </h3>
        </Link>
        {post.description && kind !== 'research' && (
          <p className="text-sm text-ink-secondary dark:text-dark-text-secondary mt-1 line-clamp-2">
            {post.description}
          </p>
        )}
      </div>

      <Link to={openPath} className="block">
        <Thumbnail post={post} />
      </Link>

      {kind === 'snippet' && post.image && (
        <img
          src={`${getStaticBase()}${post.image}`}
          alt={post.title}
          className="w-full max-h-96 object-cover"
          loading="lazy"
        />
      )}

      <footer className="flex items-center gap-5 px-4 py-3 border-t border-edge-light dark:border-dark-border">
        <button
          onClick={handleLike}
          disabled={!user || likeInflight}
          aria-label={isLiked ? 'Unlike' : 'Like'}
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            isLiked ? 'text-status-error' : 'text-ink-tertiary hover:text-status-error'
          } disabled:cursor-not-allowed`}
        >
          <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
          <span className="tabular-nums">{likesCount}</span>
        </button>
        <Link
          to={`/post/${post._id}`}
          className="flex items-center gap-1.5 text-sm text-ink-tertiary hover:text-accent transition-colors"
        >
          <MessageCircle size={14} />
          <span className="tabular-nums">{post.commentsCount}</span>
        </Link>
      </footer>
    </article>
  );
}

export default FeedCard;
