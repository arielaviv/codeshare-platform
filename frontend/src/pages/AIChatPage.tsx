import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import confetti from 'canvas-confetti';
import api, { intentAPI } from '../services/api';
import { sessionsApi, type SessionSkill } from '../services/sessionsApi';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
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
import GoalCard, { type GoalAction } from '../components/chat/GoalCard';
import TaskCompletedCard from '../components/chat/TaskCompletedCard';
import FollowUpsCard, { type FollowUpSuggestion } from '../components/chat/FollowUpsCard';
import SpreadsheetViewer, { type SheetData } from '../components/spreadsheet/SpreadsheetViewer';
import { streamSpreadsheetGeneration } from '../services/spreadsheetStream';
import SlidePreviewCard from '../components/chat/SlidePreviewCard';
import ResearchBriefCard from '../components/chat/ResearchBriefCard';
import type { ResearchBrief } from '../types/deck';
import ModeChips from '../components/chat/ModeChips';
import { SAMPLE_PROMPTS } from '../data/sample-prompts';
import type { ForceMode } from '../types/modes';
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
    }
  | {
      // Manus-style goal card with action chips inside.
      id: string;
      kind: 'goal';
      goalId: string;
      title: string;
      status: 'running' | 'done' | 'error';
      actions: GoalAction[];
      summary?: string;
    }
  | {
      // Green check pill at end of turn + 5-star rating.
      id: string;
      kind: 'task-completed';
    }
  | {
      // Commerce/SOUL-driven follow-up cards.
      id: string;
      kind: 'follow-ups';
      suggestions: FollowUpSuggestion[];
    }
  | {
      // Phase 7: plan approval inline in the transcript.
      id: string;
      kind: 'plan-approval';
      planEvent: PlanProposedEvent;
      status: 'pending' | 'accepted' | 'rejected';
    }
  | {
      // Phase 7: delivery-ready (Accept & Merge) inline in the transcript.
      id: string;
      kind: 'delivery-ready';
      planEvent: PlanProposedEvent;
      status: 'pending' | 'accepted' | 'rejected';
    }
  | {
      // Phase 7: charged confirmation inline — shown on wallet debit success.
      id: string;
      kind: 'charged';
      amountCents: number;
      newBalanceCents: number;
    }
  | {
      // Phase 4L: slide preview card, pushed as each slide streams in.
      id: string;
      kind: 'slide-preview';
      deckId: string;
      slideId: string;
      slideNumber: number;
      totalSlides: number;
      title: string;
      subtitle?: string;
      bulletCount?: number;
      slideType?: string;
    }
  | {
      // Phase 9D: Wide Research result card.
      id: string;
      kind: 'research-brief';
      brief: ResearchBrief;
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

// SUGGESTION_CHIPS replaced by SAMPLE_PROMPTS (per-mode, see data/sample-prompts.ts)

export default function AIChatPage() {
  const [sessionId] = useState(generateId);
  // Server-side ChatSession id (Phase 6). Created on first user message.
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  useDocumentTitle(sessionTitle);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-haiku-4-5-20251001');
  const [editingName, setEditingName] = useState(false);
  const [rightTab, setRightTab] = useState<'code' | 'preview' | 'computer' | 'sheet'>('preview');
  // Active spreadsheet artifact (Phase 4G). Streams in row-by-row.
  const [activeSheets, setActiveSheets] = useState<SheetData[]>([]);
  const [activeSheetTitle, setActiveSheetTitle] = useState<string>('');
  const [sheetStreaming, setSheetStreaming] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_activeSpreadsheetId, setActiveSpreadsheetId] = useState<string | null>(null);
  // The artifact panel (right side) is auto-revealed on first artifact event
  // (file_write or browser/python tool_call). The user can dismiss it with the
  // X button; dismissal is reset on the next user message so a new turn can
  // surface its own artifact.
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [forceMode, setForceMode] = useState<ForceMode>('auto');
  const [prize, setPrize] = useState<PrizeAward | null>(null);
  const [activePlan, setActivePlan] = useState<PlanProposedEvent | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusEvent['status'] | null>(null);
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

    // Track the active goal id this turn. When set, tool_calls become
    // action chips inside that goal instead of standalone ChatItems.
    // Cleared on goal_completed.
    let currentGoalChatId: string | null = null;

    // Helper: mutate the goal card at currentGoalChatId
    const mutateGoal = (
      mut: (curr: Extract<ChatItem, { kind: 'goal' }>) => Extract<ChatItem, { kind: 'goal' }>
    ) => {
      if (!currentGoalChatId) return;
      const goalChatId = currentGoalChatId;
      setMessages((prev) =>
        prev.map((m) => (m.id === goalChatId && m.kind === 'goal' ? mut(m) : m))
      );
    };

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

        // propose_goal / complete_goal are routed via dedicated SSE events
        // (goal_started / goal_completed); they don't render as chips.
        if (name === 'propose_goal' || name === 'complete_goal') {
          currentAssistantTextId = null;
          return;
        }

        const isComputerTool =
          name === 'browser' ||
          name.startsWith('browser:') ||
          name === 'python_execution' ||
          name === 'generate_image';

        // If a goal is open, route the tool call into the goal as an action chip.
        if (currentGoalChatId) {
          const obj = (input ?? {}) as Record<string, unknown>;
          const action = String(obj.action ?? name.split(':')[1] ?? name);
          const target = String(
            obj.url ?? obj.query ?? obj.selector ?? obj.text ?? obj.prompt ?? obj.path ?? action
          );
          const chipKind: GoalAction['kind'] =
            name === 'browser:search' || (name === 'browser' && action === 'search')
              ? 'search'
              : name.startsWith('browser')
                ? 'browse'
                : name === 'python_execution'
                  ? 'python'
                  : name === 'generate_image'
                    ? 'image'
                    : name === 'write_file'
                      ? 'write'
                      : name === 'delete_file'
                        ? 'delete'
                        : 'browse';
          mutateGoal((curr) => ({
            ...curr,
            actions: [
              ...curr.actions,
              {
                id: `act-${id}`,
                kind: chipKind,
                label: target.slice(0, 120) || action,
                timelineEntryId: isComputerTool ? id : undefined,
                status: 'running',
              },
            ],
          }));
          currentAssistantTextId = null;
          // Auto-launch surfaces just like before.
          if (name === 'write_file' || name === 'delete_file') {
            setPanelDismissed(false);
            setRightTab((t) => (t === 'computer' ? 'preview' : t));
          }
          if (isComputerTool) {
            setPanelDismissed(false);
            setRightTab('computer');
          }
          return;
        }

        if (isComputerTool) {
          // Push as a computer-activity card (no goal open).
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
      onGoalStarted(event) {
        const chatId = `goal-${event.goalId}`;
        currentGoalChatId = chatId;
        // Initial actions seeded from plannedActions (pending state).
        const initialActions: GoalAction[] = (event.plannedActions ?? []).map((label, i) => ({
          id: `act-planned-${event.goalId}-${i}`,
          kind: 'browse',
          label,
          status: 'running',
        }));
        setMessages((prev) => [
          ...prev,
          {
            id: chatId,
            kind: 'goal',
            goalId: event.goalId,
            title: event.title,
            status: 'running',
            actions: initialActions,
          },
        ]);
        currentAssistantTextId = null;
      },
      onMediaGenerating(event) {
        // Dispatch into ComputerContext so the inline ComputerActivityCard
        // and the modal both pick up the in-progress state.
        // We use the most recent generate_image computer-activity ChatItem's
        // timelineEntryId as the entry id so frontend bridges line up.
        const entryId = (() => {
          const lastActivity = [...messages].reverse().find(
            (m) => m.kind === 'computer-activity' && (m.fallbackLabel === 'Media viewer')
          );
          return lastActivity?.id ?? `media-${Date.now()}`;
        })();
        computerCtx.dispatch({
          type: 'media-generating',
          id: entryId,
          prompt: event.prompt,
          model: event.model,
        });
      },
      onFollowUpsProposed(event) {
        setMessages((prev) => [
          ...prev,
          {
            id: `follow-${Date.now()}`,
            kind: 'follow-ups',
            suggestions: event.suggestions,
          },
        ]);
      },
      onMediaReady(event) {
        const entryId = (() => {
          const lastActivity = [...messages].reverse().find(
            (m) => m.kind === 'computer-activity' && (m.fallbackLabel === 'Media viewer')
          );
          return lastActivity?.id ?? `media-${Date.now()}`;
        })();
        computerCtx.dispatch({
          type: 'media-ready',
          id: entryId,
          imageUrl: event.imageUrl,
          path: event.path,
          width: event.width,
          height: event.height,
        });
      },
      onGoalCompleted(event) {
        if (!currentGoalChatId) return;
        const goalChatId = currentGoalChatId;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === goalChatId && m.kind === 'goal'
              ? {
                  ...m,
                  status: event.status,
                  summary: event.summary,
                  // Mark all running actions as done.
                  actions: m.actions.map((a) =>
                    a.status === 'running' ? { ...a, status: 'done' as const } : a
                  ),
                }
              : m
          )
        );
        currentGoalChatId = null;
        currentAssistantTextId = null;
      },
      onToolResult() {
        // Mark the most recent running tool-call as done, and the corresponding
        // running task in the task-list. Phase 3 will thread tool_use_id-matched
        // results through; this is the best-effort version.
        // Also bubbles into the active goal: marks last running action chip as done.
        if (currentGoalChatId) {
          const goalChatId = currentGoalChatId;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== goalChatId || m.kind !== 'goal') return m;
              const lastRunningIdx = [...m.actions].map((a, i) => ({ a, i })).reverse().find((p) => p.a.status === 'running')?.i;
              if (lastRunningIdx === undefined) return m;
              const next = m.actions.slice();
              next[lastRunningIdx] = { ...next[lastRunningIdx], status: 'done' };
              return { ...m, actions: next };
            })
          );
        }
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
        // Keep state for the handlers (activePlan/deliveryStatus used by
        // acceptPlanAndBuild / acceptDelivery callbacks).
        setActivePlan(event);
        setDeliveryStatus('scoped');
        // Also push as inline ChatItem (Phase 7 move off sticky bar).
        setMessages((prev) => [
          ...prev,
          {
            id: `plan-${event.planId}`,
            kind: 'plan-approval',
            planEvent: event,
            status: 'pending',
          },
        ]);
      },
      onDeliveryStatus(event) {
        setDeliveryStatus(event.status);
        if (event.status === 'verified' && activePlan) {
          // Push delivery-ready inline. Status becomes 'accepted' after user accepts.
          setMessages((prev) => {
            // Mark previous plan-approval as accepted since we're now past scoping.
            const withAccepted = prev.map((m) =>
              m.kind === 'plan-approval' && m.status === 'pending'
                ? { ...m, status: 'accepted' as const }
                : m
            );
            return [
              ...withAccepted,
              {
                id: `delivery-${event.planId || activePlan.planId}`,
                kind: 'delivery-ready',
                planEvent: activePlan,
                status: 'pending',
              },
            ];
          });
        }
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

        // Append a task-completed pill if the agent actually did meaningful work
        // (wrote files, opened goals, generated media). The follow-ups card is
        // pushed separately by onFollowUpsProposed; if the agent didn't call
        // suggest_follow_ups, no card appears (acceptable).
        setMessages((prev) => {
          const did = prev.some(
            (m) =>
              m.kind === 'goal' ||
              m.kind === 'computer-activity' ||
              (m.kind === 'tool-call' && m.tool === 'write_file')
          );
          if (!did) return prev;
          // Only one task-completed pill per turn (don't dup if already present).
          const alreadyHas = prev[prev.length - 1]?.kind === 'task-completed' || prev[prev.length - 1]?.kind === 'follow-ups';
          if (alreadyHas) return prev;
          return [...prev, { id: `done-${Date.now()}`, kind: 'task-completed' }];
        });

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

  /**
   * Wide Research mode (9D). Calls existing /api/ai/research SSE; pushes
   * goal card with browser-action chips as they arrive; on completion
   * pushes a research-brief ChatItem inline.
   */
  const runResearchFlow = useCallback(async (trimmed: string) => {
    setInput('');
    setLoading(true);

    const userMsg: ChatItem = { id: `user-${Date.now()}`, kind: 'user', content: trimmed };
    const intro: ChatItem = {
      id: `asst-${Date.now() + 1}`,
      kind: 'assistant-text',
      content: `I'll research **${trimmed}** by visiting multiple sources and synthesizing a brief.`,
    };
    const goalId = `goal-research-${Date.now()}`;
    const goalChat: ChatItem = {
      id: goalId,
      kind: 'goal',
      goalId,
      title: `Research: ${trimmed}`,
      status: 'running',
      actions: [],
    };
    setMessages((prev) => [...prev, userMsg, intro, goalChat]);

    try {
      const brief = await requestResearch(trimmed, {
        onProgress: (msg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === goalId && m.kind === 'goal'
                ? {
                    ...m,
                    actions: [
                      ...m.actions,
                      {
                        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        kind: msg.startsWith('browser search') ? 'search' : 'browse',
                        label: msg.replace(/^browser \w+\s*/, '').slice(0, 100) || msg,
                        status: 'done',
                      },
                    ],
                  }
                : m
            )
          );
        },
      });

      setMessages((prev) => {
        const closed = prev.map((m) =>
          m.id === goalId && m.kind === 'goal'
            ? { ...m, status: 'done' as const, summary: brief?.summary }
            : m
        );
        if (!brief) {
          return [
            ...closed,
            {
              id: `asst-err-${Date.now()}`,
              kind: 'assistant-text',
              content: 'Research did not return a brief. Try rephrasing the query.',
            },
          ];
        }
        return [
          ...closed,
          { id: `brief-${Date.now()}`, kind: 'research-brief', brief },
        ];
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === goalId && m.kind === 'goal' ? { ...m, status: 'error' as const } : m
        )
      );
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { id: `asst-err-${Date.now()}`, kind: 'assistant-text', content: message },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Chat mode (9G) — Q&A without tools. Reuses the agent stream but with
   * `chatOnly: true` so the backend strips tools and uses a minimal system
   * prompt. No goals, no task list, no artifact panel.
   */
  const runChatOnlyFlow = useCallback((trimmed: string) => {
    setInput('');
    setLoading(true);

    const userMsg: ChatItem = { id: `user-${Date.now()}`, kind: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);

    let currentAssistantTextId: string | null = null;
    const allMsgs = [...messages, userMsg];
    const history: ChatMessage[] = toApiHistory(allMsgs);

    abortRef.current = streamAgent(
      history,
      {},
      {
        onTextDelta(content) {
          if (currentAssistantTextId === null) {
            const id = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            currentAssistantTextId = id;
            setMessages((prev) => [...prev, { id, kind: 'assistant-text', content }]);
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
        onFileWrite() { /* no-op in chat mode */ },
        onFileDelete() { /* no-op */ },
        onToolCall() { /* no-op — tools are disabled */ },
        onToolResult() { /* no-op */ },
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
          abortRef.current = null;
        },
      },
      'claude-haiku-4-5-20251001',
      { chatOnly: true },
    );
  }, [messages]);

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
        // Mutate the delivery-ready ChatItem to accepted + push a charged pill inline.
        setMessages((prev) => {
          const withAccepted = prev.map((m) =>
            m.kind === 'delivery-ready' && m.status === 'pending'
              ? { ...m, status: 'accepted' as const }
              : m
          );
          return [
            ...withAccepted,
            {
              id: `charged-${Date.now()}`,
              kind: 'charged',
              amountCents: data.priceCents,
              newBalanceCents: data.newBalanceCents,
            },
          ];
        });
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
          setMessages((prev) => {
            // 1) Update the tool-call card counter.
            const updated = prev.map((m) => {
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
            });

            // 2) Push a slide-preview ChatItem inline (Phase 4L, Manus #16).
            //    deckId is '' until onComplete fires; we patch it afterward.
            const content = slide.content as {
              title?: string;
              subtitle?: string;
              bullets?: string[];
            } | undefined;
            const priorPreviews = updated.filter((m) => m.kind === 'slide-preview').length;
            const slideNumber = priorPreviews + 1;
            return [
              ...updated,
              {
                id: `slide-${slide.id}`,
                kind: 'slide-preview',
                deckId: '', // filled in by onComplete
                slideId: slide.id,
                slideNumber,
                totalSlides: slideCount,
                title: content?.title ?? `Slide ${slideNumber}`,
                subtitle: content?.subtitle,
                bulletCount: Array.isArray(content?.bullets) ? content.bullets.length : undefined,
                slideType: slide.type,
              },
            ];
          });
        },
        onComplete({ deckId, slideCount: total }) {
          setMessages((prev) =>
            prev.map((m) => {
              // Patch deckId into all slide-preview items from this turn.
              if (m.kind === 'slide-preview' && !m.deckId) {
                return { ...m, deckId, totalSlides: total };
              }
              if (m.id === genCardId && m.kind === 'tool-call') {
                return {
                  ...m,
                  status: 'done' as const,
                  result: {
                    slideCount: total,
                    slidesReceived: total,
                    deckId,
                  },
                };
              }
              return m;
            })
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

  /**
   * Spreadsheet skill flow. Streams sheets row-by-row into the artifact
   * panel, pushes inline assistant messaging + a task list.
   */
  const runSpreadsheetFlow = useCallback(async (trimmed: string) => {
    setInput('');
    setLoading(true);
    setActiveSheets([]);
    setActiveSheetTitle('');
    setSheetStreaming(true);
    setPanelDismissed(false);
    setRightTab('sheet');

    const userMsg: ChatItem = { id: `user-${Date.now()}`, kind: 'user', content: trimmed };
    const intro: ChatItem = {
      id: `asst-${Date.now() + 1}`,
      kind: 'assistant-text',
      content: `I'll build your spreadsheet.`,
    };
    const taskListId = `tasks-${Date.now()}`;
    const taskList: ChatItem = {
      id: taskListId,
      kind: 'task-list',
      title: trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed,
      tasks: [
        { id: 'task-gen', label: 'Generate sheet structure', status: 'running' },
        { id: 'task-rows', label: 'Stream rows into the viewer', status: 'pending' },
        { id: 'task-save', label: 'Save spreadsheet', status: 'pending' },
      ],
      status: 'running',
    };
    setMessages((prev) => [...prev, userMsg, intro, taskList]);

    const setTask = (taskId: string, status: TaskListTask['status']) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === taskListId && m.kind === 'task-list'
            ? { ...m, tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }
            : m
        )
      );
    };
    const setOverall = (status: 'running' | 'done' | 'error') => {
      setMessages((prev) =>
        prev.map((m) => (m.id === taskListId && m.kind === 'task-list' ? { ...m, status } : m))
      );
    };

    abortRef.current = streamSpreadsheetGeneration(
      { topic: trimmed, sessionId: serverSessionId ?? undefined },
      {
        onStarted() {
          // nothing extra
        },
        onSheetMeta(meta) {
          if (meta.index === 0) setTask('task-gen', 'done');
          setTask('task-rows', 'running');
          setActiveSheets((prev) => {
            const next = [...prev];
            next[meta.index] = { name: meta.name, rows: [] };
            return next;
          });
        },
        onSheetRow(row) {
          setActiveSheets((prev) => {
            const next = prev.slice();
            const sheet = next[row.sheetIndex] ?? { name: `Sheet ${row.sheetIndex + 1}`, rows: [] };
            const rows = sheet.rows.slice();
            rows[row.rowIndex] = row.cells;
            next[row.sheetIndex] = { ...sheet, rows };
            return next;
          });
        },
        onCompleted(done) {
          setActiveSheetTitle(done.title);
          setActiveSpreadsheetId(done.sheetId);
          setSheetStreaming(false);
          setTask('task-rows', 'done');
          setTask('task-save', 'done');
          setOverall('done');
          setLoading(false);
        },
        onError(msg) {
          setSheetStreaming(false);
          setTask('task-gen', 'error');
          setOverall('error');
          setLoading(false);
          setMessages((prev) => [
            ...prev,
            { id: `asst-err-${Date.now()}`, kind: 'assistant-text', content: msg },
          ]);
        },
      }
    );
  }, [serverSessionId]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Reset any artifact-panel dismissal — a new turn deserves a fresh chance
    // to auto-reveal whatever it produces.
    setPanelDismissed(false);

    // Phase 6: on first user message, create a server-side ChatSession so we
    // can name it (Haiku async), persist usage, and rehydrate later.
    if (!serverSessionId) {
      const inferredSkill: SessionSkill =
        forceMode === 'deck'
          ? 'slides'
          : forceMode === 'design'
            ? 'design'
            : forceMode === 'sheet'
              ? 'sheet'
              : forceMode === 'code'
                ? 'apps'
                : 'unknown';
      try {
        const created = await sessionsApi.create(trimmed, inferredSkill);
        setServerSessionId(created.id);
        setSessionTitle(created.title);
        // Update URL with ?session= so refresh keeps the session.
        const u = new URL(window.location.href);
        u.searchParams.set('session', created.id);
        window.history.replaceState({}, '', u.toString());

        // Poll for the Haiku-named title (async on the server).
        const start = Date.now();
        const poll = setInterval(async () => {
          if (Date.now() - start > 10_000) {
            clearInterval(poll);
            return;
          }
          try {
            const detail = await sessionsApi.get(created.id);
            if (detail.titleStatus === 'named' || detail.titleStatus === 'failed') {
              setSessionTitle(detail.title);
              clearInterval(poll);
            } else {
              setSessionTitle(detail.title);
            }
          } catch {
            // ignore
          }
        }, 1500);
      } catch {
        // Session creation is best-effort; the chat still works without it.
      }
    }

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
    if (forceMode === 'design') {
      // Design mode hint — instruct the agent to call generate_image instead of
      // writing app files. The agent's system prompt already knows about the tool;
      // this just nudges intent.
      runCodeFlow(`Generate a design image for: ${trimmed}\n\nUse the generate_image tool. Do not write app files.`);
      return;
    }
    if (forceMode === 'sheet') {
      await runSpreadsheetFlow(trimmed);
      return;
    }
    if (forceMode === 'chat') {
      runChatOnlyFlow(trimmed);
      return;
    }
    if (forceMode === 'research') {
      await runResearchFlow(trimmed);
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
    workspace.files.size > 0 ||
    computerCtx.state.timeline.length > 0 ||
    activeSheets.length > 0;
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
              <div className="flex flex-col items-center justify-center h-full gap-6">
                <div className="text-center">
                  <h1 className="text-3xl font-bold text-ink dark:text-[#E8E8E8] mb-2">
                    What can I do for you?
                  </h1>
                  <p className="text-xs text-ink-tertiary dark:text-[#666]">
                    Pick a skill, or just describe what you want.
                  </p>
                </div>
                {/* Mode-specific sample prompts (Manus image #62/#63 pattern) */}
                <div className="w-full max-w-2xl space-y-1.5">
                  {(SAMPLE_PROMPTS[forceMode] ?? SAMPLE_PROMPTS.auto).map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      disabled={loading}
                      className="w-full flex items-center gap-2 text-left text-sm text-ink dark:text-[#E8E8E8] bg-white dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg px-4 py-3 hover:border-ink-tertiary dark:hover:border-[#444] transition-colors group"
                    >
                      <span className="flex-1 truncate">{chip}</span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="text-ink-tertiary dark:text-[#666] flex-shrink-0 group-hover:text-brand-orange transition-colors"
                      >
                        <path d="M7 17L17 7" />
                        <polyline points="17 17 7 17 7 7" transform="rotate(180 12 12)" />
                      </svg>
                    </button>
                  ))}
                </div>
                {/* Mode chips (primary + More popover) */}
                <ModeChips
                  selectedMode={forceMode}
                  onSelect={(m) => {
                    setForceMode(m);
                    textareaRef.current?.focus();
                  }}
                />
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
                  if (msg.kind === 'goal') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <GoalCard
                          title={msg.title}
                          status={msg.status}
                          actions={msg.actions}
                          summary={msg.summary}
                        />
                      </div>
                    );
                  }
                  if (msg.kind === 'task-completed') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <TaskCompletedCard />
                      </div>
                    );
                  }
                  if (msg.kind === 'follow-ups') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <FollowUpsCard
                          suggestions={msg.suggestions}
                          onSendPrompt={(p) => sendMessage(p)}
                          onOpenModal={() => {
                            // PersonalizationModal & TopUpModal mounts come in Phase 6 PersonalizationModal task;
                            // for now a no-op so the click doesn't error.
                          }}
                        />
                      </div>
                    );
                  }
                  if (msg.kind === 'plan-approval') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <PlanApprovalWidget
                          plan={msg.planEvent.plan}
                          pricing={msg.planEvent.pricing}
                          onAcceptBuild={msg.status === 'pending' ? acceptPlanAndBuild : () => {}}
                          onSpinForDiscount={msg.status === 'pending' ? onSpinForDiscount : () => {}}
                          onTellMr8={msg.status === 'pending' ? onTellMr8 : () => {}}
                        />
                      </div>
                    );
                  }
                  if (msg.kind === 'delivery-ready') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up my-3">
                        <div className="flex items-center justify-between rounded-md border border-brand-green/40 bg-brand-green-soft dark:bg-emerald-950/40 px-3 py-2 text-[11px]">
                          <div className="text-brand-green dark:text-emerald-200">
                            Build verified. Accept & Merge to finalize —{' '}
                            <span className="font-semibold">
                              ${(msg.planEvent.pricing.dealerCents / 100).toFixed(2)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={msg.status === 'pending' ? acceptDelivery : undefined}
                            disabled={msg.status !== 'pending' || acceptingDelivery}
                            className="rounded bg-brand-green px-3 py-1 font-semibold text-white hover:bg-brand-green-hover disabled:opacity-60"
                          >
                            {msg.status === 'accepted' ? 'Accepted' : acceptingDelivery ? 'Debiting…' : 'Accept & Merge'}
                          </button>
                        </div>
                      </div>
                    );
                  }
                  if (msg.kind === 'charged') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up my-2 inline-flex items-center gap-2 text-[12px] bg-brand-green-soft dark:bg-emerald-950/40 text-brand-green dark:text-emerald-200 rounded-full px-3 py-1.5 border border-brand-green/30">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Charged ${(msg.amountCents / 100).toFixed(2)} · balance ${(msg.newBalanceCents / 100).toFixed(2)}
                      </div>
                    );
                  }
                  if (msg.kind === 'slide-preview') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <SlidePreviewCard
                          deckId={msg.deckId}
                          slideId={msg.slideId}
                          slideNumber={msg.slideNumber}
                          totalSlides={msg.totalSlides}
                          title={msg.title}
                          subtitle={msg.subtitle}
                          bulletCount={msg.bulletCount}
                          slideType={msg.slideType}
                        />
                      </div>
                    );
                  }
                  if (msg.kind === 'research-brief') {
                    return (
                      <div key={msg.id} className="animate-fade-slide-up">
                        <ResearchBriefCard brief={msg.brief} />
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

          {/* Plan approval + delivery-ready + charged now live inline as
              ChatItem kinds (Phase 7). No sticky bars above the input. */}

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
                    onChange={(e) => setForceMode(e.target.value as ForceMode)}
                    className="text-[11px] bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] text-ink-secondary dark:text-[#888] rounded px-2 py-1 focus:outline-none focus:border-ink-tertiary dark:focus:border-[#444] cursor-pointer"
                    title="Choose how Mr8 should respond. 'Auto' lets Mr8 pick the right tool."
                  >
                    <option value="auto">Auto</option>
                    <option value="code">Develop apps</option>
                    <option value="schedule">Schedule task</option>
                    <option value="research">Wide Research</option>
                    <option value="sheet">Spreadsheet</option>
                    <option value="visualization">Visualization</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="chat">Chat mode</option>
                    <option value="deck">Slide deck</option>
                    <option value="design">Design</option>
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
              {activeSheets.length > 0 && (
                <button
                  onClick={() => setRightTab('sheet')}
                  className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1.5 ${
                    rightTab === 'sheet'
                      ? 'text-brand-orange bg-surface-tertiary dark:bg-[#1A1A1A] font-semibold'
                      : 'text-ink-tertiary dark:text-[#666] hover:text-ink-secondary dark:hover:text-[#A0A0A0]'
                  }`}
                  title="Spreadsheet"
                >
                  {sheetStreaming && <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />}
                  Sheet
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
              ) : rightTab === 'sheet' ? (
                <SpreadsheetViewer
                  sheets={activeSheets}
                  title={activeSheetTitle}
                  streaming={sheetStreaming}
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
