import api from './api';

export type ScheduledTaskMode =
  | 'auto' | 'code' | 'research' | 'sheet' | 'visualization'
  | 'audio' | 'video' | 'chat' | 'deck' | 'design';

export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  mode: ScheduledTaskMode;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lastRunAt?: string;
  runCount: number;
  lastRunSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export const scheduledTasksApi = {
  list: (): Promise<{ tasks: ScheduledTask[] }> =>
    api.get('/scheduled-tasks').then((r) => r.data),
  create: (body: { title: string; prompt: string; mode: ScheduledTaskMode; cronExpression: string; timezone?: string }):
    Promise<{ id: string; title: string; cronExpression: string; enabled: boolean }> =>
    api.post('/scheduled-tasks', body).then((r) => r.data),
  patch: (id: string, body: Partial<{ enabled: boolean; cronExpression: string; prompt: string; title: string }>):
    Promise<{ id: string; enabled: boolean }> =>
    api.patch(`/scheduled-tasks/${id}`, body).then((r) => r.data),
  remove: (id: string): Promise<void> =>
    api.delete(`/scheduled-tasks/${id}`).then(() => undefined),
};
