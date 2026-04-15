import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import confetti from 'canvas-confetti';
import api, { intentAPI } from '../services/api';
import { streamAgent } from '../services/agentStream';
import { requestResearch } from '../services/researchStream';
import { streamDeckGeneration } from '../services/deckStream';
import PrizeModal from '../components/PrizeModal';
import { PlanApprovalWidget } from '../components/PlanApprovalWidget';
import type { PrizeAward } from '../types';
import type { PlanProposedEvent, DeliveryStatusEvent } from '../types/agent-events';
import type { PermissionMode } from '../types/blueprint';
import { useAuth } from '../contexts/AuthContext';
import { useComputer } from '../contexts/ComputerContext';
import { useComputerStream } from '../hooks/useComputerStream';
import { ComputerPanel } from '../components/computer';
import WorkspacePanel from '../components/WorkspacePanel';
import PreviewPanel from '../components/PreviewPanel';
import ToolCallCard from '../components/chat/ToolCallCard';
import TaskListCard from '../components/chat/TaskListCard';
import ComputerActivityCard from '../components/chat/ComputerActivityCard';
import { useWorkspace } from '../hooks/useWorkspace';
import { wcManager } from '../lib/webcontainer-manager';
import SettingsModal from '../components/SettingsModal';
import type { ChatMessage } from '../types';
import type { Components } from 'react-markdown';

/**
 * Unified chat transcript item. Position in the array is the render order —
 * never reposition or wrap an existing item; only append new ones. This keeps
 * the rule from the plan (`magical-questing-yeti.md`): tool calls and plan
 * widgets must appear *between* text segments in stream order, never
 * teleported above later text.
 *
 * Phase 3 will extend the union with: 'plan', 'plan-approval', 'delivery-ready'.
 */
interface TaskListTask {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

type ChatItem =
  | { id: string; kind: 'user'; content: string }
  | { id: string; kind: 'assistant-text'; content: string }
  | {
      id: string;
      kind: 'tool-call';
      tool: string;
      input: unknown;
      result?: unknown;
      status: 'running' | 'done' | 'error';
    }
  | {
      id: string;
      kind: 'task-list';
      title: string;
      tasks: TaskListTask[];
      status: 'running' | 'done' | 'error';
    }
  | {
      // Inline thumbnail card anchoring the Mr8's Computer modal.
      // Pushed instead of `tool-call` for browser/python/media tools.
      id: string;
      kind: 'computer-activity';
      timelineEntryId: string;
      fallbackLabel?: string;
    };

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Build the wire-format history the agent endpoint expects. Tool-call items
 *  don't belong in the conversation history — only user/assistant text. */
function toApiHistory(items: ChatItem[]): ChatMessage[] {
  return items
    .filter((m): m is Extract<ChatItem, { kind: 'user' | 'assistant-text' }> =>
      m.kind === 'user' || m.kind === 'assistant-text'
    )
    .map((m) => ({
      role: m.kind === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));
}

function buildMarkdownComponents(): Components {
  return {
    h1: ({ children }) => (
      <h1 className="text-lg font-bold mb-2 mt-3 text-ink dark:text-[#E8E8E8]">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-base font-bold mb-2 mt-3 text-ink dark:text-[#E8E8E8]">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-bold mb-1 mt-2 text-ink dark:text-[#E8E8E8]">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="mb-2 leading-relaxed text-ink-secondary dark:text-[#D4D4D4]">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="ml-5 mb-2 list-disc space-y-1 text-ink-secondary dark:text-[#D4D4D4]">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="ml-5 mb-2 list-decimal space-y-1 text-ink-secondary dark:text-[#D4D4D4]">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed text-ink-secondary dark:text-[#D4D4D4]">{children}</li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-ink dark:text-[#E8E8E8]">{children}</strong>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-brand-orange hover:underline dark:text-[#60A5FA]"
      >
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      const match = /language-(\w+)/.exec(className || '');
      if (match) {
        return (
          <div className="my-2 rounded bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] overflow-x-auto">
            <pre className="p-3 text-[13px] font-mono text-ink-secondary dark:text-[#D4D4D4]">
              <code>{children}</code>
            </pre>
          </div>
        );
      }
      return (
        <code className="bg-surface-tertiary dark:bg-[#2A2A2A] text-ink dark:text-[#E8E8E8] px-1.5 py-0.5 rounded text-[13px] font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }) => <>{children}</>,
  };
}

const SUGGESTION_CHIPS = [
  'Build a todo app with React and Tailwind',
  'Create a weather dashboard',
  'Build a markdown editor',
  'Create a landing page with animations',
];

export default function AIChatPage() {
  const [sessionId] = useState(generateId);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-haiku-4-5-20251001');
  const [editingName, setEditingName] = useState(false);
  const [rightTab, setRightTab] = useState<'code' | 'preview' | 'computer'>('preview');
  // The artifact panel (right side) is auto-revealed on first artifact event
  // (file_write or browser/python tool_call). The user can dismiss it with the
  // X button; dismissal is reset on the next user message so a new turn can
  // surface its own artifact.
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [forceMode, setForceMode] = useState<'auto' | 'code' | 'deck'>('auto');
  const [prize, setPrize] = useState<PrizeAward | null>(null);
  const [activePlan, setActivePlan] = useState<PlanProposedEvent | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusEvent['status'] | null>(null);
  const [acceptingDelivery, setAcceptingDelivery] = useState(false);
  const { refreshUser } = useAuth();
  const computerCtx = useComputer();
  const { start: startComputer } = useComputerStream();

  const workspace = useWorkspace(sessionId);
  const [recentFiles, setRecentFiles] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const initialPromptRef = useRef(false);

  const mdComponents = useMemo(() => buildMarkdownComponents(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    return wcManager.subscribe((state) => {
      setTerminalLogs(state.installLogs + state.devLogs);
    });
  }, []);

  const runCodeFlow = useCallback((trimmed: string) => {
    if (!projectName) setProjectName(trimmed.slice(0, 50));

    const userMsg: ChatItem = { id: `user-${Date.now()}`, kind: 'user', content: trimmed };
    const taskListId = `tasks-${Date.now()}`;
    const taskList: ChatItem = {
      id: taskListId,
      kind: 'task-list',
      title: trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed,
      tasks: [],
      status: 'running',
    };
    setMessages((prev) => [...prev, userMsg, taskList]);
    setInput('');
    setLoading(true);
    setRecentFiles(new Set());

    // Track the active assistant-text item id for this turn. A tool_call
    // closes the current text segment; the next text_delta opens a new one.
    let currentAssistantTextId: string | null = null;

    // Helper: mutate the task-list item created above without disturbing its
    // position in the messages array. Append-only on tasks; status updates only.
    const mutateTaskList = (
      mut: (curr: Extract<ChatItem, { kind: 'task-list' }>) => Extract<ChatItem, { kind: 'task-list' }>
    ) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === taskListId && m.kind === 'task-list' ? mut(m) : m))
      );
    };

    const allMsgs = [...messages, userMsg];
    const history: ChatMessage[] = toApiHistory(allMsgs);

    abortRef.current = streamAgent(history, workspace.toRecord(), {
      onTextDelta(content) {
        if (currentAssistantTextId === null) {
          const id = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          currentAssistantTextId = id;
          setMessages((prev) => [
            ...prev,
            { id, kind: 'assistant-text', content },
          ]);
        } else {
          const id = currentAssistantTextId;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id && m.kind === 'assistant-text'
                ? { ...m, content: m.content + content }
                : m
            )
          );
        }
      },
      onFileWrite(path, content) {
        const isUpdate = workspace.files.has(path);
        workspace.setFile(path, content);
        setRecentFiles((prev) => new Set(prev).add(path));

        // Mirror into the task-list as a "Create / Update [path]" task in done state.
        // Order is the order Mr8 wrote the files in.
        mutateTaskList((curr) => {
          const taskId = `task-file-${path}`;
          const existing = curr.tasks.find((t) => t.id === taskId);
          if (existing) {
            return {
              ...curr,
              tasks: curr.tasks.map((t) =>
                t.id === taskId ? { ...t, status: 'done' as const } : t
              ),
            };
          }
          return {
            ...curr,
            tasks: [
              ...curr.tasks,
              {
                id: taskId,
                label: `${isUpdate ? 'Update' : 'Create'} ${path}`,
                status: 'done',
              },
            ],
          };
        });
      },
      onFileDelete(path) {
        workspace.deleteFile(path);
        mutateTaskList((curr) => ({
          ...curr,
          tasks: [
            ...curr.tasks,
            { id: `task-del-${path}`, label: `Delete ${path}`, status: 'done' },
          ],
        }));
      },
      onToolCall(name, input) {
        const id = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const isComputerTool =
          name === 'browser' ||
          name.startsWith('browser:') ||
          name === 'python_execution' ||
          name === 'generate_image';

        if (isComputerTool) {
          // Push as a computer-activity card — the inline thumbnail anchor.
          // The timelineEntryId here is the *agent tool call id*, but the
          // ComputerContext entry is created independently by useComputerStream
          // when its own SSE events fire. We use the tool-call id as the
          // chat-item id and attempt to bridge to the latest matching
          // TimelineEntry by recency at render time.
          // For now we use the same id; the SSE bridge will reconcile.
          setMessages((prev) => [
            ...prev,
            {
              id,
              kind: 'computer-activity',
              timelineEntryId: id,
              fallbackLabel: name === 'generate_image' ? 'Media viewer' : 'Browser',
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { id, kind: 'tool-call', tool: name, input, status: 'running' },
          ]);
        }

        // Tool call closes the current text segment — next delta starts a new one below.
        currentAssistantTextId = null;

        // Auto-launch the right surface for the kind of work that just started.
        if (name === 'write_file' || name === 'delete_file') {
          setPanelDismissed(false);
          setRightTab((t) => (t === 'computer' ? 'preview' : t));
        }
        if (isComputerTool) {
          setPanelDismissed(false);
          setRightTab('computer');

          // Mirror into the task-list as a single task entry.
          const obj = (input ?? {}) as Record<string, unknown>;
          const action = String(obj.action ?? name.split(':')[1] ?? name);
          const target = String(
            obj.url ?? obj.query ?? obj.selector ?? obj.text ?? obj.prompt ?? action
          ).slice(0, 80);
          mutateTaskList((curr) => ({
            ...curr,
            tasks: [
              ...curr.tasks,
              {
                id: `task-${id}`,
                label:
                  name === 'python_execution'
                    ? `Run python script`
                    : name === 'generate_image'
                      ? `Generate image: ${target}`
                      : `Browser · ${action} ${target}`.trim(),
                status: 'running',
              },
            ],
          }));
        }
      },
      onToolResult() {
        // Mark the most recent running tool-call as done, and the corresponding
        // running task in the task-list. Phase 3 will thread tool_use_id-matched
        // results through; this is the best-effort version.
        setMessages((prev) => {
          let next = prev;
          // Last running tool-call → done
          for (let i = next.length - 1; i >= 0; i--) {
            const m = next[i];
            if (m.kind === 'tool-call' && m.status === 'running') {
              next = next.slice();
              next[i] = { ...m, status: 'done' };
              break;
            }
          }
          // Last running task in the task-list → done
          for (let i = next.length - 1; i >= 0; i--) {
            const m = next[i];
            if (m.kind === 'task-list') {
              const lastRunning = [...m.tasks].reverse().find((t) => t.status === 'running');
              if (lastRunning) {
                next = next.slice();
                next[i] = {
                  ...m,
                  tasks: m.tasks.map((t) =>
                    t.id === lastRunning.id ? { ...t, status: 'done' as const } : t
                  ),
                };
              }
              break;
            }
          }
          return next;
        });
      },
      onPrizeAwarded(award) {
        const colors = ['#FB7701', '#FFB800', '#FFFFFF', '#FF9A3C', '#0B8800'];
        confetti({
          particleCount: 200,
          spread: 110,
          startVelocity: 55,
          origin: { y: 0.55 },
          colors,
          scalar: 1.2,
        });
        setTimeout(() => {
          confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0.1, y: 0.6 }, colors });
          confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 0.9, y: 0.6 }, colors });
        }, 200);
        setPrize(award);
        refreshUser();
      },
      onPlanProposed(event) {
        setActivePlan(event);
        setDeliveryStatus('scoped');
      },
      onDeliveryStatus(event) {
        setDeliveryStatus(event.status);
      },
      onError(message) {
        // If no text yet this turn, surface the error as an assistant-text item.
        setMessages((prev) => {
          if (currentAssistantTextId !== null) return prev;
          return [
            ...prev,
            { id: `asst-err-${Date.now()}`, kind: 'assistant-text', content: message },
          ];
        });
        mutateTaskList((curr) => ({ ...curr, status: 'error' }));
      },
      onDone() {
        setLoading(false);
        abortRef.current = null;

        // Mark the task list complete and any straggling running tasks as done.
        mutateTaskList((curr) => ({
          ...curr,
          status: 'done',
          tasks: curr.tasks.map((t) =>
            t.status === 'running' ? { ...t, status: 'done' as const } : t
          ),
        }));

        // Final fallback: if the agent finished with files but never spoke,
        // append a short assistant note so the transcript isn't silent.
        setMessages((prev) => {
          const wroteText = prev.some(
            (m) => m.kind === 'assistant-text' && m.content.length > 0
          );
          if (wroteText || workspace.files.size === 0) return prev;
          const fileCount = workspace.files.size;
          return [
            ...prev,
            {
              id: `asst-fin-${Date.now()}`,
              kind: 'assistant-text',
              content: `Project ready with ${fileCount} files. Switch to the **Preview** tab to see it live.`,
            },
          ];
        });
      },
    }, selectedModel);
  }, [loading, messages, workspace, projectName, selectedModel]);

  const acceptPlanAndBuild = useCallback(
    (mode: PermissionMode, clearContext: boolean) => {
      if (!activePlan) return;
      const { planId, pricing } = activePlan;
      const acceptanceText = `Accept the plan. id=${planId} dealerCents=${pricing.dealerCents} mode=${mode} clearContext=${clearContext}`;
      setActivePlan(null);
      setDeliveryStatus(null);
      runCodeFlow(acceptanceText);
    },
    [activePlan, runCodeFlow],
  );

  const acceptDelivery = useCallback(async () => {
    if (!activePlan || acceptingDelivery) return;
    setAcceptingDelivery(true);
    try {
      const { data } = await api.post<{ ok: boolean; newBalanceCents: number; priceCents: number }>(
        '/ai/accept-delivery',
        { planId: activePlan.planId, priceCents: activePlan.pricing.dealerCents },
      );
      if (data.ok) {
        setDeliveryStatus('delivered');
        setActivePlan(null);
        refreshUser();
      }
    } catch (err) {
      console.error('accept-delivery failed', err);
    } finally {
      setAcceptingDelivery(false);
    }
  }, [activePlan, acceptingDelivery, refreshUser]);

  const onSpinForDiscount = useCallback(() => {
    // W3 prize orchestrator will handle this. For now, just log.
    console.info('[plan-spine] spin-for-discount requested — awaiting W3 orchestrator');
  }, []);

  const onTellMr8 = useCallback(() => {
    setActivePlan(null);
    setDeliveryStatus(null);
    textareaRef.current?.focus();
  }, []);

  const runComputerFlow = useCallback((trimmed: string) => {
    const userMsg: ChatItem = { id: `user-${Date.now()}`, kind: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    computerCtx.setMode('compact');

    let currentAssistantTextId: string | null = null;
    const allMsgs = [...messages, userMsg];
    const history: ChatMessage[] = toApiHistory(allMsgs);

    startComputer({
      messages: history,
      workspace: workspace.toRecord(),
      model: selectedModel,
      onTextDelta(text) {
        if (currentAssistantTextId === null) {
          const id = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          currentAssistantTextId = id;
          setMessages((prev) => [...prev, { id, kind: 'assistant-text', content: text }]);
        } else {
          const id = currentAssistantTextId;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id && m.kind === 'assistant-text'
                ? { ...m, content: m.content + text }
                : m
            )
          );
        }
      },
      onError(message) {
        setMessages((prev) => {
          if (currentAssistantTextId !== null) return prev;
          return [
            ...prev,
            { id: `asst-err-${Date.now()}`, kind: 'assistant-text', content: message },
          ];
        });
      },
      onDone() {
        setLoading(false);
      },
    });
  }, [messages, workspace, selectedModel, computerCtx, startComputer]);

  /**
   * Inline deck flow — Manus-style. Pushes user msg, an assistant intro,
   * a research tool-call card, then a generate_deck tool-call card whose
   * result counts slides as they stream. On complete, navigate to /decks/:id.
   * No wizard modal, no floating banner.
   */
  const runDeckFlow = useCallback(async (trimmed: string, researchQuery?: string) => {
    setInput('');
    setLoading(true);

    const userMsg: ChatItem = { id: `user-${Date.now()}`, kind: 'user', content: trimmed };
    const intro: ChatItem = {
      id: `asst-${Date.now() + 1}`,
      kind: 'assistant-text',
      content: researchQuery
        ? `I'll research **${researchQuery}** and then build your deck.`
        : `I'll build your deck.`,
    };
    const taskListId = `tasks-${Date.now()}`;
    const initialTasks: TaskListTask[] = [
      ...(researchQuery
        ? [{ id: 'task-research', label: `Research ${researchQuery}`, status: 'running' as const }]
        : []),
      { id: 'task-generate', label: 'Generate slides', status: 'pending' as const },
      { id: 'task-open', label: 'Open deck editor', status: 'pending' as const },
    ];
    const taskList: ChatItem = {
      id: taskListId,
      kind: 'task-list',
      title: trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed,
      tasks: initialTasks,
      status: 'running',
    };
    setMessages((prev) => [...prev, userMsg, intro, taskList]);

    const setTask = (taskId: string, status: TaskListTask['status']) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === taskListId && m.kind === 'task-list'
            ? {
                ...m,
                tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
              }
            : m
        )
      );
    };
    const setOverall = (status: 'running' | 'done' | 'error') => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === taskListId && m.kind === 'task-list' ? { ...m, status } : m
        )
      );
    };

    // 1. Research step (if a query was provided).
    let brief: Awaited<ReturnType<typeof requestResearch>> = null;
    const researchCardId = `tool-research-${Date.now()}`;
    if (researchQuery) {
      setMessages((prev) => [
        ...prev,
        {
          id: researchCardId,
          kind: 'tool-call',
          tool: 'research',
          input: { query: researchQuery },
          status: 'running',
        },
      ]);
      try {
        brief = await requestResearch(researchQuery);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === researchCardId && m.kind === 'tool-call'
              ? {
                  ...m,
                  status: 'done',
                  result: brief
                    ? { facts: brief.keyFacts?.length ?? 0, sources: brief.sources?.length ?? 0 }
                    : { error: 'no brief returned' },
                }
              : m
          )
        );
        setTask('task-research', 'done');
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === researchCardId && m.kind === 'tool-call'
              ? { ...m, status: 'error', result: { error: (err as Error).message } }
              : m
          )
        );
        setTask('task-research', 'error');
      }
    }
    setTask('task-generate', 'running');

    // 2. Generate deck step (always runs, with or without research context).
    const slideCount = 8;
    const genCardId = `tool-gen-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: genCardId,
        kind: 'tool-call',
        tool: 'generate_deck',
        input: { topic: trimmed, slideCount, style: 'professional' },
        status: 'running',
        result: { slidesReceived: 0, slideCount },
      },
    ]);

    abortRef.current = streamDeckGeneration(
      {
        topic: trimmed,
        slideCount,
        style: 'professional',
        ...(brief ? { researchBrief: brief } : {}),
      },
      {
        onStarted() {
          // already pushed
        },
        onSlideReceived(slide) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== genCardId || m.kind !== 'tool-call') return m;
              const r = (m.result ?? {}) as { slidesReceived?: number; slideCount?: number; titles?: string[] };
              const slideTitle =
                (slide.content as { title?: string } | undefined)?.title ??
                `Slide ${(r.slidesReceived ?? 0) + 1}`;
              return {
                ...m,
                result: {
                  slideCount: r.slideCount ?? slideCount,
                  slidesReceived: (r.slidesReceived ?? 0) + 1,
                  titles: [...(r.titles ?? []), slideTitle],
                },
              };
            })
          );
        },
        onComplete({ deckId, slideCount: total }) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === genCardId && m.kind === 'tool-call'
                ? {
                    ...m,
                    status: 'done',
                    result: {
                      slideCount: total,
                      slidesReceived: total,
                      deckId,
                    },
                  }
                : m
            )
          );
          setTask('task-generate', 'done');
          setTask('task-open', 'done');
          setOverall('done');
          setLoading(false);
          navigate(`/decks/${deckId}`);
        },
        onPrizeAwarded(award) {
          setPrize(award);
          refreshUser();
        },
        onError(message) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === genCardId && m.kind === 'tool-call'
                ? { ...m, status: 'error', result: { error: message } }
                : m
            )
          );
          setTask('task-generate', 'error');
          setOverall('error');
          setLoading(false);
        },
      }
    );
  }, [navigate, refreshUser]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Reset any artifact-panel dismissal — a new turn deserves a fresh chance
    // to auto-reveal whatever it produces.
    setPanelDismissed(false);

    // Explicit overrides via the mode toggle
    if (forceMode === 'deck') {
      // Mr8 researches the topic, then builds the deck — fully inline, no modal.
      await runDeckFlow(trimmed, trimmed);
      return;
    }
    if (forceMode === 'code') {
      runCodeFlow(trimmed);
      return;
    }

    // Auto-classify the first message; once conversation has started, stay in code mode.
    if (messages.length === 0) {
      try {
        const result = await intentAPI.classify(trimmed);
        if (result.intent === 'computer' && result.confidence > 0.6) {
          runComputerFlow(trimmed);
          return;
        }
        if (result.intent === 'deck' && result.confidence > 0.7) {
          // Always go straight to the inline deck flow — no confirmation dialog,
          // no wizard. Mr8 just gets to work.
          await runDeckFlow(trimmed, result.researchQuery ?? trimmed);
          return;
        }
      } catch {
        // Intent service is best-effort — fall through to code flow.
      }
    }

    runCodeFlow(trimmed);
  }, [loading, forceMode, messages.length, runCodeFlow, runComputerFlow, runDeckFlow]);

  useEffect(() => {
    if (initialPromptRef.current) return;

    // 1) Highest priority: an adopted anonymous build handed off via sessionStorage.
    // We hydrate the workspace + show the user/assistant messages as if the
    // conversation had already happened, without spending a second API call.
    try {
      const raw = sessionStorage.getItem('mr8-adopted-build');
      if (raw) {
        const parsed = JSON.parse(raw) as {
          prompt: string;
          files: Record<string, string>;
          assistantText: string;
          awardedCents: number;
        };
        initialPromptRef.current = true;
        sessionStorage.removeItem('mr8-adopted-build');

        Object.entries(parsed.files || {}).forEach(([path, content]) => {
          workspace.setFile(path, content);
        });
        setProjectName(parsed.prompt.slice(0, 50));
        setRightTab('preview');

        const uid = `user-${Date.now()}`;
        const aid = `assistant-${Date.now() + 1}`;
        setMessages([
          { id: uid, kind: 'user', content: parsed.prompt },
          {
            id: aid,
            kind: 'assistant-text',
            content:
              parsed.assistantText ||
              'Your preview is live. Say what you want to change and I will extend it.',
          },
        ]);
        return;
      }
    } catch {
      // Malformed handoff — fall through to normal flow
    }

    // 2) Normal navigation: initialPrompt in location state → send it through the agent.
    const state = location.state as { initialPrompt?: string } | null;
    if (state?.initialPrompt) {
      initialPromptRef.current = true;
      sendMessage(state.initialPrompt);
    }
  }, [location.state, sendMessage, workspace]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const handleDownload = useCallback(() => {
    if (workspace.files.size === 0) return;
    import('jszip').then(({ default: JSZip }) => {
      const zip = new JSZip();
      for (const [path, content] of workspace.files) {
        zip.file(path, content);
      }
      zip.generateAsync({ type: 'blob' }).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName || 'project'}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }, [workspace, projectName]);

  const handleShare = useCallback(async () => {
    if (workspace.files.size === 0) return;
    const mainFile = workspace.files.get('src/App.tsx') || workspace.files.get('index.html') || Array.from(workspace.files.values())[0] || 'No code';
    const lang = workspace.files.has('src/App.tsx') ? 'typescript' : 'html';
    const formData = new FormData();
    formData.append('title', projectName || 'Generated App');
    formData.append('code', mainFile.slice(0, 10000));
    formData.append('language', lang);
    formData.append('description', 'Built with Mr8 AI');
    formData.append('files', JSON.stringify(workspace.toRecord()));
    await api.post('/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    navigate('/feed');
  }, [workspace, projectName, navigate]);

  const hasArtifact =
    workspace.files.size > 0 || computerCtx.state.timeline.length > 0;
  const artifactOpen = hasArtifact && !panelDismissed;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0A0A0A]">
      <div className="h-12 flex items-center justify-between px-4 border-b border-edge dark:border-[#1A1A1A] bg-white dark:bg-gradient-to-b dark:from-[#0D1117] dark:to-[#0A0A0A] flex-shrink-0">
        <div className="w-[180px]" />
        <div className="flex items-center gap-1 text-sm text-ink-secondary dark:text-[#A0A0A0]">
          {projectName && (
            editingName ? (
              <input
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(false); }}
                className="bg-transparent text-ink dark:text-[#E8E8E8] text-sm text-center border-b border-brand-orange dark:border-[#3B82F6] focus:outline-none w-60"
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="flex items-center gap-1 text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8] transition-colors">
                <span>{projectName}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#A0A0A0] transition-colors"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {workspace.files.size > 0 && (
            <>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-xs text-ink-secondary dark:text-[#A0A0A0] border border-edge dark:border-[#333] rounded-md hover:text-ink dark:hover:text-[#E8E8E8] hover:border-ink-tertiary dark:hover:border-[#555] transition-colors flex items-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
              </button>
              <button
                onClick={handleShare}
                className="px-3 py-1.5 text-xs text-white bg-brand-orange hover:bg-brand-orange-hover rounded-md transition-colors font-medium"
              >
                Share
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          className={`flex flex-col transition-[width] duration-300 ease-out ${
            artifactOpen
              ? 'w-[420px] min-w-[360px] flex-shrink-0 bg-surface-secondary dark:bg-[#0F0F0F] border-r border-edge dark:border-[#1A1A1A]'
              : 'flex-1 bg-white dark:bg-[#0A0A0A]'
          }`}
        >
          <div
            className={`flex-1 overflow-y-auto px-5 py-4 subtle-scrollbar ${
              artifactOpen ? '' : 'mx-auto w-full max-w-4xl'
            }`}
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[15px] text-ink dark:text-[#E8E8E8]">What do you want to build?</span>
                </div>
                <p className="text-xs text-ink-tertiary dark:text-[#666] mb-6">React + TypeScript + Tailwind apps</p>
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      disabled={loading}
                      className="text-left text-xs text-ink-secondary dark:text-[#A0A0A0] bg-white dark:bg-[#1A1A1A] border border-edge dark:border-[#2A2A2A] rounded-lg px-3 py-2.5 hover:bg-surface-tertiary dark:hover:bg-[#222] hover:text-ink dark:hover:text-[#E8E8E8] transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  if (msg.kind === 'user') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-surface-tertiary dark:bg-[#333] text-ink dark:text-[#E8E8E8] text-[10px] font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                          U
                        </div>
                        <p className="text-sm text-ink dark:text-[#E8E8E8] pt-1">{msg.content}</p>
                      </div>
                    );
                  }
                  if (msg.kind === 'assistant-text') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up text-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    );
                  }
                  if (msg.kind === 'tool-call') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <ToolCallCard
                          tool={msg.tool}
                          input={msg.input}
                          result={msg.result}
                          status={msg.status}
                        />
                      </div>
                    );
                  }
                  if (msg.kind === 'task-list') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <TaskListCard
                          title={msg.title}
                          tasks={msg.tasks}
                          status={msg.status}
                        />
                      </div>
                    );
                  }
                  if (msg.kind === 'computer-activity') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <ComputerActivityCard
                          timelineEntryId={msg.timelineEntryId}
                          fallbackLabel={msg.fallbackLabel}
                        />
                      </div>
                    );
                  }
                  return null;
                })}

                {loading && (
                  <div className="py-2">
                    <span className="text-sm text-shimmer">
                      {workspace.files.size > 0 ? 'Building your app...' : 'Thinking about your project...'}
                    </span>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Plan approval widget — shows above the input when Mr8 has proposed
              a plan but the user hasn't accepted yet. (Phase 3 will move this
              into the chat transcript as a `plan-approval` ChatItem.) */}
          {activePlan && deliveryStatus === 'scoped' && (
            <div
              className={`px-4 pb-2 flex-shrink-0 ${
                artifactOpen ? '' : 'mx-auto w-full max-w-4xl'
              }`}
            >
              <PlanApprovalWidget
                plan={activePlan.plan}
                pricing={activePlan.pricing}
                onAcceptBuild={acceptPlanAndBuild}
                onSpinForDiscount={onSpinForDiscount}
                onTellMr8={onTellMr8}
              />
            </div>
          )}

          {/* Delivery verified — accept & merge debits the wallet. */}
          {deliveryStatus === 'verified' && activePlan && (
            <div
              className={`px-4 pb-2 flex-shrink-0 ${
                artifactOpen ? '' : 'mx-auto w-full max-w-4xl'
              }`}
            >
              <div className="flex items-center justify-between rounded-md border border-brand-green/40 bg-brand-green-soft dark:bg-emerald-950/40 px-3 py-2 text-[11px]">
                <div className="text-brand-green dark:text-emerald-200">
                  Build verified. Accept & Merge to finalize —{' '}
                  <span className="font-semibold">
                    ${(activePlan.pricing.dealerCents / 100).toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={acceptDelivery}
                  disabled={acceptingDelivery}
                  className="rounded bg-brand-green px-3 py-1 font-semibold text-white hover:bg-brand-green-hover disabled:opacity-60"
                >
                  {acceptingDelivery ? 'Debiting…' : 'Accept & Merge'}
                </button>
              </div>
            </div>
          )}

          <div
            className={`p-4 flex-shrink-0 space-y-2.5 ${
              artifactOpen ? '' : 'mx-auto w-full max-w-4xl'
            }`}
          >
            <div className="bg-white dark:bg-[#1A1A1A] border border-edge dark:border-[#333] rounded-xl overflow-hidden shadow-sm">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={forceMode === 'deck' ? 'Describe the deck you want…' : 'How can Mr8 help you today?'}
                rows={1}
                className="w-full px-4 py-3 bg-transparent text-ink dark:text-[#E8E8E8] text-sm resize-none focus:outline-none placeholder:text-ink-tertiary dark:placeholder:text-[#555] max-h-[200px]"
              />
              <div className="flex items-center justify-between px-3 pb-2">
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-[11px] bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] text-ink-secondary dark:text-[#888] rounded px-2 py-1 focus:outline-none focus:border-ink-tertiary dark:focus:border-[#444] cursor-pointer"
                  >
                    <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                    <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                    <option value="claude-opus-4-6">Opus 4.6</option>
                  </select>
                  <select
                    value={forceMode}
                    onChange={(e) => setForceMode(e.target.value as 'auto' | 'code' | 'deck')}
                    className="text-[11px] bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] text-ink-secondary dark:text-[#888] rounded px-2 py-1 focus:outline-none focus:border-ink-tertiary dark:focus:border-[#444] cursor-pointer"
                    title="Choose how Mr8 should respond. 'Auto' lets Mr8 pick the right tool."
                  >
                    <option value="auto">Auto</option>
                    <option value="code">Code app</option>
                    <option value="deck">Slide deck</option>
                  </select>
                </div>
                {/* Inline computer-status chip — shows only when Mr8's Computer
                    has activity but the artifact panel is currently dismissed.
                    Click reopens the panel on the Computer tab. */}
                {computerCtx.state.timeline.length > 0 && !artifactOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setPanelDismissed(false);
                      setRightTab('computer');
                    }}
                    className="flex items-center gap-1.5 text-[11px] bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] text-ink dark:text-[#E8E8E8] rounded px-2 py-1 hover:border-brand-orange dark:hover:border-[#FFB229] transition-colors"
                    title="Open Mr8's Computer"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        computerCtx.state.timeline.some((t) => t.status === 'running')
                          ? 'bg-status-live animate-pulse'
                          : 'bg-status-live'
                      }`}
                    />
                    <span className="font-mono text-ink-secondary dark:text-[#A0A0A0]">
                      Mr8's Computer · {computerCtx.state.timeline.length}
                    </span>
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="w-full py-3.5 bg-brand-orange hover:bg-brand-orange-hover disabled:bg-surface-tertiary dark:disabled:bg-[#2A2A2A] disabled:text-ink-tertiary dark:disabled:text-[#666] disabled:cursor-not-allowed rounded-full text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(251,119,1,0.35)] disabled:shadow-none"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14m-7-7l7 7-7 7" />
              </svg>
              {loading ? 'Working…' : 'Send'}
            </button>
          </div>
        </div>

        {artifactOpen && (
          <div
            className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0A0A0A] animate-fade-slide-up"
            style={{ animationDuration: '300ms' }}
          >
            <div className="flex items-center gap-1 px-3 py-2 border-b border-edge dark:border-[#1A1A1A] flex-shrink-0">
              {workspace.files.size > 0 && (
                <>
                  <button
                    onClick={() => setRightTab('code')}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      rightTab === 'code'
                        ? 'text-brand-orange bg-surface-tertiary dark:bg-[#1A1A1A] font-semibold'
                        : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
                    }`}
                  >
                    Code
                  </button>
                  <button
                    onClick={() => setRightTab('preview')}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      rightTab === 'preview'
                        ? 'text-brand-orange bg-surface-tertiary dark:bg-[#1A1A1A] font-semibold'
                        : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
                    }`}
                  >
                    Preview
                  </button>
                </>
              )}
              {computerCtx.state.timeline.length > 0 && (
                <button
                  onClick={() => setRightTab('computer')}
                  className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1.5 ${
                    rightTab === 'computer'
                      ? 'text-brand-orange bg-surface-tertiary dark:bg-[#1A1A1A] font-semibold'
                      : 'text-[#B37600] dark:text-[#FFB229] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A]'
                  }`}
                  title="Mr8's Computer activity"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      computerCtx.state.timeline.some((t) => t.status === 'running')
                        ? 'bg-status-live animate-pulse'
                        : 'bg-status-live'
                    }`}
                  />
                  Mr8's Computer
                </button>
              )}
              <button
                onClick={() => setPanelDismissed(true)}
                className="ml-auto p-1 rounded text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8] hover:bg-surface-tertiary dark:hover:bg-[#1A1A1A] transition-colors"
                title="Close panel"
                aria-label="Close artifact panel"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 min-h-0">
              {rightTab === 'computer' ? (
                <ComputerPanel />
              ) : rightTab === 'code' ? (
                <WorkspacePanel
                  workspace={workspace}
                  recentFiles={recentFiles}
                  terminalLogs={terminalLogs}
                />
              ) : (
                <PreviewPanel
                  files={workspace.files}
                  isGenerating={loading}
                  fallbackHtml={workspace.previewHtml}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          projectName={projectName}
          onProjectNameChange={setProjectName}
          onClose={() => setShowSettings(false)}
        />
      )}

      {prize && <PrizeModal prize={prize} onClose={() => setPrize(null)} />}
    </div>
  );
}
