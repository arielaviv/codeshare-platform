import axios from 'axios';
import type {
  Deck,
  DeckListResponse,
  DeckDetailResponse,
  ClassifyIntentResponse,
} from '../types/deck';
import type { PrizeAward } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export { API_URL };

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const decksAPI = {
  list: (page = 1, limit = 20): Promise<DeckListResponse> =>
    api.get(`/decks?page=${page}&limit=${limit}`).then((r) => r.data),

  get: (deckId: string): Promise<DeckDetailResponse> =>
    api.get(`/decks/${deckId}`).then((r) => r.data),

  create: (payload: Partial<Deck>): Promise<{ message: string; deck: Deck; prize?: PrizeAward }> =>
    api.post('/decks', payload).then((r) => r.data),

  update: (
    deckId: string,
    payload: Partial<Deck>
  ): Promise<{ message: string; deck: Deck }> =>
    api.put(`/decks/${deckId}`, payload).then((r) => r.data),

  remove: (deckId: string): Promise<{ message: string }> =>
    api.delete(`/decks/${deckId}`).then((r) => r.data),
};

export const intentAPI = {
  classify: (prompt: string): Promise<ClassifyIntentResponse> =>
    api.post('/ai/classify-intent', { prompt }).then((r) => r.data),
};

export default api;
