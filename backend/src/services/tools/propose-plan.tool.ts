import type { AgentTool, ToolContext } from './types';
import { scopePlan } from '../pricing.service';

interface ProposePlanInput {
  userPrompt?: string;
}

export const proposePlanTool: AgentTool = {
  definition: {
    name: 'propose_plan',
    description:
      "Propose a build plan to the user and HALT until they accept. Call this FIRST when the user's request would touch more than one file or involves a coherent feature (anything above 'change the color' level). After calling, respond with a one-sentence confirmation that you've drafted a plan and do NOT write any files — wait for the user's acceptance message before building.",
    input_schema: {
      type: 'object' as const,
      properties: {
        userPrompt: {
          type: 'string',
          description:
            'The effective user request you are scoping. Pass the exact original request text if available, or a faithful summary if multiple turns have narrowed it down.',
        },
      },
      required: ['userPrompt'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { userPrompt } = input as ProposePlanInput;
    if (!userPrompt || userPrompt.trim().length === 0) {
      return 'propose_plan failed: userPrompt is required. Retry with the user request text.';
    }

    const { plan } = await scopePlan(userPrompt, ctx.userId ?? undefined);

    ctx.writer.send('plan_proposed', {
      planId: plan.id,
      plan,
    });

    return [
      `Plan "${plan.title}" proposed (id=${plan.id}).`,
      '',
      'The user now sees a plan-approval card. DO NOT write any files yet.',
      'Respond with ONE short sentence acknowledging the plan, then stop and wait for the user.',
      'The user will reply with one of:',
      '- "Accept the plan. id=<id> mode=auto clearContext=false" → begin building immediately.',
      '- "Accept the plan. id=<id> mode=ask clearContext=false" → build but pause before each write (treat as auto for now).',
      '- A revision request (plain text) → revise the plan by calling propose_plan again.',
    ].join('\n');
  },
};
