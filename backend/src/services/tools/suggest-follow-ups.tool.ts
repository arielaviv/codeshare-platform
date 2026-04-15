import type { AgentTool, ToolContext } from './types';

interface FollowUpPayloadSendPrompt {
  kind: 'send_prompt';
  prompt: string;
}
interface FollowUpPayloadTriggerTool {
  kind: 'trigger_tool';
  tool: string;
  input?: Record<string, unknown>;
}
interface FollowUpPayloadOpenModal {
  kind: 'open_modal';
  modal: 'topup' | 'personalization' | 'plan';
}
type FollowUpPayload =
  | FollowUpPayloadSendPrompt
  | FollowUpPayloadTriggerTool
  | FollowUpPayloadOpenModal;

interface FollowUpSuggestion {
  kind:
    | 'free_powerup'
    | 'paid_upsell'
    | 'discovery_bundle'
    | 'spin_for_discount'
    | 'related_topic'
    | 'follow_through';
  label: string;
  icon?: 'gift' | 'plus' | 'gauge' | 'sparkles' | 'compass' | 'rocket';
  payload?: FollowUpPayload;
}

interface SuggestFollowUpsInput {
  suggestions: FollowUpSuggestion[];
}

/**
 * The agent calls this once per non-trivial turn, RIGHT BEFORE the final
 * task_completed. Suggestions are commerce/SOUL-driven product moves —
 * not generic "keep the conversation going" prompts.
 *
 * See system prompt rules in code-agent.service.ts for archetype-specific
 * decisions (new user → free_powerup hook, hesitating → spin_for_discount,
 * high momentum → discovery_bundle, etc.).
 */
export const suggestFollowUpsTool: AgentTool = {
  definition: {
    name: 'suggest_follow_ups',
    description:
      "Propose 3 next-step cards to the user. These render as inline clickable cards in the chat. Each suggestion is one of: free_powerup (free trial of a paid feature), paid_upsell (specific feature for a small price), discovery_bundle (multiple features bundled at a discount), spin_for_discount (slot-spin teaser), related_topic (adjacent task), follow_through (publish/share/export). Always include at least one cheap-or-free option. Read the SOUL profile for archetype hints. Call exactly once per non-trivial turn, right before complete_goal of the final goal.",
    input_schema: {
      type: 'object' as const,
      properties: {
        suggestions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['free_powerup', 'paid_upsell', 'discovery_bundle', 'spin_for_discount', 'related_topic', 'follow_through'],
              },
              label: { type: 'string', description: 'User-facing one-liner, max 70 chars.' },
              icon: { type: 'string', enum: ['gift', 'plus', 'gauge', 'sparkles', 'compass', 'rocket'] },
              payload: {
                type: 'object',
                description:
                  'What happens on click. Use kind: "send_prompt" with prompt for new user message. kind: "trigger_tool" with tool+input for an agent tool (e.g. propose_feature). kind: "open_modal" with modal name for built-in modals.',
              },
            },
            required: ['kind', 'label'],
          },
        },
      },
      required: ['suggestions'],
    },
  },
  async execute(input: unknown, ctx: ToolContext): Promise<string> {
    const { suggestions } = input as SuggestFollowUpsInput;
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return 'suggest_follow_ups failed: at least one suggestion is required.';
    }

    ctx.writer.send('follow_ups_proposed', { suggestions });
    return `Suggested ${suggestions.length} follow-ups to the user.`;
  },
};
