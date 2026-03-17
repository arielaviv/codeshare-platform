import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';
import Navbar from '../components/Navbar';
import CodeEditor from '../components/CodeEditor';
import type { ChatMessage, ChatResponse, ToolUsed } from '../types';
import type { Components } from 'react-markdown';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: ToolUsed[];
}

interface StoredConversation {
  id: string;
  title: string;
  messages: DisplayMessage[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'codeshare_chat_history';
const MAX_CONVERSATIONS = 50;

const TOOL_LABELS: Record<string, string> = {
  search_posts: 'Searched posts',
  get_post_details: 'Fetched post details',
  explain_code: 'Analyzed code',
  suggest_improvements: 'Suggested improvements',
  find_user_posts: 'Found user posts',
};

const LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'java',
  'cpp',
  'csharp',
  'go',
  'rust',
] as const;

const SUGGESTION_CHIPS = [
  'Find Python sorting algorithms',
  'Explain the latest post\'s code',
  'What are the most liked posts?',
  'Review my code for improvements',
];

// ---------------------------------------------------------------------------
// Helpers — localStorage persistence
// ---------------------------------------------------------------------------

function loadConversations(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredConversation[];
  } catch {
    return [];
  }
}

function saveConversations(convos: StoredConversation[]) {
  const trimmed = convos.slice(0, MAX_CONVERSATIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Markdown custom components — code blocks get "Open in Editor" button
// ---------------------------------------------------------------------------

function buildMarkdownComponents(
  onOpenInEditor: (code: string, lang: string) => void,
): Components {
  return {
    h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-3">{children}</h1>,
    h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-bold mb-1 mt-2">{children}</h3>,
    h4: ({ children }) => <h4 className="text-sm font-bold mb-1 mt-2">{children}</h4>,
    p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="ml-6 mb-3 list-disc space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="ml-6 mb-3 list-decimal space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2 text-gray-600">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-3">
        <table className="w-full border border-gray-200 text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
    tr: ({ children }) => <tr className="border-b border-gray-200 even:bg-gray-50">{children}</tr>,
    th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="px-3 py-2">{children}</td>,
    code: ({ className, children }) => {
      const match = /language-(\w+)/.exec(className || '');
      if (match) {
        const lang = match[1];
        const codeString = String(children).replace(/\n$/, '');
        const lineCount = codeString.split('\n').length;
        const height = `${Math.max(60, Math.min(lineCount * 20 + 24, 250))}px`;

        return (
          <div className="my-2 rounded-lg overflow-hidden border border-gray-700">
            <div className="flex items-center justify-between bg-gray-800 px-3 py-1.5 text-xs text-gray-400">
              <span>{lang}</span>
              <button
                type="button"
                onClick={() => onOpenInEditor(codeString, lang)}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Open in Editor &rarr;
              </button>
            </div>
            <CodeEditor value={codeString} language={lang} height={height} readOnly />
          </div>
        );
      }
      return (
        <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }) => <>{children}</>,
  };
}

// ---------------------------------------------------------------------------
// Post link detection
// ---------------------------------------------------------------------------

function PostLinks({ content }: { content: string }) {
  const ids = content.match(/[a-f0-9]{24}/g);
  if (!ids || ids.length === 0) return null;
  const unique = [...new Set(ids)];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {unique.map((id) => (
        <Link
          key={id}
          to={`/post/${id}`}
          className="text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-0.5 rounded inline-flex items-center gap-1"
        >
          View post {id.slice(-6)} &rarr;
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AIChatPage() {
  // -- Conversations state
  const [conversations, setConversations] = useState<StoredConversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const convos = loadConversations();
    return convos.length > 0 ? convos[0].id : null;
  });

  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const messages = activeConvo?.messages ?? [];

  // -- Chat state
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  // -- Editor state
  const [editorCode, setEditorCode] = useState('// Paste or write your code here...');
  const [editorLanguage, setEditorLanguage] = useState('plaintext');

  // -- UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<'chat' | 'editor'>('chat');

  // -- Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // -- Persist conversations
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // -- Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // -- Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  // -- Update a conversation's messages
  const updateConvoMessages = useCallback(
    (convoId: string, updater: (prev: DisplayMessage[]) => DisplayMessage[]) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convoId
            ? {
                ...c,
                messages: updater(c.messages),
                updatedAt: new Date().toISOString(),
                title: c.title || '',
              }
            : c,
        ),
      );
    },
    [],
  );

  // -- Create new conversation
  const createNewChat = useCallback(() => {
    const newConvo: StoredConversation = {
      id: generateId(),
      title: '',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConvo, ...prev]);
    setActiveId(newConvo.id);
    setInput('');
    setRateLimited(false);
  }, []);

  // -- Delete conversation
  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setConversations((prev) => {
          if (prev.length > 0) {
            setActiveId(prev[0].id);
          } else {
            setActiveId(null);
          }
          return prev;
        });
      }
    },
    [activeId],
  );

  // -- Send message
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      let convoId = activeId;

      // Create conversation if none active
      if (!convoId) {
        const newConvo: StoredConversation = {
          id: generateId(),
          title: trimmed.slice(0, 40),
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setConversations((prev) => [newConvo, ...prev]);
        convoId = newConvo.id;
        setActiveId(convoId);
      }

      const userMsg: DisplayMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };

      // Set title from first user message if empty
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convoId && !c.title
            ? { ...c, title: trimmed.slice(0, 40) }
            : c,
        ),
      );

      updateConvoMessages(convoId, (prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setRateLimited(false);

      try {
        // Build message history for the API
        const currentConvo = conversations.find((c) => c.id === convoId);
        const allMsgs = [...(currentConvo?.messages ?? []), userMsg];
        const history: ChatMessage[] = allMsgs.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const { data } = await api.post<ChatResponse>('/ai/chat', {
          messages: history,
        });

        const assistantMsg: DisplayMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message,
          toolsUsed: data.toolsUsed,
        };

        updateConvoMessages(convoId, (prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const isRateLimit =
          typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          typeof (err as { response?: { status?: number } }).response?.status === 'number' &&
          (err as { response: { status: number } }).response.status === 429;

        if (isRateLimit) {
          setRateLimited(true);
        }

        updateConvoMessages(convoId, (prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: isRateLimit
              ? 'Rate limit reached. Please try again later.'
              : 'Something went wrong. Please try again.',
          },
        ]);
      }

      setLoading(false);
    },
    [activeId, loading, conversations, updateConvoMessages],
  );

  // -- Handle input submit
  const handleSubmitInput = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  // -- Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmitInput();
      }
    },
    [handleSubmitInput],
  );

  // -- Send editor code to chat
  const sendEditorCode = useCallback(() => {
    const code = editorCode.trim();
    if (!code || code === '// Paste or write your code here...') return;
    sendMessage(`Here's my code:\n\`\`\`${editorLanguage}\n${code}\n\`\`\`\nPlease review it.`);
  }, [editorCode, editorLanguage, sendMessage]);

  const sendExplain = useCallback(() => {
    const code = editorCode.trim();
    if (!code || code === '// Paste or write your code here...') return;
    sendMessage(`Explain this code:\n\`\`\`${editorLanguage}\n${code}\n\`\`\``);
  }, [editorCode, editorLanguage, sendMessage]);

  const sendImprove = useCallback(() => {
    const code = editorCode.trim();
    if (!code || code === '// Paste or write your code here...') return;
    sendMessage(
      `Suggest improvements for this code:\n\`\`\`${editorLanguage}\n${code}\n\`\`\``,
    );
  }, [editorCode, editorLanguage, sendMessage]);

  // -- Open code in editor (from chat code blocks)
  const openInEditor = useCallback((code: string, lang: string) => {
    setEditorCode(code);
    const normalized = lang.toLowerCase();
    if ((LANGUAGES as readonly string[]).includes(normalized)) {
      setEditorLanguage(normalized);
    }
    setMobileTab('editor');
  }, []);

  // -- Markdown components memo
  const mdComponents = useMemo(() => buildMarkdownComponents(openInEditor), [openInEditor]);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        {/* ======================== SIDEBAR ======================== */}
        <aside
          className={`bg-white border-r border-gray-100 flex-shrink-0 flex flex-col transition-all duration-200 ${
            sidebarOpen ? 'w-60' : 'w-14'
          } hidden md:flex`}
        >
          {/* Sidebar header */}
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500 text-sm flex-shrink-0"
              title={sidebarOpen ? 'Collapse' : 'Expand'}
            >
              {sidebarOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 19l-7-7 7-7"/><path d="M18 19l-7-7 7-7" opacity=".4"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 5l7 7-7 7"/><path d="M6 5l7 7-7 7" opacity=".4"/></svg>
              )}
            </button>
            {sidebarOpen && (
              <button
                type="button"
                onClick={createNewChat}
                className="flex-1 text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition-colors"
              >
                + New Chat
              </button>
            )}
          </div>

          {/* Collapsed: just new-chat icon */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={createNewChat}
              className="mx-auto mt-2 p-2 hover:bg-gray-100 rounded text-blue-600"
              title="New Chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          )}

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {sidebarOpen &&
              conversations.map((convo) => (
                <div
                  key={convo.id}
                  className={`group relative px-3 py-2.5 cursor-pointer transition-colors text-sm border-l-2 ${
                    convo.id === activeId
                      ? 'bg-blue-50 border-l-blue-600 text-gray-900'
                      : 'border-l-transparent hover:bg-gray-50 text-gray-600'
                  }`}
                  onClick={() => {
                    setActiveId(convo.id);
                    setRateLimited(false);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveId(convo.id);
                      setRateLimited(false);
                    }
                  }}
                >
                  <div className="truncate pr-6">{convo.title || 'New conversation'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {relativeTime(convo.updatedAt)}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(convo.id);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-0.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            {!sidebarOpen &&
              conversations.map((convo) => (
                <button
                  key={convo.id}
                  type="button"
                  onClick={() => {
                    setActiveId(convo.id);
                    setRateLimited(false);
                  }}
                  className={`w-full p-2 flex justify-center ${
                    convo.id === activeId ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title={convo.title || 'Conversation'}
                >
                  <div className="w-2 h-2 rounded-full bg-current" />
                </button>
              ))}
          </div>
        </aside>

        {/* ======================== MOBILE TABS ======================== */}
        <div className="md:hidden flex border-b border-gray-200 bg-white w-full flex-shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${
              mobileTab === 'chat'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('editor')}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${
              mobileTab === 'editor'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            Editor
          </button>
        </div>

        {/* ======================== MAIN PANELS ======================== */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* ==================== CHAT PANEL ==================== */}
          <div
            className={`flex flex-col bg-white ${
              mobileTab === 'chat' ? 'flex' : 'hidden'
            } md:flex md:w-[45%] md:min-w-[320px]`}
          >
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                /* Welcome state */
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent mb-2">
                    CodeShare AI
                  </h2>
                  <p className="text-gray-500 mb-6">
                    Ask me anything about code on the platform
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-w-md w-full mb-6">
                    {SUGGESTION_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => sendMessage(chip)}
                        disabled={loading}
                        className="text-left text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-gray-100 hover:scale-[1.02] transition-all"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Paste code in the editor and ask me about it
                  </p>
                </div>
              ) : (
                /* Message list */
                <div className="space-y-4">
                  {messages.map((msg, msgIndex) => (
                    <div key={msg.id} className="animate-fade-slide-up" style={{ animationDelay: `${msgIndex * 30}ms` }}>
                      {msg.role === 'user' ? (
                        <div className="flex justify-end">
                          <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          {/* AI Avatar */}
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                            AI
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Tool pills */}
                            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {msg.toolsUsed.map((tool, i) => (
                                  <span
                                    key={`${msg.id}-tool-${tool.name}-${i}`}
                                    className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full animate-fade-slide-up"
                                    style={{ animationDelay: `${i * 100}ms` }}
                                  >
                                    {TOOL_LABELS[tool.name] || tool.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Markdown content */}
                            <div className="text-sm text-gray-900 border-l-2 border-purple-200 pl-3 prose-sm max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                                {msg.content}
                              </ReactMarkdown>
                              <PostLinks content={msg.content} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {loading && (
                    <div className="flex gap-3 animate-fade-slide-up">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">
                        AI
                      </div>
                      <div className="flex items-center gap-1 px-3 py-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-dot-1" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-dot-2" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-dot-3" />
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Rate limit warning */}
            {rateLimited && (
              <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Rate limit reached (30/hr). Try again later.
              </div>
            )}

            {/* Input area */}
            <div className="border-t border-gray-200 p-3">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={sendEditorCode}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-purple-600 transition-colors"
                  title="Send editor code to AI"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about code, posts, or users..."
                  rows={1}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm max-h-[150px]"
                />
                <button
                  type="button"
                  onClick={handleSubmitInput}
                  disabled={loading || !input.trim()}
                  className="flex-shrink-0 w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* ==================== DIVIDER ==================== */}
          <div className="hidden md:block w-px bg-gray-200 flex-shrink-0" />

          {/* ==================== EDITOR PANEL ==================== */}
          <div
            className={`flex flex-col bg-white ${
              mobileTab === 'editor' ? 'flex' : 'hidden'
            } md:flex md:flex-1`}
          >
            {/* Editor toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex-wrap">
              <select
                value={editorLanguage}
                onChange={(e) => setEditorLanguage(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang === 'plaintext' ? 'Plain Text' : lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </option>
                ))}
              </select>

              <div className="flex-1" />

              <button
                type="button"
                onClick={() => setEditorCode('')}
                className="text-xs px-2.5 py-1 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={sendEditorCode}
                disabled={loading}
                className="text-xs px-2.5 py-1 text-purple-600 border border-purple-300 rounded-md hover:bg-purple-50 transition-colors disabled:opacity-40"
              >
                Ask AI
              </button>
              <button
                type="button"
                onClick={sendExplain}
                disabled={loading}
                className="text-xs px-2.5 py-1 text-purple-600 border border-purple-300 rounded-md hover:bg-purple-50 transition-colors disabled:opacity-40"
              >
                Explain
              </button>
              <button
                type="button"
                onClick={sendImprove}
                disabled={loading}
                className="text-xs px-2.5 py-1 text-purple-600 border border-purple-300 rounded-md hover:bg-purple-50 transition-colors disabled:opacity-40"
              >
                Improve
              </button>
            </div>

            {/* Editor body */}
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={editorCode}
                language={editorLanguage}
                onChange={setEditorCode}
                height="100%"
                showMinimap
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
