import type { ForceMode } from '../types/modes';

/**
 * Per-mode sample prompts that swap into the empty-chat suggestion area.
 * Mirrors Manus's per-mode picker rows (image #62 audio / #63 video /
 * #58 visualization).
 */
export const SAMPLE_PROMPTS: Record<ForceMode, string[]> = {
  auto: [
    'Build a Porsche GT3 RS showcase with hero images',
    'Create a sales presentation for a B2B software solution',
    'Build a markdown editor with live preview',
    'Generate a logo for a new tech startup',
  ],
  code: [
    'Build a todo app with React and Tailwind',
    'Create a weather dashboard with current conditions',
    'Build a markdown editor with live preview',
    'Create a landing page with smooth animations',
  ],
  deck: [
    'Create a sales presentation for a B2B software solution about Palantir',
    'Quarterly review deck for Q4 2026',
    'Pitch deck for an AI healthcare startup',
    'Tech decision deck: Postgres vs MongoDB',
  ],
  sheet: [
    'Build a monthly budget tracker',
    'Create an SaaS metrics dashboard with MRR, churn, CAC',
    'Plan a 12-week product launch timeline',
    'Track team OKRs across 4 quarters',
  ],
  design: [
    'Logo for a coffee shop named Aurora — minimalist, navy and gold',
    'Hero illustration for a portfolio site, abstract geometric',
    '3D mockup of a phone app on a desk',
    'Infographic explaining how solar panels work',
  ],
  visualization: [
    'Show weekly sales activity via Heatmap',
    'Analyze E-Commerce sales and categories',
    'Compare deal sizes using box plot',
    'Visualize company budget with Treemap',
  ],
  research: [
    'Compare top 5 AI coding agents — features, pricing, market share',
    'Research the EV charging network landscape in Israel 2026',
    'Investigate Palantir Foundry vs Snowflake for enterprise data ops',
    'Survey the state of open-source LLM inference engines',
  ],
  audio: [
    'Design momentum theorem slides with audio',
    'Generate multilingual employee onboarding audio guide',
    'Summarize AI news into 7-minute audio show',
    'Produce lively product promo voiceover',
    'Transform technical article into audio podcast',
  ],
  video: [
    'Design dress and showcase explosion scene',
    'Design stylized fantasy world game concept',
    'Generate NBA finals night video',
    'Create Ultraman versus alien battle video',
    'Generate detective interrogation rubber duck',
  ],
  chat: [
    'What is the difference between Postgres and MongoDB?',
    'Explain how WebContainers work',
    'Summarize what TypeScript generics do',
    'What are the trade-offs of microservices?',
  ],
  schedule: [
    'Every Monday 9am: research the latest AI news and summarize',
    'Daily at 8am: check my GitHub PR queue and list what needs review',
    'Every Friday 5pm: generate a weekly progress report',
    'First of each month: build a budget tracker for the new month',
  ],
};
