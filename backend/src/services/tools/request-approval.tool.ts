import crypto from 'crypto';
import type { AgentTool, ToolContext } from './types';

interface RequestApprovalInput {
  /** Identifier for this gate — routes the user's choice to the right next-stage. */
  gate: string;
  /** Shown as the card body; what the user is being asked to decide. */
  prompt: string;
  /** 2–4 choices the user can click. First is the recommended primary. */
  options: string[];
}

/**
 * Shared approval-gate tool. Any module with a human-in-the-loop pause can
 * call this to halt its agent loop and surface a decision card in chat.
 *
 * Protocol:
 *   1. Agent calls request_approval(gate, prompt, options).
 *   2. We emit `approval_required { approvalId, gate, prompt, options }` SSE.
 *   3. This tool returns a synthetic tool_result instructing the agent to
 *      exit (the outer loop treats this as a halt signal alongside the
 *      subsequent complete_stage call the agent is prompted to make).
 *   4. User clicks an option → frontend POSTs /api/books/:id/approve
 *      (or the equivalent module-level approve endpoint) → server resolves
 *      the pending approval stored on the module's record and kicks off the
 *      next stage in a fresh SSE.
 *
 * This tool does NOT persist the approval state directly — persistence is a
 * module-level concern (the book agent loop stamps the approval onto
 * book.stages[current].meta in its dispatch wrapper, the same pattern other
 * modules will adopt). Keeps this tool stateless and universally reusable.
 */
export const requestApprovalTool: AgentTool = {
  definition: {
    name: 'request_approval',
    description:
      "Pause the agent loop and request a human decision. Emits an approval card into the chat with the given prompt and clickable options. You MUST follow this call with complete_stage({ status: 'awaiting-approval' }) so the loop exits cleanly — do not emit further tool calls or text after request_approval.",
    input_schema: {
      type: 'object' as const,
      properties: {
        gate: {
          type: 'string',
          description:
            "Identifier for this gate (e.g. 'voice-check', 'final-review', 'regenerate-confirm'). The frontend routes the user's choice to the right next-stage via this id.",
        },
        prompt: {
          type: 'string',
          description:
            "One-to-two-sentence question shown to the user. Plain text, no markdown. Example: 'Chapter 1 is drafted. Does the voice feel right?'",
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description:
            "2–4 choice labels. First element is rendered as the primary (orange) button; the rest as secondary. Keep each under 40 characters. Example: ['Voice works → continue', 'Redraft tighter', 'Redraft warmer'].",
        },
      },
      required: ['gate', 'prompt', 'options'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { gate, prompt, options } = input as RequestApprovalInput;

    if (!gate || gate.trim().length === 0) {
      return 'request_approval failed: gate is required.';
    }
    if (!prompt || prompt.trim().length === 0) {
      return 'request_approval failed: prompt is required.';
    }
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
      return 'request_approval failed: options must be an array of 2–4 strings.';
    }
    const cleanOptions = options
      .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      .map((o) => o.trim().slice(0, 80));
    if (cleanOptions.length < 2) {
      return 'request_approval failed: need at least 2 non-empty option strings.';
    }

    const approvalId = crypto.randomUUID();

    ctx.writer.send('approval_required', {
      approvalId,
      gate: gate.trim(),
      prompt: prompt.trim(),
      options: cleanOptions,
      toolCallId: ctx.toolCallId,
    });

    return [
      `Approval requested (approvalId=${approvalId}, gate=${gate.trim()}).`,
      'The UI is now showing the user their choices.',
      "Call complete_stage({ status: 'awaiting-approval' }) next — do not emit further text or tool calls. The loop will exit cleanly and a fresh SSE opens when the user picks an option.",
    ].join('\n');
  },
};
