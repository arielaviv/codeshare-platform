import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const pythonTool: Tool = {
  name: 'python',
  description:
    'Execute Python code in the Mr8 Computer sandbox. The Python REPL state persists across calls within a session, so imports and variables carry forward. Pre-installed libraries include pandas, numpy, matplotlib, Pillow, scipy, scikit-learn, httpx, beautifulsoup4, trafilatura, openpyxl, python-pptx, PyPDF2, pdfplumber. Files placed in /home/user/output/ are returned to the caller. Use this for data processing, chart generation, document creation, and one-off scripts.',
  input_schema: {
    type: 'object' as const,
    properties: {
      code: {
        type: 'string',
        description: 'Python source code to execute.',
      },
      description: {
        type: 'string',
        description: 'Short human-readable label for the UI timeline (e.g. "fetch and summarize page").',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Workspace file paths to mount into /home/user/input/ before execution.',
      },
    },
    required: ['code'],
  },
};

export const browserTool: Tool = {
  name: 'browser',
  description:
    'Control a live Chromium browser inside the Mr8 Computer. The user can watch every action in real time via a WebRTC stream. Use for web research, form filling, and extracting content from dynamic pages. Prefer `search` over `navigate` for factual queries; use `navigate` when you already have a specific URL. Call `close` when you are done to free the sandbox.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['navigate', 'search', 'click', 'type', 'scroll', 'extract', 'screenshot', 'close'],
        description: 'Which browser action to perform.',
      },
      url: {
        type: 'string',
        description: 'For action=navigate: the URL to open.',
      },
      query: {
        type: 'string',
        description: 'For action=search: the Google search query.',
      },
      selector: {
        type: 'string',
        description: 'For action=click/type/extract: a CSS selector.',
      },
      text: {
        type: 'string',
        description: 'For action=type: the text to fill into the field.',
      },
      direction: {
        type: 'string',
        enum: ['up', 'down'],
        description: 'For action=scroll: scroll direction.',
      },
      amount: {
        type: 'number',
        description: 'For action=scroll: number of viewport-heights to scroll (default 3).',
      },
    },
    required: ['action'],
  },
};

export const computerTools: Tool[] = [pythonTool, browserTool];
