import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { SlideDeck, ISlide, SlidePalette } from '../models/SlideDeck';
import { UsageEvent } from '../models/UsageEvent';
import { checkAndAwardMilestone } from './milestone.service';
import type { ResearchBrief } from './research/research-brief.types';

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
}

const DECK_MODEL = 'claude-sonnet-4-6';

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
  return `You are an expert presentation designer creating Gartner-style business/tech slides.

OUTPUT: Always call the create_deck tool. Do not output text.

SLIDE COUNT: Return exactly ${slideCount} slides.
${researchSection}

SLIDE TYPES AND CONTENT SHAPES
- title:       content = { heading: string, subtitle?: string }
- bullets:     content = { heading: string, items: string[] }  — 3 to 6 items, each 4–12 words
- two-column:  content = { heading: string, left: { heading?: string, items: string[] }, right: { heading?: string, items: string[] } }
- image:       content = { heading?: string, caption?: string, imageUrl: string }
- chart-bar:   content = { heading: string, data: { label: string, value: number }[], xAxisLabel?: string, yAxisLabel?: string }
- chart-line:  content = { heading: string, data: { label: string, value: number }[], xAxisLabel?: string, yAxisLabel?: string }
- chart-pie:   content = { heading: string, data: { label: string, value: number }[] }
- stat:        content = { value: string, label: string, caption?: string, trend?: 'up' | 'down' | 'neutral' }
- quote:       content = { text: string, author?: string, source?: string }
- comparison:  content = { heading: string, left: { title: string, points: string[] }, right: { title: string, points: string[] } }

RULES
- First slide MUST be 'title'.
- Last slide should be a summary, call-to-action, or key takeaway.
- Mix slide types — do not use only bullets. Include at least one chart or stat when data could support it.
- Slide ids: use incrementing strings s1, s2, s3, …
- Invent realistic illustrative chart data; favor trends over claims of specific statistics.
- Headings: 2–8 words, active voice.
- Bullets: parallel structure, no periods, no filler.

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

THEME — pick based on style "${style}":
- professional → palette='gartner-blue', accentColor='#002060'
- casual       → palette='light',        accentColor='#2563eb'
- academic     → palette='gartner-warm', accentColor='#8B4513'
Always set fontFamily='Inter, system-ui, sans-serif'.`;
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

  try {
    const response = await client.messages.create({
      model: DECK_MODEL,
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
      modelName: DECK_MODEL,
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
