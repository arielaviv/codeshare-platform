import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { platformToolDefinitions, executePlatformTool, type PlatformToolInput } from './platform-tools';
import { awardPrize } from './prize.service';
import { ApiError } from '../middleware/error.middleware';
import type { ChatMessage } from '../types/chat';

export interface SSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

interface FileInput {
  path: string;
  content?: string;
}

type ToolInput = PlatformToolInput | FileInput | Record<string, never>;

const MAX_ITERATIONS = 25;

const workspaceTools: Tool[] = [
  {
    name: 'write_file',
    description: 'Create or overwrite a file in the workspace. Use this to build code files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path (e.g. index.html, style.css, main.js)' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the content of a file in the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List all files currently in the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path to delete' },
      },
      required: ['path'],
    },
  },
  {
    name: 'award_prize',
    description:
      'Celebrate a meaningful user accomplishment with a small bonus Mr8 credit ($1–$3). Use SPARINGLY — at most once per conversation, AFTER the user has completed something tangible (a working app ready to preview, a finished deck, overcoming a difficult bug). Do NOT use for encouragement mid-task or as a greeting. The user cannot trigger this themselves. Backend rate-limits to 1 prize per 24 hours; you will receive an error if the cooldown is active.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description:
            'Short celebratory message (max 200 chars) describing what the user accomplished — e.g. "finished your first React app" or "shipped a 10-slide pitch deck". Shown to the user on the prize modal.',
        },
      },
      required: ['reason'],
    },
  },
];

const allTools: Tool[] = [...workspaceTools, ...platformToolDefinitions];

function buildSystemPrompt(workspace: Map<string, string>): string {
  const fileList = workspace.size > 0
    ? Array.from(workspace.keys()).join('\n')
    : '(empty)';

  return `You are Mr8, an expert AI assistant and exceptional senior software developer. You generate complete, production-ready web applications that run in a WebContainer browser environment.

You think HOLISTICALLY before creating anything. Consider the full project scope, all files needed, and how components interact before writing code.

TECH STACK: React + Vite + TypeScript + Tailwind CSS

FILE CREATION ORDER (always follow this):
1. package.json
2. vite.config.ts
3. tsconfig.json
4. postcss.config.js
5. tailwind.config.js
6. index.html
7. src/index.css
8. src/main.tsx
9. src/App.tsx
10. Additional components in src/components/
11. Pages in src/pages/ (for multi-page apps)

BASE package.json (extend with additional deps as needed):
{
  "name": "project",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.344.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.56",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.2.2",
    "vite": "^5.1.4"
  }
}

Add additional dependencies as needed (e.g. react-router-dom, mapbox-gl, framer-motion, recharts).

SAFETY: index.html MUST have inline dark background fallback so the page is never blank:
<body style="margin:0;background:#0a0a0f;color:#e0e0e0;font-family:system-ui,sans-serif">
  <div id="root" style="display:flex;align-items:center;justify-content:center;min-height:100vh">
    <p style="opacity:0.5">Loading...</p>
  </div>
  <script type="module" src="/src/main.tsx"></script>
</body>

SAFETY: src/main.tsx MUST wrap render in try/catch:
try { ReactDOM.createRoot(document.getElementById('root')!).render(<App />); }
catch(e) { document.getElementById('root')!.innerHTML = '<pre style="color:red;padding:2rem">' + e + '</pre>'; }

DESIGN QUALITY (critical — make apps visually stunning):
- Use a consistent, professional color palette. Define CSS custom properties in index.css.
- Include smooth transitions (transition-all duration-300) and hover effects on ALL interactive elements.
- Use proper typography hierarchy: larger bold headings, readable body text, muted secondary text.
- Include a responsive navigation bar with mobile hamburger menu.
- Add subtle box-shadows, gradients, and micro-animations for polish.
- Use CSS Grid for layouts, Flexbox for alignment.
- Include a proper footer with links.
- For dark themes: use grays (#111, #1a1a1a, #2a2a2a) not pure black.
- For light themes: use off-whites (#fafafa, #f5f5f5) not pure white.
- Buttons should have hover states, active states, and disabled states.
- Cards should have subtle borders, hover elevation, and consistent padding.

IMAGES — Use real Unsplash photos (never placeholders):
- Format: https://images.unsplash.com/photo-{ID}?w={width}&h={height}&fit=crop
- Common photo IDs to use:
  - Nature: 1506744038136-46273834b3fb, 1470071459604-3b5ec3a7fe05, 1441974231531-c6227db76b6e
  - Architecture: 1486325212027-8a9601a5e652, 1487958449943-2429e8be8625, 1479839672679-a46483c0e7c1
  - Technology: 1518770660439-4636190af475, 1550751827-4bd374c3f58b, 1531297484001-d7418eddbdb5
  - Food: 1504674900247-0877df9cc836, 1476224203421-9ac39bcb3327, 1565299624946-b28f40a0ae38
  - People: 1529156069898-49953bc89e16, 1438761681033-6461ffad8d80, 1507003211169-0a1dd7228f2d
  - Cars: 1544636331-e26879cd4d9b, 1503376780353-7e6692767b70, 1552519507-da3b142c6e3b
  - Business: 1497366216548-37526070297c, 1497366811353-6870744d04b2, 1522202176988-66273c2fd55f
- NEVER use placeholder.com, via.placeholder.com, or placehold.co
- Choose photos that match the content contextually

MULTI-PAGE APPS (when building websites/dashboards/blogs):
- Add "react-router-dom": "^6.22.0" to dependencies
- Use BrowserRouter, Routes, Route in App.tsx
- Create a shared Layout component with header + footer
- Put pages in src/pages/ directory
- Include proper navigation links between pages

MAP/GLOBE FEATURES:
- Mapbox token is pre-configured via import.meta.env.VITE_MAPBOX_TOKEN
- Add "mapbox-gl": "^3.3.0" to dependencies
- Use globe projection with "mapbox://styles/mapbox/dark-v11" style
- Include mapbox-gl CSS: import 'mapbox-gl/dist/mapbox-gl.css'
- The token is already available — do NOT ask the user to provide it

AI-POWERED FEATURES:
- Anthropic API key is available via import.meta.env.VITE_ANTHROPIC_API_KEY
- Use fetch to POST to https://api.anthropic.com/v1/messages with proper headers
- Include x-api-key header and anthropic-version header
- Handle errors gracefully

WEBCONTAINER CONSTRAINTS:
- No native binaries or C/C++ compilation
- No pip — Python standard library only
- No git
- Prefer Vite over custom web servers
- Prefer libsql/sqlite for databases (no native deps)
- Prefer Node.js scripts over shell scripts

CRITICAL RULES:
- Write COMPLETE files. Never use "// rest of code here" or similar placeholders.
- Every function must be fully implemented, every button must have a handler.
- Use 2-space indentation.
- Use lucide-react for all icons.
- Use modern React patterns: hooks, functional components, TypeScript interfaces.
- Split code into small, focused modules — never monolithic files.
- Include responsive design (mobile-first with Tailwind breakpoints).

COMMUNICATION:
- Start with a brief 1-2 sentence description of what you'll build.
- Write files immediately — don't explain each file in detail before creating it.
- After writing ALL files, provide a summary:
  "I've built [description]. Key features: [list]. The app includes [details about pages/components]."
- Be concise. Don't over-explain unless asked.

When using platform tools:
- Search community posts for reference when relevant.

REWARDING USER PROGRESS (award_prize tool):
- You have a tool that gives the user a small Mr8 credit bonus ($1–$3). Use it SPARINGLY and only as a CELEBRATION after a meaningful accomplishment.
- Valid triggers: user just finished a working app ready to preview, user's first completed deck, user recovered from a tricky bug with your help, user hit a major milestone (e.g. 10th project).
- NEVER use it: as a greeting, mid-build, as encouragement, or before real work is done.
- Rate-limited to 1 prize per 24 h per user — if the cooldown is active, the tool returns an error and you should just continue normally without mentioning it.
- After a successful award, the user sees a dedicated prize modal with confetti. DO NOT repeat the award in your text — just continue the conversation naturally ("Nice work! Now let's see your app live…").

Current workspace files:
${fileList}`;
}

function executeWorkspaceTool(
  name: string,
  input: ToolInput,
  workspace: Map<string, string>,
  writer: SSEWriter,
): string {
  const fileInput = input as FileInput;

  switch (name) {
    case 'write_file': {
      workspace.set(fileInput.path, fileInput.content || '');
      writer.send('file_write', { path: fileInput.path, content: fileInput.content });
      return `Wrote ${fileInput.path} (${(fileInput.content || '').length} chars)`;
    }
    case 'read_file': {
      const content = workspace.get(fileInput.path);
      if (content === undefined) return `File not found: ${fileInput.path}`;
      return content;
    }
    case 'list_files': {
      const files = Array.from(workspace.keys());
      if (files.length === 0) return 'Workspace is empty';
      return files.join('\n');
    }
    case 'delete_file': {
      if (!workspace.has(fileInput.path)) return `File not found: ${fileInput.path}`;
      workspace.delete(fileInput.path);
      writer.send('file_delete', { path: fileInput.path });
      return `Deleted ${fileInput.path}`;
    }
    default:
      return `Unknown workspace tool: ${name}`;
  }
}

const WORKSPACE_TOOL_NAMES = new Set(['write_file', 'read_file', 'list_files', 'delete_file']);

interface PrizeToolInput {
  reason?: string;
}

async function executeTool(
  name: string,
  input: ToolInput,
  workspace: Map<string, string>,
  writer: SSEWriter,
  userId: mongoose.Types.ObjectId | null,
): Promise<string> {
  if (WORKSPACE_TOOL_NAMES.has(name)) {
    return executeWorkspaceTool(name, input, workspace, writer);
  }
  if (name === 'award_prize') {
    if (!userId) return 'Cannot award prize: user context missing.';
    const reason = (input as PrizeToolInput).reason || 'Great work!';
    try {
      const result = await awardPrize(userId, reason);
      writer.send('prize_awarded', {
        amountCents: result.amountCents,
        newBalanceCents: result.newBalanceCents,
        reason: result.reason,
      });
      const dollars = (result.amountCents / 100).toFixed(2);
      const balance = (result.newBalanceCents / 100).toFixed(2);
      return `Awarded user $${dollars}. New balance: $${balance}. The user has been shown a celebratory prize modal — do not mention the award in your next message.`;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        return 'Prize cooldown active — the user already won a prize in the last 24 hours. Continue helping them without awarding another.';
      }
      return `Could not award prize: ${err instanceof Error ? err.message : 'unknown error'}`;
    }
  }
  return executePlatformTool(name, input as PlatformToolInput);
}

const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];

export async function runCodeAgent(
  messages: ChatMessage[],
  initialWorkspace: Record<string, string>,
  writer: SSEWriter,
  model?: string,
  userId?: mongoose.Types.ObjectId,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'AI service not configured' });
    writer.end();
    return;
  }

  const client = new Anthropic({ apiKey });
  const workspace = new Map<string, string>(Object.entries(initialWorkspace));
  const filesModified: Set<string> = new Set();

  const apiMessages: MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: (model && ALLOWED_MODELS.includes(model)) ? model : 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: buildSystemPrompt(workspace),
      tools: allTools,
      messages: apiMessages,
    });

    const toolBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use',
    );

    const textBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'text' }> =>
        block.type === 'text',
    );

    for (const block of textBlocks) {
      if (block.text) {
        writer.send('text_delta', { content: block.text });
      }
    }

    if (response.stop_reason !== 'tool_use' || toolBlocks.length === 0) {
      break;
    }

    const toolResults: { type: 'tool_result'; tool_use_id: string; content: string }[] = [];

    for (const toolBlock of toolBlocks) {
      writer.send('tool_call', {
        name: toolBlock.name,
        input: toolBlock.input,
      });

      const result = await executeTool(
        toolBlock.name,
        toolBlock.input as ToolInput,
        workspace,
        writer,
        userId ?? null,
      );

      if (toolBlock.name === 'write_file' || toolBlock.name === 'delete_file') {
        filesModified.add((toolBlock.input as FileInput).path);
      }

      const preview = result.length > 200 ? result.slice(0, 200) + '...' : result;
      writer.send('tool_result', { name: toolBlock.name, preview });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    apiMessages.push({ role: 'assistant', content: response.content });
    apiMessages.push({ role: 'user', content: toolResults });
  }

  writer.send('done', { filesModified: Array.from(filesModified) });
  writer.end();
}
