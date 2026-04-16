import api from './api';

export interface VoiceSummary {
  voiceId: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  previewUrl?: string;
  description?: string;
}

export const voicesApi = {
  list: (): Promise<{ voices: VoiceSummary[] }> =>
    api.get('/voices').then((r) => r.data),
};
