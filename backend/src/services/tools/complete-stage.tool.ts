import type { AgentTool, ToolContext } from './types';

interface CompleteStageInput {
  /** Short label naming the stage that just finished. */
  stage: string;
  /** How the stage ended. `awaiting-approval` pairs with a prior request_approval. */
  status: 'done' | 'awaiting-approval' | 'error';
  /** Optional one-sentence summary shown in logs / status bars. */
  summary?: string;
}

/**
 * Shared halt-signal tool. Any agent loop with well-defined stages can call
 * this to exit cleanly — the outer loop treats a complete_stage tool_result
 * as a terminator regardless of stop_reason.
 *
 * The tool itself is intentionally inert beyond emitting an SSE event. The
 * calling module's dispatch wrapper is responsible for:
 *   - Updating its persistent status (e.g. book.stages[current].status).
 *   - Deciding whether to chain into the next stage automatically.
 *
 * Keeps this tool a clean stateless verb — module coordination stays in the
 * module, the agent just signals "I'm done with this stage."
 */
export const completeStageTool: AgentTool = {
  definition: {
    name: 'complete_stage',
    description:
      "Signal that the current stage is finished. ALWAYS call this exactly once at the end of every stage you're given (drafting chapter 1, drafting remaining chapters, regenerating a single chapter, etc). The outer loop treats this as the halt signal — do not emit tool calls or text after this call.",
    input_schema: {
      type: 'object' as const,
      properties: {
        stage: {
          type: 'string',
          description:
            "Short label for the stage just completed. Use the same name the stage was initiated with — 'voice-check', 'drafting', 'regenerate-chapter', 'audit', 'line-edit', 'copy-edit', 'narrate', 'translate', 'format', 'bundle'.",
        },
        status: {
          type: 'string',
          enum: ['done', 'awaiting-approval', 'error'],
          description:
            "How the stage ended. 'done' means complete and ready to advance; 'awaiting-approval' means you just called request_approval and are exiting to let the user decide; 'error' means a tool call failed irrecoverably — include details in the summary.",
        },
        summary: {
          type: 'string',
          description:
            'Optional one-sentence (≤160 char) summary shown in logs and the Studio status bar. Example: "Drafted 6 chapters, 2034 words total.". Omit on awaiting-approval.',
        },
      },
      required: ['stage', 'status'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { stage, status, summary } = input as CompleteStageInput;

    if (!stage || stage.trim().length === 0) {
      return 'complete_stage failed: stage is required.';
    }
    if (status !== 'done' && status !== 'awaiting-approval' && status !== 'error') {
      return "complete_stage failed: status must be one of 'done', 'awaiting-approval', 'error'.";
    }
    const cleanSummary =
      typeof summary === 'string' && summary.trim().length > 0 ? summary.trim().slice(0, 200) : undefined;

    ctx.writer.send('stage_complete', {
      stage: stage.trim(),
      status,
      summary: cleanSummary,
      toolCallId: ctx.toolCallId,
    });

    return `Stage "${stage.trim()}" recorded (status=${status}). Exiting loop — do not continue.`;
  },
};
