export interface User {
  id: string;
  username: string;
  email: string;
  profileImage?: string;
  bio?: string;
}

export interface Post {
  _id: string;
  userId: User;
  title: string;
  code: string;
  language: string;
  description?: string;
  image?: string;
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
