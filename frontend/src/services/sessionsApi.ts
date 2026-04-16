import api from './api';

export type SessionSkill = 'apps' | 'slides' | 'sheet' | 'design' | 'mixed' | 'unknown';
export type SessionTitleStatus = 'pending' | 'named' | 'failed';

export interface SessionSummary {
  id: string;
  title: string;
  titleStatus: SessionTitleStatus;
  skill: SessionSkill;
  messageCount: number;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail extends SessionSummary {
  firstUserMessage: string;
  messages: Array<Record<string, unknown> & { id: string; kind: string }>;
}

export const sessionsApi = {
  create: (firstUserMessage: string, skill?: SessionSkill): Promise<{ id: string; title: string; skill: SessionSkill }> =>
    api.post('/sessions', { firstUserMessage, skill }).then((r) => r.data),

  list: (limit = 20): Promise<{ sessions: SessionSummary[] }> =>
    api.get(`/sessions?limit=${limit}`).then((r) => r.data),

  get: (id: string): Promise<SessionDetail> =>
    api.get(`/sessions/${id}`).then((r) => r.data),

  patch: (
    id: string,
    body: Partial<{
      title: string;
      unreadCount: number;
      messages: Array<Record<string, unknown> & { id: string; kind: string }>;
    }>
  ): Promise<{ id: string; title: string }> =>
    api.patch(`/sessions/${id}`, body).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/sessions/${id}`).then(() => undefined),
};

export interface UsageRecord {
  sessionId: string | null;
  title: string;
  date: string;
  creditsChange: number;
  eventCount: number;
}

export interface UsageResponse {
  balanceCents: number;
  dailyRefreshCents: number;
  records: UsageRecord[];
}

export const usageApi = {
  get: (): Promise<UsageResponse> => api.get('/usage').then((r) => r.data),
};
