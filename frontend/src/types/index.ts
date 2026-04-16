export interface User {
  id: string;
  username: string;
  email: string;
  profileImage?: string;
  bio?: string;
  creditsCents: number;
  hasClaimedWelcomeBonus: boolean;
}

export interface Post {
  _id: string;
  userId: User;
  title: string;
  code: string;
  language: string;
  description?: string;
  image?: string;
  files?: Record<string, string>;
  aiExplanation?: string;
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  postId: string;
  userId: User;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolUsed {
  name: string;
  input: Record<string, unknown>;
}

export interface ChatResponse {
  message: string;
  toolsUsed: ToolUsed[];
}

export interface PrizeAward {
  amountCents: number;
  newBalanceCents: number;
  reason: string;
}

export interface GoalStartedEvent {
  goalId: string;
  title: string;
  plannedActions: string[];
}

export interface GoalCompletedEvent {
  summary: string;
  status: 'done' | 'error';
}

export interface MediaGeneratingEvent {
  /** Matches the tool_call.toolCallId so the frontend can correlate without
   *  relying on stale state lookups. */
  toolCallId?: string;
  prompt: string;
  model?: string;
}

export interface MediaReadyEvent {
  toolCallId?: string;
  imageUrl: string;
  path?: string;
  width?: number;
  height?: number;
  prompt?: string;
  model?: string;
}

export interface FetchedImage {
  url: string;
  alt: string;
  author: string;
  width?: number;
  height?: number;
}

export interface ImagesFetchedEvent {
  toolCallId?: string;
  query: string;
  orientation?: string;
  images: FetchedImage[];
}

export interface VerifyStartedEvent {
  toolCallId?: string;
  fileCount: number;
  port: number;
}

export interface VerifyInstallLogEvent {
  toolCallId?: string;
  exitCode: number;
  tail: string;
}

export interface VerifyScreenshotEvent {
  toolCallId?: string;
  imageUrl: string;
}

export interface VerifyDoneEvent {
  toolCallId?: string;
  matches: boolean;
  issues: string[];
  summary: string;
  screenshotUrl?: string;
}

export interface AgentSSEHandlers {
  onTextDelta: (content: string) => void;
  onFileWrite: (path: string, content: string) => void;
  onFileDelete: (path: string) => void;
  onToolCall: (name: string, input: Record<string, unknown>, toolCallId?: string) => void;
  onToolResult: (name: string, preview: string, toolCallId?: string) => void;
  onPrizeAwarded?: (prize: PrizeAward) => void;
  onPlanProposed?: (event: import('./agent-events').PlanProposedEvent) => void;
  onDeliveryStatus?: (event: import('./agent-events').DeliveryStatusEvent) => void;
  onGoalStarted?: (event: GoalStartedEvent) => void;
  onGoalCompleted?: (event: GoalCompletedEvent) => void;
  onMediaGenerating?: (event: MediaGeneratingEvent) => void;
  onMediaReady?: (event: MediaReadyEvent) => void;
  onImagesFetched?: (event: ImagesFetchedEvent) => void;
  onVerifyStarted?: (event: VerifyStartedEvent) => void;
  onVerifyInstallLog?: (event: VerifyInstallLogEvent) => void;
  onVerifyScreenshot?: (event: VerifyScreenshotEvent) => void;
  onVerifyDone?: (event: VerifyDoneEvent) => void;
  onFollowUpsProposed?: (event: { suggestions: import('../components/chat/FollowUpsCard').FollowUpSuggestion[] }) => void;
  onError: (message: string) => void;
  onDone: (filesModified: string[]) => void;
}
