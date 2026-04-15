/**
 * Inline schedule builder (Phase 9H). Renders below the chat input when
 * forceMode === 'schedule'. Lets the user pick recurrence + time +
 * (optionally) day + an inner mode + the prompt to run each time.
 *
 * Submits to /api/scheduled-tasks. On success, fires onCreated with a
 * confirmation message the chat can display inline.
 */
import { useState } from 'react';
import { scheduledTasksApi, type ScheduledTaskMode } from '../../services/scheduledTasksApi';

type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface Props {
  onCreated: (info: { id: string; title: string; humanLabel: string }) => void;
}

const INNER_MODES: { value: ScheduledTaskMode; label: string }[] = [
  { value: 'auto',          label: 'Auto' },
  { value: 'code',          label: 'Develop apps' },
  { value: 'research',      label: 'Wide Research' },
  { value: 'sheet',         label: 'Spreadsheet' },
  { value: 'visualization', label: 'Visualization' },
  { value: 'audio',         label: 'Audio' },
  { value: 'video',         label: 'Video' },
  { value: 'chat',          label: 'Chat mode' },
  { value: 'deck',          label: 'Slide deck' },
  { value: 'design',        label: 'Design' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_CRON = [1, 2, 3, 4, 5, 6, 0]; // Mon=1, Sun=0

function buildCron(recurrence: Recurrence, time: string, days: number[], custom: string): string {
  const [hh, mm] = time.split(':').map((s) => parseInt(s, 10));
  if (recurrence === 'custom') return custom;
  if (recurrence === 'once' || recurrence === 'daily') return `${mm} ${hh} * * *`;
  if (recurrence === 'weekly') {
    const dayList = days.length > 0 ? days.join(',') : '*';
    return `${mm} ${hh} * * ${dayList}`;
  }
  if (recurrence === 'monthly') return `${mm} ${hh} 1 * *`;
  return `${mm} ${hh} * * *`;
}

function humanLabel(recurrence: Recurrence, time: string, days: number[]): string {
  const t = time;
  if (recurrence === 'daily') return `Daily at ${t}`;
  if (recurrence === 'weekly') {
    const labels = days.map((d) => DAY_LABELS[DAY_CRON.indexOf(d)]).join(', ');
    return `Weekly on ${labels || 'Mon–Sun'} at ${t}`;
  }
  if (recurrence === 'monthly') return `1st of each month at ${t}`;
  if (recurrence === 'once') return `Once at ${t} (today/tomorrow)`;
  return 'Custom';
}

export default function ScheduleBuilder({ onCreated }: Props): JSX.Element {
  const [recurrence, setRecurrence] = useState<Recurrence>('weekly');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([1]); // Mon by default
  const [customCron, setCustomCron] = useState('0 9 * * 1');
  const [innerMode, setInnerMode] = useState<ScheduledTaskMode>('research');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (cronDay: number) => {
    if (days.includes(cronDay)) setDays(days.filter((d) => d !== cronDay));
    else setDays([...days, cronDay]);
  };

  const submit = async () => {
    if (!prompt.trim()) {
      setError('Tell Mr8 what to do each time.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const cronExpression = buildCron(recurrence, time, days, customCron);
      const computedTitle = (title.trim() || prompt.trim()).slice(0, 80);
      const created = await scheduledTasksApi.create({
        title: computedTitle,
        prompt: prompt.trim(),
        mode: innerMode,
        cronExpression,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      onCreated({
        id: created.id,
        title: created.title,
        humanLabel: humanLabel(recurrence, time, days),
      });
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message ?? (err as Error).message;
      setError(msg ?? 'Failed to create scheduled task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-orange">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="text-sm font-semibold text-ink dark:text-[#E8E8E8]">Schedule a recurring task</span>
      </div>

      {/* Recurrence */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
          When
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(['once', 'daily', 'weekly', 'monthly', 'custom'] as Recurrence[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRecurrence(r)}
              className={`px-3 py-1.5 text-xs rounded-full border capitalize ${
                recurrence === r
                  ? 'border-brand-orange text-brand-orange bg-brand-orange-soft dark:bg-brand-orange/15'
                  : 'border-edge dark:border-[#2A2A2A] text-ink-secondary dark:text-[#A0A0A0] hover:border-ink-tertiary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {recurrence !== 'custom' ? (
        <>
          {/* Time */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="px-3 py-2 text-sm bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-ink-tertiary"
            />
          </div>

          {/* Days (weekly only) */}
          {recurrence === 'weekly' && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
                Days
              </label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, i) => {
                  const cronDay = DAY_CRON[i];
                  const selected = days.includes(cronDay);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(cronDay)}
                      className={`px-2.5 py-1.5 text-xs rounded font-medium ${
                        selected
                          ? 'bg-brand-orange text-white'
                          : 'bg-surface-secondary dark:bg-[#0F0F0F] text-ink-secondary dark:text-[#A0A0A0] hover:bg-surface-tertiary'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
            Cron expression
          </label>
          <input
            type="text"
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-ink-tertiary"
            placeholder="0 9 * * 1"
          />
          <div className="text-[11px] text-ink-tertiary dark:text-[#666] mt-1">
            Standard 5-field cron (min hour day month weekday).
          </div>
        </div>
      )}

      {/* Inner mode */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
          Run as
        </label>
        <select
          value={innerMode}
          onChange={(e) => setInnerMode(e.target.value as ScheduledTaskMode)}
          className="px-3 py-2 text-sm bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-ink-tertiary"
        >
          {INNER_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
          What should Mr8 do each time?
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., research the latest AI news and summarize"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-ink-tertiary resize-none"
        />
      </div>

      {/* Optional title */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] font-semibold mb-1.5">
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Defaults to the prompt"
          className="w-full px-3 py-2 text-sm bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#2A2A2A] rounded text-ink dark:text-[#E8E8E8] focus:outline-none focus:border-ink-tertiary"
        />
      </div>

      {error && (
        <div className="text-xs text-status-error">{error}</div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 text-sm font-semibold bg-brand-orange text-white rounded-full hover:bg-brand-orange-hover disabled:opacity-60 transition-colors flex items-center gap-1.5"
        >
          {submitting ? 'Scheduling…' : 'Schedule it →'}
        </button>
      </div>
    </div>
  );
}
