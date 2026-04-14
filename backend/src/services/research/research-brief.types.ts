export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  relevance: number;
}

export interface ResearchBrief {
  query: string;
  summary: string;
  keyFacts: string[];
  sources: ResearchSource[];
  durationMs: number;
  cappedAt?: 'actions' | 'time';
}

export interface ResearchAgentOptions {
  query: string;
  userId: string;
  apiKey: string;
  maxSources?: number;
}
