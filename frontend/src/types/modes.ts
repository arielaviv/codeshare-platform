/**
 * The unified mode enum for chat input + landing chips + intent classifier.
 * Mirrors Manus's "More" menu order (Manus image #61).
 */
export type ForceMode =
  | 'auto'
  | 'code'         // Develop apps
  | 'schedule'     // Schedule task
  | 'research'     // Wide Research
  | 'sheet'        // Spreadsheet
  | 'visualization'// Charts via Python in E2B
  | 'video'        // Runway Gen-3 Turbo
  | 'audio'        // ElevenLabs TTS
  | 'chat'         // No-tools Q&A
  | 'deck'         // Slide deck
  | 'design';      // OpenAI gpt-image-1

export const MODE_LABELS: Record<ForceMode, string> = {
  auto: 'Auto',
  code: 'Develop apps',
  schedule: 'Schedule task',
  research: 'Wide Research',
  sheet: 'Spreadsheet',
  visualization: 'Visualization',
  video: 'Video',
  audio: 'Audio',
  chat: 'Chat mode',
  deck: 'Slide deck',
  design: 'Design',
};
