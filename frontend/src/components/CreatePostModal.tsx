import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../services/api';
import CodeEditor from './CodeEditor';

const postSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  code: z.string().min(1, 'Code required').max(10000),
  language: z.string().min(1, 'Language required'),
  description: z.string().max(1000).optional(),
});

type PostForm = z.infer<typeof postSchema>;

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreatePostModal({ onClose, onSuccess }: Props) {
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PostForm>({
    resolver: zodResolver(postSchema),
    defaultValues: { code: '', language: '' },
  });

  const codeValue = watch('code');
  const languageValue = watch('language');

  const onSubmit = async (data: PostForm) => {
    try {
      setError('');
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('code', data.code);
      formData.append('language', data.language);
      if (data.description) formData.append('description', data.description);
      if (image) formData.append('image', image);

      await api.post('/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to create post');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded border border-edge dark:border-dark-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold">Share Code Snippet</h2>
            <button onClick={onClose} className="text-ink-tertiary dark:text-dark-text-tertiary hover:text-ink dark:hover:text-dark-text transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="bg-status-error/10 text-status-error border border-status-error/20 p-3 rounded text-sm">{error}</div>
            )}

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Title</label>
              <input
                {...register('title')}
                className="mt-1 block w-full px-3 py-2 border border-edge dark:border-dark-border rounded text-sm dark:bg-dark-bg dark:text-dark-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="What does your code do?"
              />
              {errors.title && <p className="text-status-error text-xs mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Language</label>
              <select
                {...register('language')}
                className="mt-1 block w-full px-3 py-2 border border-edge dark:border-dark-border rounded text-sm dark:bg-dark-bg dark:text-dark-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent bg-white"
              >
                <option value="">Select language</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="csharp">C#</option>
                <option value="go">Go</option>
                <option value="rust">Rust</option>
              </select>
              {errors.language && <p className="text-status-error text-xs mt-1">{errors.language.message}</p>}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Code</label>
              <div className="mt-1 rounded border border-edge overflow-hidden">
                <CodeEditor
                  value={codeValue}
                  language={languageValue}
                  onChange={(val) => setValue('code', val, { shouldValidate: true })}
                  height="350px"
                  showMinimap
                />
              </div>
              {errors.code && <p className="text-status-error text-xs mt-1">{errors.code.message}</p>}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Description (optional)</label>
              <textarea
                {...register('description')}
                rows={3}
                className="mt-1 block w-full px-3 py-2 border border-edge dark:border-dark-border rounded text-sm dark:bg-dark-bg dark:text-dark-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Explain your code..."
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Image (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-ink-secondary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-edge-light dark:border-dark-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-ink-secondary hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-accent text-white rounded text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
