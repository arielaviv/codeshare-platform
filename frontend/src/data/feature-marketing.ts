import type { ForceMode } from '../types/modes';

export interface FeatureBenefit {
  title: string;
  body: string;
}

export interface FeatureCopy {
  slug: string;
  mode: ForceMode | 'deck-page';
  title: string;
  eyebrow: string;
  tagline: string;
  hero: string;
  ctaTo: string;
  ctaText: string;
  benefits: FeatureBenefit[];
  samplePrompts: string[];
}

export const FEATURES: FeatureCopy[] = [
  {
    slug: 'code-apps',
    mode: 'code',
    title: 'AI Code Apps',
    eyebrow: 'Develop apps',
    tagline: 'Ship full-stack web apps from a single sentence.',
    hero: 'Mr8 plans, builds, and verifies real React + backend code in a sandbox you can preview, edit, and download — no boilerplate, no setup.',
    ctaTo: '/chat',
    ctaText: 'Start building',
    benefits: [
      {
        title: 'Real working code',
        body: 'Vite + React + TypeScript scaffolding written to a live sandbox you can preview side-by-side as it streams in.',
      },
      {
        title: 'Plan-then-build',
        body: 'Mr8 proposes a plan, you approve, then it builds — no surprise scope creep, no runaway token spend.',
      },
      {
        title: 'Verified before delivery',
        body: 'Every build is type-checked and smoke-tested in the sandbox before it lands in your project view.',
      },
    ],
    samplePrompts: [
      'Build a Porsche GT3 RS landing page with hero images and a configurator',
      'Make a Pomodoro timer with task list and dark mode',
      'Clone the Linear issue tracker UI with drag-to-reorder',
    ],
  },
  {
    slug: 'decks',
    mode: 'deck-page',
    title: 'AI Decks',
    eyebrow: 'Slide decks',
    tagline: 'Gartner-style slide decks in under a minute.',
    hero: 'Describe your topic. Mr8 writes the narrative, designs every slide, and hands you a fully editable deck — charts, stats, layouts, and themes included.',
    ctaTo: '/decks',
    ctaText: 'Create a deck',
    benefits: [
      {
        title: 'Narrative-first',
        body: 'Each slide has a point. Mr8 structures the story before it picks layouts, so the deck flows like a strategy doc.',
      },
      {
        title: 'Fully editable canvas',
        body: '1920×1080 canvas with drag, resize, undo/redo, charts via Recharts, and live thumbnails. Built in-house, no Canva.',
      },
      {
        title: 'Export & share',
        body: 'PDF export client-side. Public share links for read-only viewers. Presentation mode with arrow-key navigation.',
      },
    ],
    samplePrompts: [
      'Q3 board update for a fintech startup, 12 slides, gartner-blue theme',
      'Pitch deck for a B2B AI sales tool, dark theme, with TAM/SAM/SOM',
      'Product roadmap for the next 6 months, light theme',
    ],
  },
  {
    slug: 'spreadsheets',
    mode: 'sheet',
    title: 'AI Spreadsheets',
    eyebrow: 'Spreadsheets',
    tagline: 'Generate spreadsheets that arrive row-by-row.',
    hero: 'Ask for a model, a list, or a comparison table. Mr8 streams the rows in real time and hands you a clean, structured sheet you can edit and export.',
    ctaTo: '/chat',
    ctaText: 'Build a sheet',
    benefits: [
      {
        title: 'Streamed cell-by-cell',
        body: 'Watch rows fill in as Mr8 thinks. No long blank-screen waits — useful data appears immediately.',
      },
      {
        title: 'Smart structure',
        body: 'Headers, types, and formulas inferred from your prompt. SaaS metrics, CSV exports, comparison grids — all formatted.',
      },
      {
        title: 'Editable surface',
        body: 'Inline edits, sort, filter — Mr8 sheets behave like real spreadsheets, not static tables.',
      },
    ],
    samplePrompts: [
      'A SaaS pricing comparison: Notion, Linear, Asana, ClickUp — features and pricing tiers',
      'Top 25 cybersecurity startups by funding raised in the last 12 months',
      'Monthly cash flow projection for a coffee shop opening in Tel Aviv',
    ],
  },
  {
    slug: 'research',
    mode: 'research',
    title: 'Wide Research',
    eyebrow: 'Wide Research',
    tagline: 'Multi-source research briefs you can actually use.',
    hero: 'Mr8 pulls from across the web, dedupes the noise, and writes a structured brief with sources, key findings, and citations you can verify.',
    ctaTo: '/chat',
    ctaText: 'Start a research brief',
    benefits: [
      {
        title: 'Goal + chips workflow',
        body: 'Tell Mr8 what you want to learn. It clarifies with chips, then runs a wide search across the open web.',
      },
      {
        title: 'Cited findings',
        body: 'Every claim links back to its source. No black-box summaries, no invented stats.',
      },
      {
        title: 'Brief-ready output',
        body: 'Structured TL;DR, key insights, supporting evidence — drop straight into a doc, deck, or memo.',
      },
    ],
    samplePrompts: [
      'How are mid-market SaaS companies pricing AI features in 2026?',
      'Compare the top 5 humanoid-robotics startups by funding and tech stack',
      'Latest research on GLP-1 drugs and their long-term metabolic effects',
    ],
  },
  {
    slug: 'visualization',
    mode: 'visualization',
    title: 'AI Visualization',
    eyebrow: 'Charts',
    tagline: 'Charts that make your data look like a McKinsey slide.',
    hero: 'Pick a chart style, give Mr8 the data or the question — it generates publication-quality visuals via Python in a sandboxed environment.',
    ctaTo: '/chat',
    ctaText: 'Make a chart',
    benefits: [
      {
        title: '18 chart styles',
        body: 'Hand-picked palette of bar, line, area, scatter, treemap, and more. Black & white preview, color on hover.',
      },
      {
        title: 'Python in the cloud',
        body: 'Real matplotlib + plotly running in E2B sandboxes. Not screenshots, not toy SVGs.',
      },
      {
        title: 'Editable output',
        body: 'Tweak the prompt, regenerate. Or download the PNG and the source code for offline editing.',
      },
    ],
    samplePrompts: [
      'Bar chart of US tech IPO valuations from 2018 to 2025',
      'A treemap of the S&P 500 by sector market cap',
      'Line chart comparing Bitcoin and gold returns over the last decade',
    ],
  },
  {
    slug: 'video',
    mode: 'video',
    title: 'AI Video',
    eyebrow: 'Video',
    tagline: 'Cinematic short videos from a text prompt.',
    hero: 'Powered by Runway Gen-3 Turbo. Describe the scene — Mr8 generates a polished 5–10 second clip you can drop into a deck, ad, or social post.',
    ctaTo: '/chat',
    ctaText: 'Generate a video',
    benefits: [
      {
        title: 'Runway Gen-3 Turbo',
        body: 'Best-in-class text-to-video. Cinematic motion, realistic physics, consistent character framing.',
      },
      {
        title: 'Live progress',
        body: 'Watch the render progress in real time — no cold spinners, no guessing if it crashed.',
      },
      {
        title: 'Ready to ship',
        body: 'MP4 download. Drop into a deck, a campaign, or your socials in seconds.',
      },
    ],
    samplePrompts: [
      'A drone shot flying over a snowy mountain range at sunrise, cinematic',
      'A barista in slow-motion pouring latte art, warm lighting',
      'Time-lapse of a city skyline transitioning from day to night',
    ],
  },
  {
    slug: 'audio',
    mode: 'audio',
    title: 'AI Audio',
    eyebrow: 'Voice & audio',
    tagline: 'Studio-quality voiceovers in any voice.',
    hero: 'Powered by ElevenLabs. Generate narration, podcast intros, or character voices from text — pick from a curated voice library or your own.',
    ctaTo: '/chat',
    ctaText: 'Generate audio',
    benefits: [
      {
        title: 'ElevenLabs voices',
        body: 'Hyper-natural TTS with curated voice picks. No robotic monotone, no wooden delivery.',
      },
      {
        title: 'Streamed playback',
        body: 'Hear the voice as it generates. Iterate on script and tone without waiting for full renders.',
      },
      {
        title: 'MP3 download',
        body: 'Use it in a video, a podcast, an ad, or a deck. Pristine quality, ready to ship.',
      },
    ],
    samplePrompts: [
      'Friendly narration: "Welcome to Mr8 — let\'s build something extraordinary."',
      'A 30-second podcast intro for a show about AI in healthcare',
      'A dramatic movie-trailer voice reading your latest changelog',
    ],
  },
  {
    slug: 'design',
    mode: 'design',
    title: 'AI Design',
    eyebrow: 'Images & design',
    tagline: 'On-brand images and design assets in seconds.',
    hero: 'Powered by GPT-Image-1. Generate hero images, illustrations, mockups, and icons that match your brand without a designer in the loop.',
    ctaTo: '/chat',
    ctaText: 'Design something',
    benefits: [
      {
        title: 'Photorealistic & illustrated',
        body: 'Switch styles mid-session. Photorealistic mockups one minute, hand-drawn illustrations the next.',
      },
      {
        title: 'Iterative refinement',
        body: 'Tweak the prompt, regenerate. Mr8 keeps your style and composition consistent across iterations.',
      },
      {
        title: 'Ready for production',
        body: 'PNG download. Drop directly into a deck, landing page, or marketing collateral.',
      },
    ],
    samplePrompts: [
      'A minimalist hero image for a fintech landing page, soft gradient background',
      'A cartoon mascot for a developer tool — friendly robot, orange accents',
      'A flat-illustration scene of a team collaborating around a laptop',
    ],
  },
  {
    slug: 'schedule',
    mode: 'schedule',
    title: 'Scheduled Tasks',
    eyebrow: 'Automation',
    tagline: 'Put Mr8 on autopilot with recurring jobs.',
    hero: 'Have Mr8 run a research brief every Monday, generate a weekly chart of your KPIs, or send a daily news digest. Cron-powered, no setup.',
    ctaTo: '/chat',
    ctaText: 'Schedule a task',
    benefits: [
      {
        title: 'Cron in plain English',
        body: 'Describe the schedule. Mr8 turns "every weekday at 9am" into a real recurring job.',
      },
      {
        title: 'Any skill, any cadence',
        body: 'Reuse Code Apps, Decks, Research, or Charts on a schedule — without re-prompting each time.',
      },
      {
        title: 'Results in your inbox',
        body: 'Mr8 delivers each run to your account history, ready to review or share.',
      },
    ],
    samplePrompts: [
      'Every Monday at 9am, generate a weekly news digest about AI startups',
      'Daily at 7am, pull the top 10 trending GitHub repos with summaries',
      'Every Friday, build a chart of weekly active users from my analytics',
    ],
  },
];

export const FEATURES_BY_SLUG: Record<string, FeatureCopy> = Object.fromEntries(
  FEATURES.map((f) => [f.slug, f])
);
