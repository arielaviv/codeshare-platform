import type { AgentTool, ToolContext } from './types';

interface CompleteGoalInput {
  summary: string;
  status?: 'done' | 'error';
}

/**
 * Closes the most recent open Goal card. Frontend mutates the goal in
 * place — collapses it (since done) and renders the summary text below it.
 *
 * The agent does not need to pass the goalId; the frontend always closes
 * the most recent open goal. This keeps the tool contract simple.
 */
export const completeGoalTool: AgentTool = {
  definition: {
    name: 'complete_goal',
    description:
      "Close the most recent Goal card with a 1–2 sentence summary of what was learned or accomplished. Call this after each phase of work, before opening the next propose_goal.",
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string',
          description:
            'A 1–2 sentence summary in plain prose. Example: "Research revealed Palantir\'s platforms—Foundry, Gotham, and AIP—offer secure collaboration and AI-driven decision-making. Notable case: Swiss Re\'s 170% ROI." Keep it short and concrete.',
        },
        status: {
          type: 'string',
          enum: ['done', 'error'],
          description: 'Defaults to "done". Use "error" if the goal failed.',
        },
      },
      required: ['summary'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { summary, status } = input as CompleteGoalInput;
    if (!summary || summary.trim().length === 0) {
      return 'complete_goal failed: summary is required.';
    }

    ctx.writer.send('goal_completed', {
      summary: summary.trim(),
      status: status ?? 'done',
    });

    return `Goal closed. ${summary.trim()}`;
  },
};
