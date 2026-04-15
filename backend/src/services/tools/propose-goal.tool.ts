import type { AgentTool, ToolContext } from './types';

interface ProposeGoalInput {
  title: string;
  plannedActions?: string[];
}

/**
 * Opens a Goal card in the chat transcript. The agent calls this at the
 * start of each phase of work (e.g. "Research X", "Write content", "Generate
 * slides"). Subsequent tool calls render as action chips inside this goal.
 *
 * Pairs with `complete_goal` which closes the card with a 1–2 sentence
 * summary.
 */
export const proposeGoalTool: AgentTool = {
  definition: {
    name: 'propose_goal',
    description:
      "Open a Goal card in the chat. Call this at the start of each phase of work (e.g. 'Research Palantir', 'Write slide content', 'Generate slides'). Subsequent tool calls in this goal render as action chips inside the card. Close the goal with complete_goal when the phase is done.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description:
            'Short imperative title describing the phase. Examples: "Research Palantir\'s platforms, features, and ROI metrics", "Write detailed slide content and structure", "Generate the presentation slides".',
        },
        plannedActions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional 1–4 short labels describing the actions the goal will take. Used as initial pending chips before tools fire. Example: ["Search Palantir Foundry features", "Search Palantir AIP details"].',
        },
      },
      required: ['title'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { title, plannedActions } = input as ProposeGoalInput;
    if (!title || title.trim().length === 0) {
      return 'propose_goal failed: title is required.';
    }

    const goalId = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    ctx.writer.send('goal_started', {
      goalId,
      title: title.trim(),
      plannedActions: plannedActions ?? [],
    });

    return [
      `Goal "${title.trim()}" opened (id=${goalId}).`,
      'Call your tools now — each one renders as an action chip inside this goal.',
      'When you finish, call complete_goal with a 1–2 sentence summary of what you learned.',
    ].join('\n');
  },
};
