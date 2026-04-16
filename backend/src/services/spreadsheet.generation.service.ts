import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';
import { SpreadsheetFile, type ISheet } from '../models/SpreadsheetFile';
import { UsageEvent } from '../models/UsageEvent';

export interface SpreadsheetSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface GenerateSpreadsheetRequest {
  topic: string;
  sheetCount?: number;
  style?: 'simple' | 'detailed';
  sessionId?: string;
}

const SYSTEM_PROMPT = `You generate structured spreadsheets.

Return ONE tool call to emit_spreadsheet with { title, description, sheets[] }
where each sheet has:
- name (string, max 40 chars)
- rows: string[][] — a 2D grid. First row is a header row.
- Cells are strings. For formulas, prefix with "=" (e.g., "=SUM(B2:B10)").

Target 1–4 sheets. First sheet is the primary one. Keep concrete and useful.
Headers should be title-case. Numeric cells are strings of numbers (no commas).

Output must be valid for the tool — no prose outside the tool call.`;

const TOOL_SCHEMA = {
  name: 'emit_spreadsheet',
  description: 'Emit the full generated spreadsheet structure.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      sheets: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
          required: ['name', 'rows'],
        },
      },
    },
    required: ['title', 'sheets'],
  },
};

export async function generateSpreadsheet(
  req: GenerateSpreadsheetRequest,
  userId: mongoose.Types.ObjectId,
  writer: SpreadsheetSSEWriter
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  const model = 'claude-sonnet-4-6';

  writer.send('sheet_started', { topic: req.topic });

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [TOOL_SCHEMA as never],
      tool_choice: { type: 'tool', name: 'emit_spreadsheet' } as never,
      messages: [
        {
          role: 'user',
          content: `Topic: ${req.topic}\nStyle: ${req.style ?? 'detailed'}\nTarget sheet count: ${req.sheetCount ?? 1}`,
        },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Spreadsheet generation failed: ${msg}` });
    writer.end();
    return;
  }

  const toolUse = response.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use'
  );
  if (!toolUse) {
    writer.send('error', { message: 'Model did not emit a spreadsheet tool call' });
    writer.end();
    return;
  }

  const payload = toolUse.input as {
    title?: string;
    description?: string;
    sheets?: Array<{ name?: string; rows?: string[][] }>;
  };

  if (!payload || !Array.isArray(payload.sheets) || payload.sheets.length === 0) {
    console.warn('[spreadsheet] malformed tool output', JSON.stringify(toolUse.input).slice(0, 500));
    writer.send('error', {
      message: 'Model returned a spreadsheet tool call with no sheets. Please retry.',
    });
    writer.end();
    return;
  }

  // Normalize each sheet so missing fields don't blow up downstream.
  const safeSheets: Array<{ name: string; rows: string[][] }> = payload.sheets.map((sh, i) => ({
    name: (sh?.name ?? `Sheet ${i + 1}`).slice(0, 60),
    rows: Array.isArray(sh?.rows) ? (sh.rows as string[][]) : [],
  }));

  // Stream sheet_row events row-by-row (client incrementally renders).
  for (let s = 0; s < safeSheets.length; s++) {
    const sh = safeSheets[s];
    writer.send('sheet_meta', { index: s, name: sh.name, rowCount: sh.rows.length });
    for (let r = 0; r < sh.rows.length; r++) {
      writer.send('sheet_row', { sheetIndex: s, rowIndex: r, cells: sh.rows[r] });
    }
  }

  // Persist.
  const sheets: ISheet[] = safeSheets.map((sh) => ({ name: sh.name, rows: sh.rows }));
  const doc = await SpreadsheetFile.create({
    userId,
    title: payload.title ?? req.topic.slice(0, 80),
    description: payload.description,
    sheets,
    sourcePrompt: req.topic,
  });

  // Usage event (best-effort).
  try {
    await UsageEvent.create({
      userId,
      sessionId: req.sessionId ? new mongoose.Types.ObjectId(req.sessionId) : undefined,
      feature: 'code-agent',
      modelName: model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      costCents: Math.max(
        1,
        Math.round(((response.usage?.input_tokens ?? 0) * 0.3 + (response.usage?.output_tokens ?? 0) * 1.5) / 100)
      ),
    });
  } catch {
    // ignore
  }

  writer.send('sheet_completed', {
    sheetId: doc._id.toString(),
    title: doc.title,
    sheetCount: doc.sheets.length,
  });
  writer.end();
}
