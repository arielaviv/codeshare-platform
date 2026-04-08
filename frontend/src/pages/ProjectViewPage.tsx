import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import WorkspacePanel from '../components/WorkspacePanel';
import PreviewPanel from '../components/PreviewPanel';
import { useWorkspace } from '../hooks/useWorkspace';
import type { Post } from '../types';

export default function ProjectViewPage() {
  const { id } = useParams<{ id: string }>();
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code');
  const workspace = useWorkspace(`project-${id}`);

  const { data: post } = useQuery<Post>({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data } = await api.get(`/posts/${id}`);
      return data;
    },
  });

  useEffect(() => {
    if (post?.files && workspace.files.size === 0) {
      for (const [path, content] of Object.entries(post.files)) {
        workspace.setFile(path, content);
      }
    }
  }, [post, workspace]);

  const fallbackHtml = useMemo(() => {
    if (!post?.files) return null;
    const files = post.files;
    const html = files['index.html'];
    if (!html) return null;
    const css = files['style.css'] || files['styles.css'] || '';
    const js = files['script.js'] || files['main.js'] || '';
    let result = html;
    if (css && result.includes('</head>')) result = result.replace('</head>', `<style>${css}</style>\n</head>`);
    if (js && result.includes('</body>')) result = result.replace('</body>', `<script>${js}</script>\n</body>`);
    return result;
  }, [post]);

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A]">
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#1A1A1A] bg-gradient-to-b from-[#0D1117] to-[#0A0A0A] flex-shrink-0">
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00EAFA" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span className="text-sm font-semibold text-[#E8E8E8]">CodeShare</span>
        </div>
        <span className="text-sm text-[#A0A0A0]">{post?.title || 'Loading...'}</span>
        <div />
      </div>

      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1A1A1A] flex-shrink-0">
        {(['code', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightTab(tab)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              rightTab === tab ? 'text-[#E8E8E8] bg-[#1A1A1A]' : 'text-[#666] hover:text-[#A0A0A0]'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {rightTab === 'code' ? (
          <WorkspacePanel workspace={workspace} terminalLogs="" />
        ) : (
          <PreviewPanel files={workspace.files} isGenerating={false} fallbackHtml={fallbackHtml} />
        )}
      </div>
    </div>
  );
}
