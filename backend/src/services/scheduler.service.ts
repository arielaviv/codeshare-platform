import cron, { type ScheduledTask as CronJob } from 'node-cron';
import mongoose from 'mongoose';
import { ScheduledTask, type IScheduledTask } from '../models/ScheduledTask';
import { ChatSession } from '../models/ChatSession';

/**
 * In-memory map of scheduled-task-id → node-cron job. We re-register on
 * boot from the DB and on each create/update/delete via the route handlers.
 */
const jobs: Map<string, CronJob> = new Map();

function scheduleJob(task: IScheduledTask): void {
  const id = task._id.toString();
  // Tear down any existing job for this id.
  const prev = jobs.get(id);
  if (prev) {
    try { prev.stop(); } catch { /* ignore */ }
    jobs.delete(id);
  }
  if (!task.enabled) return;
  if (!cron.validate(task.cronExpression)) {
    console.warn(`[scheduler] invalid cron for task ${id}: ${task.cronExpression}`);
    return;
  }
  const job = cron.schedule(
    task.cronExpression,
    () => {
      void runScheduledTask(task._id).catch((err) => {
        console.error(`[scheduler] task ${id} failed`, err);
      });
    },
    { timezone: task.timezone || 'UTC' }
  );
  jobs.set(id, job);
}

/**
 * Bootstraps the cron registry from the DB on server start.
 */
export async function bootstrapScheduler(): Promise<void> {
  try {
    const tasks = await ScheduledTask.find({ enabled: true });
    for (const t of tasks) scheduleJob(t);
    if (tasks.length > 0) {
      console.log(`[scheduler] registered ${tasks.length} scheduled tasks`);
    }
  } catch (err) {
    console.error('[scheduler] bootstrap failed', err);
  }
}

/**
 * Re-register a single task (called from POST/PATCH).
 */
export function registerTask(task: IScheduledTask): void {
  scheduleJob(task);
}

/**
 * Unregister a task (called from DELETE / when disabled).
 */
export function unregisterTask(taskId: string): void {
  const job = jobs.get(taskId);
  if (job) {
    try { job.stop(); } catch { /* ignore */ }
    jobs.delete(taskId);
  }
}

/**
 * Fires a task: creates a fresh ChatSession with unread badge so the user
 * sees it next time they open the sidebar Recent popover. The actual
 * agent run is left to the user clicking into the session — agent runs
 * are tied to live SSE connections and don't make sense to run
 * server-side without a client. We persist the prompt as the first
 * message; the user can open the session and resume.
 *
 * Future iteration: spawn an actual headless agent run server-side and
 * persist the transcript so the user opens a completed session. Out of
 * scope for v1.
 */
async function runScheduledTask(taskId: mongoose.Types.ObjectId): Promise<void> {
  const task = await ScheduledTask.findById(taskId);
  if (!task || !task.enabled) return;

  // Create a new ChatSession with unreadCount: 1 (badge in the popover).
  const session = await ChatSession.create({
    userId: task.userId,
    title: task.title,
    titleStatus: 'named', // we already know the title from the task
    skill: task.mode === 'auto' ? 'mixed' : (task.mode === 'code' ? 'apps' : task.mode === 'deck' ? 'slides' : task.mode === 'sheet' ? 'sheet' : task.mode === 'design' ? 'design' : 'mixed'),
    firstUserMessage: task.prompt,
    messageCount: 1,
    unreadCount: 1,
  });

  task.lastRunAt = new Date();
  task.lastRunSessionId = session._id;
  task.runCount += 1;
  await task.save();
}
