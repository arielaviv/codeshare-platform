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

export interface AgentSSEHandlers {
  onTextDelta: (content: string) => void;
  onFileWrite: (path: string, content: string) => void;
  onFileDelete: (path: string) => void;
  onToolCall: (name: string, input: Record<string, unknown>) => void;
  onToolResult: (name: string, preview: string) => void;
  onPrizeAwarded?: (prize: PrizeAward) => void;
  onPlanProposed?: (event: import('./agent-events').PlanProposedEvent) => void;
  onDeliveryStatus?: (event: import('./agent-events').DeliveryStatusEvent) => void;
  onError: (message: string) => void;
  onDone: (filesModified: string[]) => void;
}
