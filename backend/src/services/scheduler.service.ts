import cron, { type ScheduledTask as CronJob } from 'node-cron';
import mongoose from 'mongoose';
import { ScheduledTask, type IScheduledTask } from '../models/ScheduledTask';
import { ChatSession } from '../models/ChatSession';
import { runHeadlessAgent } from './headless-agent.service';

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
 * Fires a task: creates a fresh ChatSession and then runs the agent
 * headlessly so the transcript is already populated by the time the user
 * opens it from the sidebar popover. Mode dispatch lives in
 * `headless-agent.service`.
 */
async function runScheduledTask(taskId: mongoose.Types.ObjectId): Promise<void> {
  const task = await ScheduledTask.findById(taskId);
  if (!task || !task.enabled) return;

  const session = await ChatSession.create({
    userId: task.userId,
    title: task.title,
    titleStatus: 'named', // we already know the title from the task
    skill:
      task.mode === 'auto'
        ? 'mixed'
        : task.mode === 'code'
          ? 'apps'
          : task.mode === 'deck'
            ? 'slides'
            : task.mode === 'sheet'
              ? 'sheet'
              : task.mode === 'design'
                ? 'design'
                : 'mixed',
    firstUserMessage: task.prompt,
    messageCount: 0,
    unreadCount: 0,
    messages: [],
  });

  task.lastRunAt = new Date();
  task.lastRunSessionId = session._id;
  task.runCount += 1;
  await task.save();

  try {
    await runHeadlessAgent({
      sessionId: session._id,
      userId: task.userId,
      mode: task.mode,
      prompt: task.prompt,
      taskTitle: task.title,
    });
  } catch (err) {
    console.error(`[scheduler] headless run failed for task ${taskId}`, err);
  }
}
