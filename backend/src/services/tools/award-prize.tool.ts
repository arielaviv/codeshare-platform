import type { AgentTool, ToolContext } from './types';
import { awardPrize } from '../prize.service';
import { ApiError } from '../../middleware/error.middleware';

interface AwardPrizeInput {
  reason?: string;
}

export const awardPrizeTool: AgentTool = {
  definition: {
    name: 'award_prize',
    description:
      'Celebrate a meaningful user accomplishment with a small bonus Mr8 credit ($1–$3). Use SPARINGLY — at most once per conversation, AFTER the user has completed something tangible (a working app ready to preview, a finished deck, overcoming a difficult bug). Do NOT use for encouragement mid-task or as a greeting. The user cannot trigger this themselves. Backend rate-limits to 1 prize per 24 hours; you will receive an error if the cooldown is active.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description:
            'Short celebratory message (max 200 chars) describing what the user accomplished — e.g. "finished your first React app" or "shipped a 10-slide pitch deck". Shown to the user on the prize modal.',
        },
      },
      required: ['reason'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    if (!ctx.userId) return 'Cannot award prize: user context missing.';
    const reason = (input as AwardPrizeInput).reason || 'Great work!';
    try {
      const result = await awardPrize(ctx.userId, reason);
      ctx.writer.send('prize_awarded', {
        amountCents: result.amountCents,
        newBalanceCents: result.newBalanceCents,
        reason: result.reason,
      });
      const dollars = (result.amountCents / 100).toFixed(2);
      const balance = (result.newBalanceCents / 100).toFixed(2);
      return `Awarded user $${dollars}. New balance: $${balance}. The user has been shown a celebratory prize modal — do not mention the award in your next message.`;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        return 'Prize cooldown active — the user already won a prize in the last 24 hours. Continue helping them without awarding another.';
      }
      return `Could not award prize: ${err instanceof Error ? err.message : 'unknown error'}`;
    }
  },
};
