import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import confetti from 'canvas-confetti';
import api, { intentAPI } from '../services/api';
import { streamAgent } from '../services/agentStream';
import { requestResearch } from '../services/researchStream';
import GenerateDeckModal from '../components/decks/GenerateDeckModal';
import PrizeModal from '../components/PrizeModal';
import { PlanApprovalWidget } from '../components/PlanApprovalWidget';
import type { PrizeAward } from '../types';
import type { PlanProposedEvent, DeliveryStatusEvent } from '../types/agent-events';
import type { PermissionMode } from '../types/blueprint';
import { useAuth } from '../contexts/AuthContext';
import { useComputer } from '../contexts/ComputerContext';
import { useComputerStream } from '../hooks/useComputerStream';
import { ComputerPanel } from '../components/computer';
import type { ResearchBrief } from '../types/deck';
import WorkspacePanel from '../components/WorkspacePanel';
import PreviewPanel from '../components/PreviewPanel';
import ActionCard from '../components/ActionCard';
import type { ActionStep } from '../components/ActionCard';
import { useWorkspace } from '../hooks/useWorkspace';
import { wcManager } from '../lib/webcontainer-manager';
import SettingsModal from '../components/SettingsModal';
import type { ChatMessage, ToolUsed } from '../types';
import type { Components } from 'react-markdown';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: ToolUsed[];
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildMarkdownComponents(): Components {
  return {
    h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 text-[#E8E8E8]">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 text-[#E8E8E8]">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 text-[#E8E8E8]">{children}</h3>,
    p: ({ children }) => <p className="mb-2 leading-relaxed text-[#D4D4D4]">{children}</p>,
    ul: ({ children }) => <ul className="ml-5 mb-2 list-disc space-y-1 text-[#D4D4D4]">{children}</ul>,
    ol: ({ children }) => <ol className="ml-5 mb-2 list-decimal space-y-1 text-[#D4D4D4]">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed text-[#D4D4D4]">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-[#E8E8E8]">{children}</strong>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" className="text-[#60A5FA] hover:underline">{children}</a>
    ),
    code: ({ className, children }) => {
      const match = /language-(\w+)/.exec(className || '');
      if (match) {
        return (
          <div className="my-2 rounded bg-[#141414] border border-[#2A2A2A] overflow-x-auto">
            <pre className="p-3 text-[13px] font-mono text-[#D4D4D4]"><code>{children}</code></pre>
          </div>
        );
      }
      return <code className="bg-[#2A2A2A] text-[#E8E8E8] px-1.5 py-0.5 rounded text-[13px] font-mono">{children}</code>;
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
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-haiku-4-5-20251001');
  const [editingName, setEditingName] = useState(false);
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code');
  const [actionSteps, setActionSteps] = useState<ActionStep[]>([]);
  const [actionTitle, setActionTitle] = useState('');
  const [actionExpanded, setActionExpanded] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [deckConfirm, setDeckConfirm] = useState<{ prompt: string; confidence: number } | null>(null);
  const [deckModalPrompt, setDeckModalPrompt] = useState<string | null>(null);
  const [deckModalBrief, setDeckModalBrief] = useState<ResearchBrief | undefined>(undefined);
  const [forceMode, setForceMode] = useState<'auto' | 'code' | 'deck' | 'computer'>('auto');
  const [researching, setResearching] = useState<string | null>(null);
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
  }, [messages, loading, actionSteps]);

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

    const userMsg: DisplayMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setRecentFiles(new Set());

    setActionTitle(trimmed.slice(0, 60));
    setActionSteps([{ id: 'init', label: 'Create initial files', status: 'active' }]);
    setActionExpanded(true);

    const assistantId = `assistant-${Date.now()}`;
    let textContent = '';
    const toolsCollected: ToolUsed[] = [];
    let initDone = false;

    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', toolsUsed: [] }]);

    const allMsgs = [...messages, userMsg];
    const history: ChatMessage[] = allMsgs.map((m) => ({ role: m.role, content: m.content }));

    abortRef.current = streamAgent(history, workspace.toRecord(), {
      onTextDelta(content) {
        textContent += content;
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: textContent } : m));
      },
      onFileWrite(path, content) {
        const isUpdate = workspace.files.has(path);
        workspace.setFile(path, content);
        setRecentFiles((prev) => new Set(prev).add(path));

        if (!initDone) {
          setActionSteps((prev) => prev.map((s) => s.id === 'init' ? { ...s, status: 'done' } : s));
          initDone = true;
        }
        const stepId = `file-${path}-${Date.now()}`;
        setActionSteps((prev) => [
          ...prev.map((s) => s.status === 'active' ? { ...s, status: 'done' as const } : s),
          { id: stepId, label: `${isUpdate ? 'Update' : 'Create'} ${path}`, path, status: 'done' },
        ]);
      },
      onFileDelete(path) {
        workspace.deleteFile(path);
      },
      onToolCall(name, input) {
        toolsCollected.push({ name, input });
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, toolsUsed: [...toolsCollected] } : m));

        if (name === 'write_file' && (input as Record<string, string>).path === 'package.json') {
          setActionSteps((prev) => [
            ...prev,
            { id: 'pkg', label: 'Update package.json', status: 'active' },
          ]);
        }
      },
      onToolResult() {},
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
        if (!textContent) {
          textContent = message;
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: textContent } : m));
        }
      },
      onDone() {
        setLoading(false);
        abortRef.current = null;
        setActionSteps((prev) => prev.map((s) => ({ ...s, status: 'done' as const })));

        if (workspace.files.has('package.json')) {
          setActionSteps((prev) => [
            ...prev,
            { id: 'install', label: 'Install dependencies', isCommand: true, status: 'done', output: 'npm install' },
          ]);
        }

        if (!textContent && workspace.files.size > 0) {
          const fileCount = workspace.files.size;
          textContent = `Project ready with ${fileCount} files. Switch to the **Preview** tab to see it live.`;
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: textContent } : m));
        }
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
    const userMsg: DisplayMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    computerCtx.setMode('compact');

    const assistantId = `assistant-${Date.now()}`;
    let textContent = '';
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', toolsUsed: [] }]);

    const allMsgs = [...messages, userMsg];
    const history: ChatMessage[] = allMsgs.map((m) => ({ role: m.role, content: m.content }));

    startComputer({
      messages: history,
      workspace: workspace.toRecord(),
      model: selectedModel,
      onTextDelta(text) {
        textContent += text;
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: textContent } : m));
      },
      onError(message) {
        if (!textContent) {
          textContent = message;
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: textContent } : m));
        }
      },
      onDone() {
        setLoading(false);
      },
    });
  }, [messages, workspace, selectedModel, computerCtx, startComputer]);

  const runDeckWithResearch = useCallback(async (trimmed: string, researchQuery: string) => {
    setInput('');
    setResearching(researchQuery);
    computerCtx.setMode('compact');

    const userMsg: DisplayMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    const notice: DisplayMessage = {
      id: `notice-${Date.now()}`,
      role: 'assistant',
      content: `Researching "${researchQuery}" before building your deck…`,
    };
    setMessages((prev) => [...prev, userMsg, notice]);

    try {
      const brief = await requestResearch(researchQuery);
      setResearching(null);
      setDeckModalPrompt(trimmed);
      setDeckModalBrief(brief ?? undefined);
    } catch {
      setResearching(null);
      setDeckModalPrompt(trimmed);
      setDeckModalBrief(undefined);
    }
  }, [computerCtx]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Explicit overrides via the mode toggle
    if (forceMode === 'deck') {
      setDeckModalPrompt(trimmed);
      setDeckModalBrief(undefined);
      setInput('');
      return;
    }
    if (forceMode === 'code') {
      runCodeFlow(trimmed);
      return;
    }
    if (forceMode === 'computer') {
      runComputerFlow(trimmed);
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
          if (result.needsResearch && result.researchQuery) {
            await runDeckWithResearch(trimmed, result.researchQuery);
            return;
          }
          setDeckConfirm({ prompt: trimmed, confidence: result.confidence });
          return;
        }
      } catch {
        // Intent service is best-effort — fall through to code flow.
      }
    }

    runCodeFlow(trimmed);
  }, [loading, forceMode, messages.length, runCodeFlow, runComputerFlow, runDeckWithResearch]);

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
          { id: uid, role: 'user', content: parsed.prompt },
          {
            id: aid,
            role: 'assistant',
            content:
              parsed.assistantText ||
              'Your preview is live. Say what you want to change and I will extend it.',
            toolsUsed: [],
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

  const hasActions = actionSteps.length > 0;

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A]">
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#1A1A1A] bg-gradient-to-b from-[#0D1117] to-[#0A0A0A] flex-shrink-0">
        <div className="w-[180px]" />
        <div className="flex items-center gap-1 text-sm text-[#A0A0A0]">
          {projectName && (
            editingName ? (
              <input
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(false); }}
                className="bg-transparent text-[#E8E8E8] text-sm text-center border-b border-[#3B82F6] focus:outline-none w-60"
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="flex items-center gap-1 hover:text-[#E8E8E8] transition-colors">
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
            className="p-1.5 text-[#666] hover:text-[#A0A0A0] transition-colors"
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
                className="px-3 py-1.5 text-xs text-[#A0A0A0] border border-[#333] rounded-md hover:text-[#E8E8E8] hover:border-[#555] transition-colors flex items-center gap-1.5"
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
        <div className="w-[40%] min-w-[340px] max-w-[500px] flex flex-col bg-[#0F0F0F] border-r border-[#1A1A1A]">
          <div className="flex-1 overflow-y-auto px-5 py-4 subtle-scrollbar">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[15px] text-[#E8E8E8]">What do you want to build?</span>
                </div>
                <p className="text-xs text-[#666] mb-6">React + TypeScript + Tailwind apps</p>
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      disabled={loading}
                      className="text-left text-xs text-[#A0A0A0] bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2.5 hover:bg-[#222] hover:text-[#E8E8E8] transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="animate-fade-slide-up">
                    {msg.role === 'user' ? (
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#333] text-[#E8E8E8] text-[10px] font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                          U
                        </div>
                        <p className="text-sm text-[#E8E8E8] pt-1">{msg.content}</p>
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {hasActions && (
                  <ActionCard
                    title={actionTitle}
                    steps={actionSteps}
                    expanded={actionExpanded}
                    onToggle={() => setActionExpanded((v) => !v)}
                  />
                )}

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

          {activePlan && deliveryStatus === 'scoped' && (
            <div className="px-4 pb-2 flex-shrink-0">
              <PlanApprovalWidget
                plan={activePlan.plan}
                pricing={activePlan.pricing}
                onAcceptBuild={acceptPlanAndBuild}
                onSpinForDiscount={onSpinForDiscount}
                onTellMr8={onTellMr8}
              />
            </div>
          )}

          {deliveryStatus === 'verified' && activePlan && (
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="flex items-center justify-between rounded-md border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-[11px]">
                <div className="text-emerald-200">
                  Build verified. Accept & Merge to finalize —{' '}
                  <span className="font-semibold">
                    ${(activePlan.pricing.dealerCents / 100).toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={acceptDelivery}
                  disabled={acceptingDelivery}
                  className="rounded bg-emerald-500 px-3 py-1 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:text-emerald-400"
                >
                  {acceptingDelivery ? 'Debiting…' : 'Accept & Merge'}
                </button>
              </div>
            </div>
          )}

          <div className="p-4 flex-shrink-0 space-y-2.5">
            <div className="bg-[#1A1A1A] border border-[#333] rounded-xl overflow-hidden">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={forceMode === 'deck' ? 'Describe the deck you want…' : 'How can Mr8 help you today?'}
                rows={1}
                className="w-full px-4 py-3 bg-transparent text-[#E8E8E8] text-sm resize-none focus:outline-none placeholder:text-[#555] max-h-[200px]"
              />
              <div className="flex items-center justify-between px-3 pb-2">
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-[11px] bg-[#141414] border border-[#2A2A2A] text-[#888] rounded px-2 py-1 focus:outline-none focus:border-[#444] cursor-pointer"
                  >
                    <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                    <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                    <option value="claude-opus-4-6">Opus 4.6</option>
                  </select>
                  <select
                    value={forceMode}
                    onChange={(e) => setForceMode(e.target.value as 'auto' | 'code' | 'deck' | 'computer')}
                    className="text-[11px] bg-[#141414] border border-[#2A2A2A] text-[#888] rounded px-2 py-1 focus:outline-none focus:border-[#444] cursor-pointer"
                    title="Choose how Claude should respond"
                  >
                    <option value="auto">Auto</option>
                    <option value="code">Code app</option>
                    <option value="deck">Slide deck</option>
                    <option value="computer">Mr8 Computer</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const t = input.trim();
                      if (!t || loading) return;
                      runComputerFlow(t);
                    }}
                    disabled={loading || !input.trim()}
                    className="text-[11px] bg-[#141414] border border-[#2A2A2A] text-[#FFB229] rounded px-2 py-1 focus:outline-none hover:border-[#FFB229] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Run this prompt through Mr8 Computer (browser + Python sandbox)"
                  >
                    Use Mr8 Computer
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="w-full py-3.5 bg-brand-orange hover:bg-brand-orange-hover disabled:bg-[#2A2A2A] disabled:text-[#666] disabled:cursor-not-allowed rounded-full text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(251,119,1,0.35)] disabled:shadow-none"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14m-7-7l7 7-7 7" />
              </svg>
              {loading ? 'Working…' : forceMode === 'deck' ? 'Generate deck' : 'Send'}
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#0A0A0A]">
          {computerCtx.state.panel.mode === 'expanded' ? (
            <ComputerPanel />
          ) : (
            <>
              <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1A1A1A] flex-shrink-0">
                {(['code', 'preview'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      rightTab === tab
                        ? 'text-brand-orange bg-[#1A1A1A] font-semibold'
                        : 'text-[#666] hover:text-[#A0A0A0]'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
                {computerCtx.state.timeline.length > 0 && (
                  <button
                    onClick={() => computerCtx.setMode('expanded')}
                    className="ml-auto px-3 py-1 text-xs rounded text-[#FFB229] hover:bg-[#1A1A1A] transition-colors"
                    title="Show Mr8 Computer activity"
                  >
                    Mr8 Computer ({computerCtx.state.timeline.length}) ↗
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0">
                {rightTab === 'code' ? (
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
            </>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          projectName={projectName}
          onProjectNameChange={setProjectName}
          onClose={() => setShowSettings(false)}
        />
      )}

      {deckConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-lg w-full max-w-md p-5">
            <div className="text-sm font-semibold text-[#E8E8E8] mb-1">
              Looks like you want slides, not an app
            </div>
            <div className="text-xs text-[#888] mb-4">
              Mr8 can generate a full Gartner-style deck from this prompt. Or continue building it as a code app.
            </div>
            <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded p-3 text-xs text-[#A0A0A0] mb-4 max-h-32 overflow-y-auto">
              {deckConfirm.prompt}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const prompt = deckConfirm.prompt;
                  setDeckConfirm(null);
                  runCodeFlow(prompt);
                }}
                className="px-3 py-1.5 text-xs text-[#A0A0A0] hover:text-[#E8E8E8]"
              >
                Build as app
              </button>
              <button
                type="button"
                onClick={() => {
                  const prompt = deckConfirm.prompt;
                  setDeckConfirm(null);
                  setInput('');
                  setDeckModalPrompt(prompt);
                }}
                className="px-4 py-1.5 text-xs bg-brand-orange hover:bg-brand-orange-hover text-white rounded-full font-semibold flex items-center gap-1.5 shadow-[0_2px_8px_rgba(251,119,1,0.4)]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L15 9L22 10L17 15L18 22L12 19L6 22L7 15L2 10L9 9L12 2z" />
                </svg>
                Generate deck
              </button>
            </div>
          </div>
        </div>
      )}

      {deckModalPrompt && (
        <GenerateDeckModal
          initialTopic={deckModalPrompt}
          researchBrief={deckModalBrief}
          onClose={() => {
            setDeckModalPrompt(null);
            setDeckModalBrief(undefined);
          }}
          onComplete={(deckId) => {
            setDeckModalPrompt(null);
            setDeckModalBrief(undefined);
            navigate(`/decks/${deckId}`);
          }}
        />
      )}

      {researching && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#141414] border border-[#FFB229] rounded-full px-5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#FFB229] animate-pulse" />
            <span className="text-xs text-[#E8E8E8] font-mono">
              Researching: {researching}
            </span>
          </div>
        </div>
      )}

      {prize && <PrizeModal prize={prize} onClose={() => setPrize(null)} />}
    </div>
  );
}
