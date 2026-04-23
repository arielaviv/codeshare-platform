import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { handlePythonExec } from './computer/python-handler';
import { createComputerSSEWriter } from './computer/sse-writer';
import { UsageEvent } from '../models/UsageEvent';
import { resolveUserModel } from './model-select';

export interface VisualizationSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export type ChartKind =
  | 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'bubble'
  | 'wordcloud' | 'sankey' | 'themeriver' | 'radar' | 'stackedbar' | 'sunburst'
  | 'funnel' | 'treemap' | 'candlestick' | 'flow' | 'area' | 'gantt';

export interface GenerateVisualizationRequest {
  prompt: string;
  preferredCharts?: ChartKind[];
  sessionId?: string;
  model?: string;
}

const SCRIPT_SYSTEM_PROMPT = `You write Python that generates a single
data visualization PNG from the user's prompt.

Hard rules:
- Output ONLY the Python code. No markdown fences, no explanation.
- Use matplotlib for: bar, line, pie, scatter, area, candlestick, gantt,
  stackedbar, funnel, radar.
- Use plotly (and call .write_image / .write_html) for: heatmap, bubble,
  sankey, sunburst, treemap, themeriver, flow.
- Use the wordcloud library for: wordcloud.
- ALWAYS save the result to /tmp/viz.png (matplotlib) using
  plt.savefig('/tmp/viz.png', dpi=150, bbox_inches='tight') OR for plotly
  fig.write_image('/tmp/viz.png', width=1200, height=800).
- If the user did not provide data, invent plausible mock data that
  matches the topic.
- Pick a single chart type from the user's preferred list if provided.
  Otherwise pick the most appropriate type for the topic.
- Use a clean modern style. Brand color #FB7701 for the primary series.
- Keep the script under 60 lines.
- Print "DONE" at the end so the runner can confirm success.`;

async function draftPython(
  prompt: string,
  preferredCharts: ChartKind[] | undefined,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  const userMessage = preferredCharts && preferredCharts.length > 0
    ? `User prompt: ${prompt}\n\nPreferred chart types: ${preferredCharts.join(', ')}.\nPick the best one for the topic.`
    : `User prompt: ${prompt}`;

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SCRIPT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = response.content.find(
    (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text'
  );
  let code = (block?.text ?? '').trim();
  // Strip accidental fences just in case.
  code = code.replace(/^```python\n?/, '').replace(/^```\n?/, '').replace(/\n?```\s*$/, '');
  return code;
}

const UPLOADS_BASE = path.join(__dirname, '../../uploads/viz');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export async function generateVisualization(
  req: GenerateVisualizationRequest,
  userId: mongoose.Types.ObjectId,
  writer: VisualizationSSEWriter
): Promise<void> {
  writer.send('viz_started', { prompt: req.prompt });

  const vizModel = resolveUserModel(req.model);

  // 1) Have the picked model draft the Python.
  let code: string;
  try {
    code = await draftPython(req.prompt, req.preferredCharts, vizModel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Python draft failed: ${msg}` });
    writer.end();
    return;
  }
  writer.send('viz_python_drafted', { code });

  // 2) Run the Python in E2B via the existing python handler.
  // The handler emits its own SSE events (code-execution-start, -result)
  // which we forward to the user's main computer stream too. For the
  // dedicated viz route we only forward to OUR writer, not the global
  // computer stream — keeps things simple.
  const pyWriter = createComputerSSEWriter({
    write(event: string, data: string) {
      writer.send(event, JSON.parse(data));
    },
  } as never);

  let result;
  try {
    result = await handlePythonExec(
      { code, description: `Visualization: ${req.prompt}`.slice(0, 120) },
      {
        userId: userId.toString(),
        workspace: {},
        sse: pyWriter,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Python execution failed: ${msg}` });
    writer.end();
    return;
  }

  if (!result.ok) {
    writer.send('error', { message: result.summary || 'Python execution returned an error' });
    writer.end();
    return;
  }

  // 3) Pull the PNG out of the result. The python handler emits
  // results[].png as base64 from matplotlib's inline backend; outputFiles[]
  // is also available for files written to /tmp.
  const payload = (result.payload ?? {}) as {
    results?: Array<{ png?: string; svg?: string }>;
    outputFiles?: Array<{ path: string; format: string; sizeBytes: number; base64?: string }>;
  };
  const pngBase64 =
    payload.results?.find((r) => r.png)?.png ??
    payload.outputFiles?.find((f) => f.path.endsWith('viz.png'))?.base64;
  if (!pngBase64) {
    writer.send('error', { message: 'Python ran but produced no PNG output. Make sure the script saves to /tmp/viz.png or uses inline matplotlib.' });
    writer.end();
    return;
  }

  // 4) Save to disk + return a public URL.
  const userDir = path.join(UPLOADS_BASE, userId.toString());
  ensureDir(userDir);
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
  const filepath = path.join(userDir, filename);
  fs.writeFileSync(filepath, Buffer.from(pngBase64, 'base64'));
  const publicUrl = `/uploads/viz/${userId.toString()}/${filename}`;

  // 5) Usage event.
  try {
    await UsageEvent.create({
      userId,
      sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
      feature: 'code-agent',
      modelName: `${vizModel}+e2b-python`,
      inputTokens: req.prompt.length,
      outputTokens: 0,
      costCents: 19, // Polish tier
    });
  } catch {
    // ignore
  }

  writer.send('viz_chart_ready', {
    imageUrl: publicUrl,
    chartKind: detectChartKind(code),
    code,
  });
  writer.end();
}

function detectChartKind(code: string): ChartKind | 'unknown' {
  const lower = code.toLowerCase();
  if (/sankey/.test(lower)) return 'sankey';
  if (/sunburst/.test(lower)) return 'sunburst';
  if (/treemap/.test(lower)) return 'treemap';
  if (/wordcloud/.test(lower)) return 'wordcloud';
  if (/heatmap|imshow|pcolor/.test(lower)) return 'heatmap';
  if (/scatter/.test(lower)) return 'scatter';
  if (/candlestick|ohlc/.test(lower)) return 'candlestick';
  if (/funnel/.test(lower)) return 'funnel';
  if (/radar|polar/.test(lower)) return 'radar';
  if (/area|fill_between/.test(lower)) return 'area';
  if (/pie/.test(lower)) return 'pie';
  if (/stack/.test(lower) && /bar/.test(lower)) return 'stackedbar';
  if (/bar/.test(lower)) return 'bar';
  if (/plot|line/.test(lower)) return 'line';
  return 'unknown';
}
