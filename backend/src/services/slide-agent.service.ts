import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { SlideDeck, ISlide, SlidePalette } from '../models/SlideDeck';
import { UsageEvent } from '../models/UsageEvent';
import { checkAndAwardMilestone } from './milestone.service';
import type { ResearchBrief } from './research/research-brief.types';
import { craftBibleFor } from './writing/craft-bible';
import { resolveUserModel } from './model-select';

export interface SlideAgentSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface GenerateDeckOptions {
  topic: string;
  slideCount: number;
  style?: 'professional' | 'casual' | 'academic';
  templateId?: string;
  userId: mongoose.Types.ObjectId;
  researchBrief?: ResearchBrief;
  model?: string;
}

const createDeckTool: Tool = {
  name: 'create_deck',
  description:
    'Return a complete slide deck. Always call this tool; never return plain text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Deck title, max 200 chars' },
      description: { type: 'string', description: 'One-sentence deck summary' },
      theme: {
        type: 'object',
        properties: {
          palette: {
            type: 'string',
            enum: ['dark', 'light', 'gartner-blue', 'gartner-warm'],
          },
          accentColor: {
            type: 'string',
            description: 'Hex color e.g. #002060',
          },
          fontFamily: { type: 'string' },
        },
        required: ['palette', 'accentColor', 'fontFamily'],
      },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable id like s1, s2, ...' },
            type: {
              type: 'string',
              enum: [
                'title',
                'bullets',
                'two-column',
                'image',
                'chart-bar',
                'chart-line',
                'chart-pie',
                'stat',
                'quote',
                'comparison',
              ],
            },
            content: {
              type: 'object',
              description:
                'Slide content; shape depends on type — see system prompt',
            },
            notes: { type: 'string' },
          },
          required: ['id', 'type', 'content'],
        },
      },
    },
    required: ['title', 'theme', 'slides'],
  },
};

function formatResearchBrief(brief: ResearchBrief): string {
  const facts = brief.keyFacts.length > 0
    ? brief.keyFacts.map((f) => `- ${f}`).join('\n')
    : '(none)';
  const sources = brief.sources.length > 0
    ? brief.sources
        .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}${s.snippet ? `\n    ${s.snippet.slice(0, 180)}` : ''}`)
        .join('\n')
    : '(none)';
  const capNote = brief.cappedAt ? `\n(Research was capped by ${brief.cappedAt}; treat findings as partial.)` : '';
  return `RESEARCH BRIEF (ground your slides in these facts — cite source numbers in slide content where natural):

Summary: ${brief.summary}

Key facts:
${facts}

Sources:
${sources}${capNote}
`;
}

function buildSystemPrompt(opts: GenerateDeckOptions): string {
  const { slideCount, style = 'professional', researchBrief } = opts;
  const researchSection = researchBrief ? `\n${formatResearchBrief(researchBrief)}\n` : '';
  const craft = craftBibleFor({ purpose: 'slide-copy' });
  return `You are the most decorated presentation designer in the world — the
person pitch-deck legends like Figma's Series C deck, Airbnb's seed
deck, Mercury's brand deck, and Stripe Press were modeled after.
You are NOT making "Gartner business slides". You are making decks
that founders print and frame.

${craft}

## TASK

OUTPUT: Always call the create_deck tool. Never output plain text.

SLIDE COUNT: Return exactly ${slideCount} slides.
${researchSection}

THE QUALITY BAR (non-negotiable):

Target: a deck that could close a Series A meeting on its own. Every
slide must earn its place. If a slide would bore a senior investor,
cut it and make the remaining slides better.

Three commandments:
1. ONE idea per slide. Ruthlessly. No kitchen-sink bullet walls.
2. Numbers beat adjectives. "$4.2B TAM" beats "large market".
3. Stories beat specs. Hook → stakes → proof → payoff.

SLIDE TYPES AND CONTENT SHAPES
- title:       content = { heading: string, subtitle?: string }
- bullets:     content = { heading: string, items: string[] }  — 3 to 5 items, each 4–10 words, parallel structure, no filler
- two-column:  content = { heading: string, left: { heading?: string, items: string[] }, right: { heading?: string, items: string[] } }
- image:       content = { heading?: string, caption?: string, imageUrl: string }
- chart-bar:   content = { heading: string, data: { label: string, value: number }[], xAxisLabel?: string, yAxisLabel?: string }
- chart-line:  content = { heading: string, data: { label: string, value: number }[], xAxisLabel?: string, yAxisLabel?: string }
- chart-pie:   content = { heading: string, data: { label: string, value: number }[] }
- stat:        content = { value: string, label: string, caption?: string, trend?: 'up' | 'down' | 'neutral' }
- quote:       content = { text: string, author?: string, source?: string }
- comparison:  content = { heading: string, left: { title: string, points: string[] }, right: { title: string, points: string[] } }

DECK ARCHITECTURE (most decks should follow this arc):
1. title — product name + one-line positioning subtitle. Make the
   subtitle a provocation, not a description.
   (good) "The AI that diagnoses before the doctor does."
   (bad)  "Transforming Patient Outcomes Through AI — Smarter
           Diagnostics, Faster Care, Better Lives"
2. Problem — a single stat or quote that makes the audience feel the
   pain. Use a 'stat' slide with a big number OR a 'quote' from a
   real practitioner. Never start with bullets.
3. Stakes — who gets hurt today. Another stat or a chart showing the
   trend.
4. Solution — one sentence + one diagram/image. If you can't describe
   it in 12 words the positioning isn't sharp enough.
5. How it works — 3 steps max. Use bullets or two-column.
6. Why now — usually one chart (market trend, adoption curve).
7. Traction — hard numbers. stat slides are king here.
8. Market — the "$X TAM" stat slide + one chart-bar for segments.
9. Competition — comparison slide. Honest and specific, not "we're
   10x better" vague.
10. Team — quote slide or two-column with compact credentials.
11. Ask — last slide: what do you want? money, pilots, partners.
    Make it concrete — "$15M Series A", not "funding".

SLIDE CRAFT — the difference between amateur and world-class:

HEADINGS: 2–7 words, sentence case or title case consistently
within the deck. Use active verbs. "Revenue doubled every quarter"
beats "Our Revenue Growth Trajectory". Think newsroom deck, not
sales brochure.

SUBTITLES: One sentence, max 14 words. Drop articles if it hurts
rhythm. ("Clinicians drown in data. MediMind surfaces the signal.")

BULLETS: 3–5 items. Parallel grammar. No periods. No "etc.". No
nested sub-bullets. If you have more than 5 bullets, split into two
slides or convert to a chart.

STATS: the star format for investor decks. Use when you have a real
number that tells the story. Pair a bold VALUE with a tight LABEL
and a one-line CAPTION that gives context:
  value: "$4.2B"
  label: "TAM by 2028"
  caption: "Compounding 34% YoY on the back of aging demographics"
Never vague. Never rounded beyond what's plausible.

CHARTS: pick the right shape.
- chart-bar  → discrete comparisons (segments, competitors, regions)
- chart-line → time series, adoption curves, cohort data
- chart-pie  → share-of-whole with 3–5 segments max; NEVER for time
When using chart data:
- Invent ONLY when no research brief is provided; otherwise prefer
  the brief's numbers.
- Label axes when units aren't self-evident.
- 3–7 data points per chart. More and it becomes noise.

QUOTES: use sparingly (1–2 per deck max). Best for Problem or Team
slides. Attribute to a real-feeling role+company ("Director of ICU,
Mount Sinai") not just "a doctor".

IMAGE SLIDES: when used, the image IS the slide. Keep caption under
10 words. Don't pile a heading + caption + bullets on top; choose
one accent.

IMAGES — Unsplash only (never placeholder.com / via.placeholder.com / placehold.co)
Format: https://images.unsplash.com/photo-{ID}?w=1600&h=900&fit=crop
Approved IDs by category — pick one matching the slide topic:
- Nature: 1506744038136-46273834b3fb, 1470071459604-3b5ec3a7fe05, 1441974231531-c6227db76b6e
- Architecture: 1486325212027-8a9601a5e652, 1487958449943-2429e8be8625, 1479839672679-a46483c0e7c1
- Technology: 1518770660439-4636190af475, 1550751827-4bd374c3f58b, 1531297484001-d7418eddbdb5
- Food: 1504674900247-0877df9cc836, 1476224203421-9ac39bcb3327, 1565299624946-b28f40a0ae38
- People: 1529156069898-49953bc89e16, 1438761681033-6461ffad8d80, 1507003211169-0a1dd7228f2d
- Cars: 1544636331-e26879cd4d9b, 1503376780353-7e6692767b70, 1552519507-da3b142c6e3b
- Business: 1497366216548-37526070297c, 1497366811353-6870744d04b2, 1522202176988-66273c2fd55f
- Healthcare: 1576091160399-112ba8d25d1d, 1519494026892-80bbd2d6fd0d, 1581056771107-24ca5f033842

THEME — every slide in the deck uses the same theme object.
palette options: 'dark' (near-black bg, bold), 'light' (warm white,
editorial), 'gartner-blue' (classic business navy), 'gartner-warm'
(terracotta/stone, academic).

Rules:
- professional → palette='gartner-blue', accentColor='#002060', OR
  (for modern SaaS/AI decks) palette='dark', accentColor='#FF4D00'
  or '#00D4B4'. Pick one.
- casual       → palette='light', accentColor='#1E40AF' or '#DC2626'
- academic     → palette='gartner-warm', accentColor='#8B4513'

Always set fontFamily='Inter, system-ui, sans-serif'.

DENSITY & VARIETY (critical):
- Never use 'bullets' for more than 40% of slides. Mix stat / quote /
  image / chart / comparison.
- Between any two consecutive slides, vary the type. Two bullets in
  a row is forbidden. Two stats in a row is forbidden.
- At least 2 'stat' slides in any deck of 6+. Pick the most
  impressive, believable numbers and make them huge.
- At least 1 chart in any deck of 5+. Pick chart-bar or chart-line.
- At least 1 comparison slide if the topic has competitors.

WRITE LIKE A FOUNDER, NOT A CONSULTANT:
- No "optimize", "leverage", "solutions", "ecosystem", "synergize",
  "next-generation" unless the user specifically invoked them.
- Show, don't tell: "shipped 24 features in Q3" beats "rapid
  execution pace".
- Concrete numbers > ranges > adjectives.
- Contractions are fine when they add warmth (it's, we're). Avoid in
  headlines for punch.

FAIL-CHECK before emitting the tool call:
- Could any slide be deleted without losing the story? Delete it.
- Does any slide have >5 bullets? Split or convert to chart.
- Is every heading active voice? Rewrite passives.
- Is the Ask slide concrete? ("$15M Series A"), not vague.
- Is the opening subtitle a provocation, not a description?

Slide ids: s1, s2, s3, … in order.`;
}

interface DeckToolInput {
  title: string;
  description?: string;
  theme: { palette: SlidePalette; accentColor: string; fontFamily: string };
  slides: ISlide[];
}

export async function generateDeck(
  opts: GenerateDeckOptions,
  writer: SlideAgentSSEWriter
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'AI service not configured' });
    writer.end();
    return;
  }

  if (opts.researchBrief) {
    writer.send('research_injected', {
      summary: opts.researchBrief.summary,
      sourceCount: opts.researchBrief.sources.length,
      keyFactCount: opts.researchBrief.keyFacts.length,
      cappedAt: opts.researchBrief.cappedAt,
    });
  }

  writer.send('deck_started', {
    topic: opts.topic,
    slideCount: opts.slideCount,
  });

  const client = new Anthropic({ apiKey });
  const model = resolveUserModel(opts.model);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: buildSystemPrompt(opts),
      tools: [createDeckTool],
      tool_choice: { type: 'tool', name: 'create_deck' },
      messages: [
        {
          role: 'user',
          content: `Generate a ${opts.slideCount}-slide deck about: ${opts.topic}`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'create_deck') {
      throw new Error('Model did not return a deck');
    }

    const deckInput = toolUse.input as DeckToolInput;

    if (!deckInput.slides || deckInput.slides.length === 0) {
      throw new Error('Generated deck has no slides');
    }

    for (const slide of deckInput.slides) {
      writer.send('slide_received', { slide });
    }

    const deck = new SlideDeck({
      userId: opts.userId,
      title: deckInput.title,
      description: deckInput.description || '',
      theme: deckInput.theme,
      slides: deckInput.slides,
      isPublic: false,
    });
    await deck.save();

    const usage = response.usage;
    await UsageEvent.create({
      userId: opts.userId,
      feature: 'deck-generation',
      modelName: model,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
    });

    // Check for deck-generation milestones and emit a prize event in the same
    // stream so the UI can surface a celebration modal.
    const prize = await checkAndAwardMilestone(opts.userId, 'deck-generated');
    if (prize) {
      writer.send('prize_awarded', {
        amountCents: prize.amountCents,
        newBalanceCents: prize.newBalanceCents,
        reason: prize.reason,
      });
    }

    writer.send('deck_complete', {
      deckId: deck._id.toString(),
      title: deck.title,
      slideCount: deck.slides.length,
    });
    writer.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    writer.send('error', { message });
    writer.end();
  }
}
