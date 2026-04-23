/**
 * Shared allow-list for user-pickable Anthropic models.
 *
 * The frontend shows three options in the model dropdown:
 *   "Mr8 Fast" → claude-haiku-4-5-20251001
 *   "Mr8 Pro"  → claude-sonnet-4-6
 *   "Mr8 Apex" → claude-opus-4-7
 *
 * Every user-facing product module (code-agent, computer-agent, slide-agent,
 * book-agent, book-draft-loop, spreadsheet, visualization, audio, video,
 * research, book-cover) routes its primary Anthropic call through
 * `resolveUserModel()` so the picker is honored end-to-end.
 *
 * Internal scaffolding (intent classifier, session namer, app-chat proxy,
 * anon-build, verify-build, pricing scoper, code-explain, book planner,
 * copy-editor) stays pinned to Haiku by design — those are cost-controlled
 * background orchestrators whose quality does not benefit from upgrading.
 */
export const USER_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
] as const;

export type UserModel = (typeof USER_MODELS)[number];

export const DEFAULT_USER_MODEL: UserModel = 'claude-sonnet-4-6';

export function resolveUserModel(
  requested: string | undefined,
  fallback: UserModel = DEFAULT_USER_MODEL,
): UserModel {
  if (requested && (USER_MODELS as readonly string[]).includes(requested)) {
    return requested as UserModel;
  }
  return fallback;
}
