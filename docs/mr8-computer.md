# Mr8 Computer

Mr8 Computer is a browser + Python agent running in E2B. It mirrors Edison's Jax Computer and Manus.im: the agent can browse the web (Chromium + Playwright over CDP, live-streamed via WebRTC) and execute Python in a persistent REPL.

## Architecture (what landed in these 5 worktrees)

| Branch | What it adds |
|--------|-------------|
| `mr8-computer-core` | E2B templates (`mr8-compute`, `mr8-desktop`), session store with per-user mutex, Mongoose `ComputerSession`, typed SSE writer |
| `mr8-computer-tools` | `python-handler`, `browser-handler`, dispatch, `computer-agent.service`, `POST /api/ai/computer` (SSE), `computerRateLimiter` |
| `mr8-computer-ui` | `ComputerProvider` + `useComputerStream` + 6 view components (`ComputerPanel`, `FloatingThumbnail`, `BrowserView`, `PythonView`, `EditorView`, `TimelineScrubber` with 80×60 thumbnail cards) |
| `mr8-research-pipeline` | Browser-only `research-agent.service` (12-action / 90-s cap), `POST /api/ai/research` (SSE), `ResearchBrief` type shared with deck generator |
| `mr8-computer-integration` | `App.tsx` wraps `ComputerProvider` + mounts `FloatingThumbnail` globally |

## Environment setup

```bash
# backend/.env
E2B_API_KEY=<from your Edison .env>
E2B_COMPUTE_TEMPLATE_ID=<empty OK for local dev — falls back to E2B stock template>
E2B_DESKTOP_TEMPLATE_ID=<empty OK for local dev>
```

## Building the custom templates

```bash
cd backend
./scripts/build-e2b-templates.sh
```

The script builds two templates and prints their IDs. Paste them into `.env`.

**`mr8-compute`** has: pandas, numpy, scipy, scikit-learn, matplotlib, Pillow, seaborn, httpx, beautifulsoup4, lxml, trafilatura, readability-lxml, openpyxl, python-pptx, PyPDF2, pdfplumber, markdown, black, ruff.

**`mr8-desktop`** has: Chromium (autostart on `--remote-debugging-port=9222`), Playwright + browsers, CJK/Hebrew/Arabic fonts.

## API

### `POST /api/ai/computer`
Full agent loop with `browser` + `python` tools. 5 req/hr.

### `POST /api/ai/research`
Browser-only research agent. Returns a typed `ResearchBrief` at the end (via `event: research_brief` SSE frame). 10 req/hr.

## Using the UI

The `FloatingThumbnail` is mounted globally in `App.tsx`. It appears bottom-right whenever the `ComputerContext` timeline has entries in `compact` mode. Click it to expand.

To trigger the agent from any page, call:

```tsx
import { useComputerStream } from '../hooks/useComputerStream';
import { useComputer } from '../contexts/ComputerContext';

function MyComponent() {
  const { start } = useComputerStream();
  const { setMode } = useComputer();

  function runComputer() {
    setMode('compact'); // pop the thumbnail
    start({
      messages: [{ role: 'user', content: 'research the top AI conferences in 2026' }],
      onTextDelta: (text) => console.log(text),
      onDone: () => setMode('expanded'),
    });
  }

  return <button onClick={runComputer}>Use Mr8 Computer</button>;
}
```

To **expand** the panel so the live browser stream is visible, call `setMode('expanded')`. The panel renders inline wherever a page decides to mount `<ComputerPanel />` — typically in the right pane of `AIChatPage`. While `FloatingThumbnail` is globally available, `ComputerPanel` is meant to replace the context-appropriate right panel when the user clicks the thumbnail.

## Research-first generation

The intent classifier will be extended (next step) to return `{ intent, needs_research, research_query }`. Route `deck` intents with `needs_research: true` through `/api/ai/research` first, then feed the returned `ResearchBrief` into `/api/ai/generate-deck` as `researchBrief`. The slide agent must be updated to accept and inline this context in its system prompt.

## Verification

```bash
cd backend
npm test -- --runInBand
```

All suites green:

- `computer-session-store.test.ts` — 10 tests
- `computer-session-model.test.ts` — 6 tests
- `computer-sse-writer.test.ts` — 5 tests
- `computer-dispatch.test.ts` — 11 tests
- `computer-route.test.ts` — 5 tests
- `research-agent.test.ts` — 3 tests

Plus the pre-existing 102 tests still pass.

## Not yet done (deliberate scope cut)

- Intent classifier `needs_research` extension — straightforward addition to the existing tool schema in `intent-classifier.service.ts`, left for the user to tune the prompt wording.
- Slide-agent `researchBrief` parameter — small addition to `slide-agent.service.ts` to inject the brief into the system prompt and sources list.
- AIChatPage trigger button + SSE wiring — touchy file with heavy uncommitted changes on main; safest to let the user decide where the button lives (chat input area vs model picker row).
- Takeover overlay + summary dialog — nice-to-have, defer until user feedback from first real run.
- E2E test covering classify → research → generate-deck — waits for the intent and slide-agent extensions.

Each of these is a small PR on its own; the heavy lifting (E2B plumbing, sandbox lifecycle, UI ports, SSE contract) is done.
