/**
 * Base44-style right-side Library panel. Lists the current app plus
 * every image it references. Per-item actions: Open / Download /
 * Rename / Delete. Preview shrinks to fit alongside.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { wcManager } from '../../lib/webcontainer-manager';
import {
  removeAssetReferences,
  renameAssetReferences,
  scanAssetsFromWorkspace,
  type LibraryAsset,
} from '../../lib/workspace-library';
import { Tooltip } from '../ui/Tooltip';
import { getStaticBase } from '../../lib/apiBase';

interface Props {
  projectName: string;
  previewUrl?: string | null;
  onClose: () => void;
  onAddAiChat?: () => void;
}

function resolveUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('//')) return url;
  if (url.startsWith('/uploads/')) return `${getStaticBase()}${url}`;
  return url;
}

export function LibraryPanel({
  projectName,
  previewUrl,
  onClose,
  onAddAiChat,
}: Props): JSX.Element {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [query, setQuery] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  // Debounced scanner: re-run when WebContainer files change.
  useEffect(() => {
    const rescan = () => {
      const files = wcManager.getFiles();
      setAssets(scanAssetsFromWorkspace(files, projectName));
    };
    rescan();
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = wcManager.subscribe(() => {
      if (t) clearTimeout(t);
      t = setTimeout(rescan, 300);
    });
    return () => {
      if (t) clearTimeout(t);
      unsub();
    };
  }, [projectName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.sourceRefs.some((r) => r.toLowerCase().includes(q))
    );
  }, [assets, query]);

  const appAssets = filtered.filter((a) => a.kind === 'app');
  const imageAssets = filtered.filter((a) => a.kind === 'image');

  const handleOpen = (asset: LibraryAsset) => {
    const url = resolveUrl(asset.url);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async (asset: LibraryAsset) => {
    const url = resolveUrl(asset.url);
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = asset.name || 'image';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      // silent — Open as fallback
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleRenameCommit = async (asset: LibraryAsset) => {
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!next || next === asset.name) return;
    if (asset.external) {
      // Can't rename an external hosted asset. Just update the display name.
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, name: next } : a))
      );
      return;
    }
    // Local path — rewrite references in source.
    const oldUrl = asset.url;
    const parts = oldUrl.split(/[\\/]/);
    parts[parts.length - 1] = next;
    const newUrl = parts.join('/');
    const files = renameAssetReferences(wcManager.getFiles(), oldUrl, newUrl);
    await wcManager.updateFiles(files);
  };

  const handleDelete = async (asset: LibraryAsset) => {
    const ok = window.confirm(
      `Remove all references to "${asset.name}"? The asset stays hosted — only the source files stop linking to it.`
    );
    if (!ok) return;
    const files = removeAssetReferences(wcManager.getFiles(), asset.url);
    await wcManager.updateFiles(files);
  };

  return (
    <div
      className="flex h-full flex-col bg-white dark:bg-[#0F0F0F] text-ink dark:text-[#E8E8E8]"
      style={{ width: 360 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge dark:border-[#2A2A2A] flex-shrink-0">
        <div className="text-sm font-semibold">Library</div>
        <div className="flex items-center gap-2">
          <Tooltip content="Close" side="bottom">
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8]"
              aria-label="Close library"
            >
              <X size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-edge dark:border-[#2A2A2A] flex-shrink-0 flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full pl-7 pr-2 py-1.5 text-[13px] rounded border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414]"
          />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setNewMenuOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[13px] rounded border border-edge dark:border-[#2A2A2A] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
          >
            <Plus size={12} /> New
          </button>
          {newMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-md border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] shadow-lg z-20">
              {onAddAiChat && (
                <button
                  type="button"
                  onClick={() => {
                    setNewMenuOpen(false);
                    onAddAiChat();
                  }}
                  className="w-full px-3 py-2 text-left text-[13px] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
                >
                  Add AI Chat
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setNewMenuOpen(false);
                  window.alert('Generate an image by asking Mr8 in chat: "Design me …"');
                }}
                className="w-full px-3 py-2 text-left text-[13px] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
              >
                Generate image (in chat)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {appAssets.length > 0 && (
          <>
            <SectionHeader>Apps</SectionHeader>
            {appAssets.map((a) => (
              <LibraryRow
                key={a.id}
                asset={a}
                thumbnail={
                  previewUrl ? (
                    <iframe
                      src={previewUrl}
                      title={a.name}
                      sandbox="allow-scripts allow-same-origin"
                      className="w-full h-full border-0 pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-brand-orange/10 to-brand-green/10" />
                  )
                }
                subtitle="Website"
                onOpenClick={() => a.url ? handleOpen(a) : onClose()}
              />
            ))}
          </>
        )}

        {imageAssets.length > 0 && (
          <>
            <SectionHeader>Images</SectionHeader>
            {imageAssets.map((a) => (
              <LibraryRow
                key={a.id}
                asset={a}
                thumbnail={
                  <img
                    src={resolveUrl(a.url)}
                    alt={a.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                }
                subtitle="Image"
                isRenaming={renamingId === a.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onRenameCommit={() => handleRenameCommit(a)}
                onMenuToggle={() =>
                  setMenuOpenFor((v) => (v === a.id ? null : a.id))
                }
                menuOpen={menuOpenFor === a.id}
                onOpenClick={() => handleOpen(a)}
                onDownloadClick={() => handleDownload(a)}
                onRenameClick={() => {
                  setRenamingId(a.id);
                  setRenameDraft(a.name);
                  setMenuOpenFor(null);
                }}
                onDeleteClick={() => {
                  void handleDelete(a);
                  setMenuOpenFor(null);
                }}
              />
            ))}
          </>
        )}

        {imageAssets.length === 0 && appAssets.length <= 1 && (
          <div className="text-[12px] text-ink-tertiary dark:text-[#666] py-6 text-center">
            No images referenced yet.
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] mt-2 mb-1">
      {children}
    </div>
  );
}

interface LibraryRowProps {
  asset: LibraryAsset;
  thumbnail: React.ReactNode;
  subtitle: string;
  isRenaming?: boolean;
  renameDraft?: string;
  onRenameDraftChange?: (v: string) => void;
  onRenameCommit?: () => void;
  menuOpen?: boolean;
  onMenuToggle?: () => void;
  onOpenClick?: () => void;
  onDownloadClick?: () => void;
  onRenameClick?: () => void;
  onDeleteClick?: () => void;
}

function LibraryRow({
  asset,
  thumbnail,
  subtitle,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  menuOpen,
  onMenuToggle,
  onOpenClick,
  onDownloadClick,
  onRenameClick,
  onDeleteClick,
}: LibraryRowProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onMenuToggle?.();
    };
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  }, [menuOpen, onMenuToggle]);

  return (
    <div className="group flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]">
      <button
        type="button"
        onClick={onOpenClick}
        className="w-10 h-10 rounded border border-edge dark:border-[#2A2A2A] overflow-hidden bg-surface-secondary dark:bg-[#141414] flex-shrink-0"
        aria-label="Open"
      >
        {thumbnail}
      </button>
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            autoFocus
            type="text"
            value={renameDraft}
            onChange={(e) => onRenameDraftChange?.(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit?.();
              if (e.key === 'Escape') onRenameDraftChange?.(asset.name);
            }}
            className="w-full text-[13px] px-1 py-0.5 rounded border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414]"
          />
        ) : (
          <div className="text-[13px] font-medium text-ink dark:text-[#E8E8E8] truncate">
            {asset.name}
          </div>
        )}
        <div className="text-[11px] text-ink-tertiary dark:text-[#666]">{subtitle}</div>
      </div>
      {asset.kind === 'image' && (
        <div className="relative opacity-0 group-hover:opacity-100" ref={menuRef}>
          <button
            type="button"
            onClick={onMenuToggle}
            className="p-1 text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8]"
            aria-label="Actions"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] shadow-lg z-10">
              {onOpenClick && (
                <MenuItem onClick={onOpenClick}>Open</MenuItem>
              )}
              {onDownloadClick && (
                <MenuItem onClick={onDownloadClick}>Download</MenuItem>
              )}
              {onRenameClick && (
                <MenuItem onClick={onRenameClick}>Rename</MenuItem>
              )}
              {onDeleteClick && (
                <MenuItem onClick={onDeleteClick} destructive>
                  Delete
                </MenuItem>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-1.5 text-left text-[13px] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] ${
        destructive ? 'text-status-error' : 'text-ink dark:text-[#E8E8E8]'
      }`}
    >
      {children}
    </button>
  );
}
