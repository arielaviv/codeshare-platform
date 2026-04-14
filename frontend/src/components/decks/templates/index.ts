export interface DeckTemplate {
  id: string;
  name: string;
  description: string;
  topicHint: string;
  defaultStyle: 'professional' | 'casual' | 'academic';
  defaultSlideCount: number;
}

export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    id: 'saas-pitch',
    name: 'SaaS pitch',
    description: 'Problem, solution, market, traction, ask',
    topicHint: 'A SaaS pitch deck covering problem, solution, market size, traction, business model, team, and ask',
    defaultStyle: 'professional',
    defaultSlideCount: 10,
  },
  {
    id: 'quarterly-review',
    name: 'Quarterly review',
    description: 'KPIs, highlights, risks, next quarter',
    topicHint: 'A quarterly business review covering KPIs, highlights, key wins, risks, and next-quarter plans',
    defaultStyle: 'professional',
    defaultSlideCount: 8,
  },
  {
    id: 'product-roadmap',
    name: 'Product roadmap',
    description: 'Timeline, priorities, dependencies',
    topicHint: 'A product roadmap presentation with near-term priorities, medium-term bets, and long-term vision',
    defaultStyle: 'professional',
    defaultSlideCount: 8,
  },
  {
    id: 'tech-decision',
    name: 'Tech decision',
    description: 'Problem, options, trade-offs, recommendation',
    topicHint: 'A technical decision document covering problem statement, options considered, trade-offs, and recommended direction',
    defaultStyle: 'professional',
    defaultSlideCount: 7,
  },
  {
    id: 'case-study',
    name: 'Case study',
    description: 'Challenge, approach, results, lessons',
    topicHint: 'A case study covering the challenge, approach taken, measurable results, and lessons learned',
    defaultStyle: 'academic',
    defaultSlideCount: 8,
  },
];
