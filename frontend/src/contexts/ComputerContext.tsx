import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  BrowserActionEntry,
  ComputerPanelState,
  ComputerPanelMode,
  ComputeTask,
  PythonResultImage,
  PythonOutputFile,
  TimelineEntry,
} from '../components/computer/types';

interface ComputerState {
  panel: ComputerPanelState;
  timeline: TimelineEntry[];
  tasks: ComputeTask[];
}

type ComputerAction =
  | { type: 'set-mode'; mode: ComputerPanelMode }
  | { type: 'set-active'; index: number; isLive?: boolean }
  | { type: 'browser-start'; id: string; streamUrl: string }
  | {
      type: 'browser-action';
      id: string;
      action: string;
      target: string;
      url?: string;
      title?: string;
      screenshot?: string;
    }
  | { type: 'browser-end'; id: string }
  | {
      type: 'python-start';
      id: string;
      code: string;
      description?: string;
    }
  | {
      type: 'python-result';
      id: string;
      status: 'success' | 'error';
      stdout: string[];
      stderr: string[];
      error?: { name: string; value: string; traceback: string };
      results: PythonResultImage[];
      outputFiles: PythonOutputFile[];
      durationMs: number;
    }
  | { type: 'editor-write'; id: string; path: string; content: string }
  | {
      type: 'media-generating';
      id: string;
      prompt: string;
      model?: string;
    }
  | {
      type: 'media-ready';
      id: string;
      imageUrl: string;
      path?: string;
      alt?: string;
      width?: number;
      height?: number;
    }
  | { type: 'task-add'; task: ComputeTask }
  | { type: 'task-update'; id: string; patch: Partial<ComputeTask> }
  | { type: 'reset' };

const initialState: ComputerState = {
  panel: {
    mode: 'hidden',
    viewMode: 'python',
    activeIndex: -1,
    isLive: true,
  },
  timeline: [],
  tasks: [],
};

function upsertEntry(
  timeline: TimelineEntry[],
  id: string,
  patch: Partial<TimelineEntry> & Pick<TimelineEntry, 'kind'>
): TimelineEntry[] {
  const idx = timeline.findIndex((e) => e.id === id);
  if (idx === -1) {
    const fresh: TimelineEntry = {
      id,
      timestamp: Date.now(),
      status: 'running',
      ...patch,
    };
    return [...timeline, fresh];
  }
  const next = timeline.slice();
  next[idx] = { ...next[idx], ...patch };
  return next;
}

function appendAction(
  existing: BrowserActionEntry[] | undefined,
  action: BrowserActionEntry
): BrowserActionEntry[] {
  return [...(existing ?? []), action];
}

function reducer(state: ComputerState, action: ComputerAction): ComputerState {
  switch (action.type) {
    case 'set-mode':
      return { ...state, panel: { ...state.panel, mode: action.mode } };

    case 'set-active':
      return {
        ...state,
        panel: {
          ...state.panel,
          activeIndex: action.index,
          isLive: action.isLive ?? state.panel.isLive,
        },
      };

    case 'browser-start': {
      const timeline = upsertEntry(state.timeline, action.id, {
        kind: 'browser',
        streamUrl: action.streamUrl,
        status: 'running',
      });
      const activeIndex = timeline.length - 1;
      return {
        ...state,
        timeline,
        panel: {
          ...state.panel,
          viewMode: 'browser',
          activeIndex: state.panel.isLive ? activeIndex : state.panel.activeIndex,
          mode: state.panel.mode === 'hidden' ? 'compact' : state.panel.mode,
        },
      };
    }

    case 'browser-action': {
      const idx = state.timeline.findIndex((e) => e.id === action.id);
      if (idx === -1) return state;
      const existing = state.timeline[idx];
      const newAction: BrowserActionEntry = {
        action: action.action,
        target: action.target,
        url: action.url,
        title: action.title,
        timestamp: Date.now(),
      };
      const nextEntry: TimelineEntry = {
        ...existing,
        browserActions: appendAction(existing.browserActions, newAction),
        browserUrl: action.url ?? existing.browserUrl,
        browserTitle: action.title ?? existing.browserTitle,
        browserScreenshot: action.screenshot ?? existing.browserScreenshot,
      };
      const timeline = state.timeline.slice();
      timeline[idx] = nextEntry;
      return { ...state, timeline };
    }

    case 'browser-end': {
      const idx = state.timeline.findIndex((e) => e.id === action.id);
      if (idx === -1) return state;
      const timeline = state.timeline.slice();
      timeline[idx] = { ...timeline[idx], status: 'success' };
      return { ...state, timeline };
    }

    case 'python-start': {
      const timeline = upsertEntry(state.timeline, action.id, {
        kind: 'python',
        code: action.code,
        description: action.description,
        status: 'running',
      });
      const activeIndex = timeline.length - 1;
      return {
        ...state,
        timeline,
        panel: {
          ...state.panel,
          viewMode: 'python',
          activeIndex: state.panel.isLive ? activeIndex : state.panel.activeIndex,
          mode: state.panel.mode === 'hidden' ? 'compact' : state.panel.mode,
        },
      };
    }

    case 'python-result': {
      const idx = state.timeline.findIndex((e) => e.id === action.id);
      if (idx === -1) return state;
      const timeline = state.timeline.slice();
      timeline[idx] = {
        ...timeline[idx],
        status: action.status,
        stdout: action.stdout,
        stderr: action.stderr,
        error: action.error,
        results: action.results,
        outputFiles: action.outputFiles,
        durationMs: action.durationMs,
      };
      return { ...state, timeline };
    }

    case 'editor-write': {
      const timeline = upsertEntry(state.timeline, action.id, {
        kind: 'editor',
        writePath: action.path,
        writeContent: action.content,
        status: 'success',
      });
      return { ...state, timeline };
    }

    case 'media-generating': {
      const timeline = upsertEntry(state.timeline, action.id, {
        kind: 'media',
        mediaPrompt: action.prompt,
        mediaModel: action.model,
        status: 'running',
      });
      const activeIndex = timeline.length - 1;
      return {
        ...state,
        timeline,
        panel: {
          ...state.panel,
          viewMode: 'media',
          activeIndex: state.panel.isLive ? activeIndex : state.panel.activeIndex,
          mode: state.panel.mode === 'hidden' ? 'compact' : state.panel.mode,
        },
      };
    }

    case 'media-ready': {
      const idx = state.timeline.findIndex((e) => e.id === action.id);
      if (idx === -1) return state;
      const timeline = state.timeline.slice();
      timeline[idx] = {
        ...timeline[idx],
        status: 'success',
        mediaImageUrl: action.imageUrl,
        mediaPath: action.path,
        mediaAlt: action.alt,
        mediaWidth: action.width,
        mediaHeight: action.height,
      };
      return { ...state, timeline };
    }

    case 'task-add':
      return { ...state, tasks: [...state.tasks, action.task] };

    case 'task-update': {
      const idx = state.tasks.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const tasks = state.tasks.slice();
      tasks[idx] = { ...tasks[idx], ...action.patch };
      return { ...state, tasks };
    }

    case 'reset':
      return initialState;

    default:
      return state;
  }
}

interface ComputerContextValue {
  state: ComputerState;
  setMode: (mode: ComputerPanelMode) => void;
  setActive: (index: number, opts?: { isLive?: boolean }) => void;
  jumpToLive: () => void;
  reset: () => void;
  dispatch: React.Dispatch<ComputerAction>;
  activeEntry: TimelineEntry | undefined;
}

const ComputerContext = createContext<ComputerContextValue | null>(null);

export function ComputerProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  const prevLengthRef = useRef(0);

  // Follow "isLive" — pin activeIndex to newest entry when live mode is on.
  if (state.panel.isLive && state.timeline.length !== prevLengthRef.current) {
    prevLengthRef.current = state.timeline.length;
  }

  const setMode = useCallback((mode: ComputerPanelMode) => {
    dispatch({ type: 'set-mode', mode });
  }, []);

  const setActive = useCallback((index: number, opts?: { isLive?: boolean }) => {
    dispatch({ type: 'set-active', index, isLive: opts?.isLive });
  }, []);

  const jumpToLive = useCallback(() => {
    const lastIdx = state.timeline.length - 1;
    dispatch({ type: 'set-active', index: lastIdx, isLive: true });
  }, [state.timeline.length]);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const activeEntry = useMemo<TimelineEntry | undefined>(() => {
    const idx = state.panel.activeIndex;
    if (idx < 0 || idx >= state.timeline.length) return undefined;
    return state.timeline[idx];
  }, [state.panel.activeIndex, state.timeline]);

  const value = useMemo<ComputerContextValue>(
    () => ({ state, setMode, setActive, jumpToLive, reset, dispatch, activeEntry }),
    [state, setMode, setActive, jumpToLive, reset, activeEntry]
  );

  return <ComputerContext.Provider value={value}>{children}</ComputerContext.Provider>;
}

export function useComputer(): ComputerContextValue {
  const ctx = useContext(ComputerContext);
  if (!ctx) throw new Error('useComputer must be used inside ComputerProvider');
  return ctx;
}

export type { ComputerAction };
