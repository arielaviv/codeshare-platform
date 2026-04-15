import { useState } from 'react';

export interface TaskListTask {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

interface Props {
  title: string;
  tasks: TaskListTask[];
  status: 'running' | 'done' | 'error';
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function SpinnerIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={`${className} animate-spin`}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function ErrorIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function StatusIcon({ status }: { status: TaskListTask['status'] }) {
  if (status === 'done') return <CheckIcon className="text-status-live" />;
  if (status === 'running') return <SpinnerIcon className="text-brand-orange" />;
  if (status === 'error') return <ErrorIcon className="text-status-error" />;
  return <CircleIcon className="text-ink-tertiary dark:text-[#555]" />;
}

export default function TaskListCard({ title, tasks, status }: Props) {
  const [expanded, setExpanded] = useState(true);
  const done = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;
  const overallIcon =
    status === 'done' ? (
      <CheckIcon className="text-status-live" />
    ) : status === 'error' ? (
      <ErrorIcon className="text-status-error" />
    ) : (
      <SpinnerIcon className="text-brand-orange" />
    );

  return (
    <div className="my-2 rounded-lg border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
      >
        <span className="flex-shrink-0">{overallIcon}</span>
        <span className="text-sm font-medium text-ink dark:text-[#E8E8E8] flex-1 truncate">
          {title}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] tabular-nums flex-shrink-0">
          {done}/{total || '…'}
        </span>
        <ChevronIcon
          className={`text-ink-tertiary dark:text-[#666] flex-shrink-0 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {expanded && tasks.length > 0 && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-edge dark:border-[#2A2A2A]">
          <ul className="space-y-1.5 mt-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-2 text-[13px] leading-relaxed"
              >
                <span className="mt-0.5">
                  <StatusIcon status={task.status} />
                </span>
                <span
                  className={
                    task.status === 'done'
                      ? 'text-ink-tertiary dark:text-[#666] line-through'
                      : task.status === 'error'
                        ? 'text-status-error'
                        : 'text-ink dark:text-[#E8E8E8]'
                  }
                >
                  {task.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
