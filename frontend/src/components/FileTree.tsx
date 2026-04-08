import { useState, useEffect, useMemo } from 'react';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

function buildTree(files: Map<string, string>): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'folder', children: [] };

  for (const path of files.keys()) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      if (isFile) {
        current.children!.push({ name, path: fullPath, type: 'file' });
      } else {
        let folder = current.children!.find((c) => c.type === 'folder' && c.name === name);
        if (!folder) {
          folder = { name, path: fullPath, type: 'folder', children: [] };
          current.children!.push(folder);
        }
        current = folder;
      }
    }
  }

  const sort = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).map((n) => n.children ? { ...n, children: sort(n.children) } : n);
  };

  return sort(root.children || []);
}

function getFileIcon(name: string): { icon: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'ts': case 'tsx': return { icon: 'TS', color: '#3178C6' };
    case 'js': case 'jsx': return { icon: 'JS', color: '#F7DF1E' };
    case 'json': return { icon: '{}', color: '#F7DF1E' };
    case 'css': case 'scss': return { icon: '#', color: '#CE93D8' };
    case 'html': return { icon: '<>', color: '#E44D26' };
    case 'md': return { icon: 'M', color: '#90A4AE' };
    case 'py': return { icon: 'Py', color: '#3776AB' };
    default: return { icon: '·', color: '#90A4AE' };
  }
}

interface FileTreeProps {
  files: Map<string, string>;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  recentFiles?: Set<string>;
}

function TreeNodeRow({ node, depth, activeFile, onSelect, onDelete, recentFiles, expanded, toggleExpand }: {
  node: TreeNode;
  depth: number;
  activeFile: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  recentFiles?: Set<string>;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
}) {
  if (node.type === 'folder') {
    const isOpen = expanded.has(node.path);
    return (
      <>
        <div
          className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-[#E8E8E8] transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => toggleExpand(node.path)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 text-[#666]">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="truncate">{node.name}</span>
        </div>
        {isOpen && node.children?.map((child) => (
          <TreeNodeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFile={activeFile}
            onSelect={onSelect}
            onDelete={onDelete}
            recentFiles={recentFiles}
            expanded={expanded}
            toggleExpand={toggleExpand}
          />
        ))}
      </>
    );
  }

  const isActive = node.path === activeFile;
  const isRecent = recentFiles?.has(node.path);
  const { icon, color } = getFileIcon(node.name);

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs transition-colors ${
        isActive
          ? 'bg-[#1E3A5F] text-[#60A5FA] font-medium'
          : isRecent
            ? 'bg-[#1A2A1A] text-[#A0A0A0] animate-flash'
            : 'text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-[#E8E8E8]'
      }`}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
      onClick={() => onSelect(node.path)}
    >
      <span className="text-[9px] font-bold flex-shrink-0 w-4 text-center" style={{ color }}>{icon}</span>
      <span className="truncate flex-1">{node.name}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
          className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-status-error flex-shrink-0 transition-opacity"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function FileTree({ files, activeFile, onSelect, onDelete, recentFiles }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const folders = new Set<string>();
    for (const path of files.keys()) {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'));
      }
    }
    setExpanded((prev) => new Set([...prev, ...folders]));
  }, [files]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="py-1">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          activeFile={activeFile}
          onSelect={onSelect}
          onDelete={onDelete}
          recentFiles={recentFiles}
          expanded={expanded}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  );
}
