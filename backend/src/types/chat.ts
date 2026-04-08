export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolUseRecord {
  name: string;
  input: Record<string, unknown>;
}

export interface ChatResponse {
  message: string;
  toolsUsed: ToolUseRecord[];
}

export interface AgentRequest {
  messages: ChatMessage[];
  workspace?: Record<string, string>;
}
