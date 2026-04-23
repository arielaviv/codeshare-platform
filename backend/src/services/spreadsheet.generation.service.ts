import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';
import {
  SpreadsheetFile,
  type ISheet,
  type ICell,
  type ISheetTheme,
  type CellRole,
  type CellFormat,
  type SheetPalette,
} from '../models/SpreadsheetFile';
import { UsageEvent } from '../models/UsageEvent';
import { resolveUserModel } from './model-select';
import { buildStyledSpreadsheet } from './spreadsheet/e2b-openpyxl-builder';

export interface SpreadsheetSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface GenerateSpreadsheetRequest {
  topic: string;
  sheetCount?: number;
  style?: 'simple' | 'detailed';
  sessionId?: string;
  model?: string;
}

const SYSTEM_PROMPT = `You are the most decorated spreadsheet analyst in the
world — the kind of person Gartner, McKinsey, and a16z wire for a single
model. You do NOT write lazy "example data" grids. Every sheet you build
is publication-ready: section-organized, visually banded, with live
formulas, correct formats, and numbers that actually reconcile.

## OUTPUT

Always call the emit_spreadsheet tool exactly once. Never return prose.

## CELL GRID CONTRACT

Each sheet has a 2-D \`cells\` grid. Each cell is an object:

{
  "value":   string (the DISPLAYED value — already formatted: "$12,400", "27.4%", "+$2,500", "—"),
  "formula": optional string starting with "=" (e.g. "=SUM(B6:B9)"),
  "role":    optional one of "header" | "section" | "label" | "data" | "subtotal" | "total" | "blank",
  "format":  optional one of "text" | "number" | "integer" | "currency" | "percent",
  "bold":    optional boolean,
  "align":   optional "left" | "center" | "right"
}

Hard rules:
- When you give a \`formula\`, you MUST also give the computed \`value\` (you do
  the math yourself and render it pre-formatted). The user will see the value;
  the formula survives into the .xlsx export so cells stay live in Excel.
- NEVER put a raw "=ROUND(...)" string in \`value\`. If a cell is calculated,
  compute the number in your head, format it ("\$12,400", "27.4%"), and put
  the formatted result in \`value\` while the formula goes in \`formula\`.
- For currency cells: include a dollar sign + thousands separators in \`value\`
  and set \`format: "currency"\`.
- For percent cells: include a "%" sign in \`value\` and set \`format: "percent"\`.
- For negative dollars, use "-\$1,500" NOT "(\$1,500)".
- Integer counts (customers, users) use \`format: "integer"\`.
- Label column (column A) cells are \`role: "label"\` (bold, left-aligned).
- First row is \`role: "header"\`.
- Section-break rows span the row with a single cell at column A whose value
  is an uppercase title like "MRR & REVENUE" and \`role: "section"\`. All
  other columns in that row should be blank cells (\`role: "blank"\`,
  \`value: ""\`).
- Subtotal rows use \`role: "subtotal"\`; grand-total rows use \`role: "total"\`.
- Leave a single blank row (\`role: "blank"\`, all empty) between sections.

## STRUCTURE

A Gartner-grade sheet reads top-to-bottom as a narrative:

  Row 1:      HEADER — column names (Metric, Jan, Feb, Mar, Q1 Total, QoQ %)
  Row 2:      blank
  Row 3:      SECTION — "REVENUE"
  Rows 4-8:   data lines (New MRR, Expansion, Churn, Net MRR with formula)
  Row 9:      SUBTOTAL — "Net New MRR" across periods
  Row 10:     blank
  Row 11:     SECTION — "CUSTOMERS"
  ...etc
  Final row:  TOTAL — summary of the whole sheet

Prefer 20-40 rows per sheet. Never generate a naked 5-row table with no sections.

## THEME

Every spreadsheet carries a \`theme\` object at the top level. Pick ONE
palette that matches the topic's tone:

- "gartner-blue"  — classic consulting navy; use for finance / analyst / strategy
- "gartner-warm" — warm taupe + rust; use for retail / ops / brand
- "emerald"      — deep green + ivory; use for sustainability / biotech / climate
- "slate"        — graphite + cyan; use for engineering / infra / devops
- "light"        — white + charcoal; use when topic is neutral
- "dark"         — very dark slate; use when user asked for dark mode

Pick an \`accentColor\` hex that harmonizes (e.g. "#002060" for gartner-blue).
The viewer will derive header/section/total backgrounds from palette+accent.

## GOOD SHEET EXAMPLE (SaaS KPIs, small excerpt)

theme: { "palette": "gartner-blue", "accentColor": "#002060" }

Row 1 (header): [ {value:"METRIC",role:"header"},
                  {value:"Jan",role:"header"},
                  {value:"Feb",role:"header"},
                  {value:"Mar",role:"header"},
                  {value:"Q1 Total",role:"header"},
                  {value:"QoQ Growth",role:"header"} ]

Row 3 (section): [ {value:"MRR & REVENUE",role:"section"},
                   {value:"",role:"blank"}, ...x4 ]

Row 4 (data): [ {value:"New MRR",role:"label"},
                {value:"\$12,000", format:"currency"},
                {value:"\$15,000", format:"currency"},
                {value:"\$13,500", format:"currency"},
                {value:"\$40,500", format:"currency", formula:"=SUM(B4:D4)"},
                {value:"12.5%",    format:"percent",  formula:"=(E4/E4-1)*100"} ]

## WHAT TO AVOID

- Raw "=ROUND(...)" strings visible to the user.
- Plain grids with no section headers.
- Placeholder "Lorem ipsum" / "Sample Data".
- Uniform grey everything. The theme MUST actually appear in headers and
  section rows.
- Inconsistent decimals (pick 0 or 1 decimal places per format and stick to it).

## FINAL

Emit ONE call to emit_spreadsheet. Target 1-2 sheets for most requests; only
go to 3-4 sheets if the topic truly decomposes (e.g. MRR dashboard +
Customer cohort + Unit economics).`;

const cellItemSchema = {
  type: 'object' as const,
  properties: {
    value: { type: 'string', description: 'Displayed, pre-formatted value.' },
    formula: {
      type: 'string',
      description: 'Optional Excel formula starting with "=". The value must still be the pre-computed result.',
    },
    role: {
      type: 'string',
      enum: ['header', 'section', 'label', 'data', 'subtotal', 'total', 'blank'],
    },
    format: {
      type: 'string',
      enum: ['text', 'number', 'integer', 'currency', 'percent'],
    },
    bold: { type: 'boolean' },
    align: { type: 'string', enum: ['left', 'center', 'right'] },
  },
  required: ['value'],
};

const TOOL_SCHEMA = {
  name: 'emit_spreadsheet',
  description: 'Emit the full generated spreadsheet with theme + typed cell grid.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      theme: {
        type: 'object',
        properties: {
          palette: {
            type: 'string',
            enum: ['gartner-blue', 'gartner-warm', 'light', 'dark', 'emerald', 'slate'],
          },
          accentColor: { type: 'string', description: 'Hex color, e.g. #002060' },
        },
        required: ['palette', 'accentColor'],
      },
      sheets: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            cells: {
              type: 'array',
              description: '2-D grid; cells[row][col].',
              items: {
                type: 'array',
                items: cellItemSchema,
              },
            },
            frozenRows: { type: 'number' },
            frozenCols: { type: 'number' },
          },
          required: ['name', 'cells'],
        },
      },
    },
    required: ['title', 'theme', 'sheets'],
  },
};

interface ToolSheet {
  name?: string;
  cells?: Array<Array<{
    value?: string;
    formula?: string;
    role?: string;
    format?: string;
    bold?: boolean;
    align?: string;
  }>>;
  frozenRows?: number;
  frozenCols?: number;
}

interface ToolPayload {
  title?: string;
  description?: string;
  theme?: { palette?: string; accentColor?: string };
  sheets?: ToolSheet[];
}

const VALID_ROLES: CellRole[] = ['header', 'section', 'label', 'data', 'subtotal', 'total', 'blank'];
const VALID_FORMATS: CellFormat[] = ['text', 'number', 'integer', 'currency', 'percent'];
const VALID_PALETTES: SheetPalette[] = ['gartner-blue', 'gartner-warm', 'light', 'dark', 'emerald', 'slate'];

interface RawCell {
  value?: string;
  formula?: string;
  role?: string;
  format?: string;
  bold?: boolean;
  align?: string;
}

function normalizeCell(raw: RawCell | undefined): ICell {
  const cell: RawCell = raw ?? { value: '' };
  const role = cell.role && (VALID_ROLES as string[]).includes(cell.role)
    ? (cell.role as CellRole)
    : undefined;
  const format = cell.format && (VALID_FORMATS as string[]).includes(cell.format)
    ? (cell.format as CellFormat)
    : undefined;
  const align = cell.align === 'left' || cell.align === 'center' || cell.align === 'right'
    ? cell.align
    : undefined;
  return {
    value: typeof cell.value === 'string' ? cell.value : '',
    formula: typeof cell.formula === 'string' && cell.formula.startsWith('=') ? cell.formula : undefined,
    role,
    format,
    bold: typeof cell.bold === 'boolean' ? cell.bold : undefined,
    align,
  };
}

function normalizeTheme(raw?: { palette?: string; accentColor?: string }): ISheetTheme {
  const palette = raw?.palette && (VALID_PALETTES as string[]).includes(raw.palette)
    ? (raw.palette as SheetPalette)
    : 'gartner-blue';
  const accentColor = typeof raw?.accentColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.accentColor)
    ? raw.accentColor
    : '#002060';
  return { palette, accentColor };
}

function cellsToLegacyRows(cells: ICell[][]): string[][] {
  return cells.map((row) => row.map((c) => c.value ?? ''));
}

export async function generateSpreadsheet(
  req: GenerateSpreadsheetRequest,
  userId: mongoose.Types.ObjectId,
  writer: SpreadsheetSSEWriter
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  const model = resolveUserModel(req.model);

  writer.send('sheet_started', { topic: req.topic, model });

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [TOOL_SCHEMA as never],
      tool_choice: { type: 'tool', name: 'emit_spreadsheet' } as never,
      messages: [
        {
          role: 'user',
          content: `Topic: ${req.topic}\nStyle: ${req.style ?? 'detailed'}\nTarget sheet count: ${req.sheetCount ?? 1}\n\nBuild a Gartner-level spreadsheet. Include section headers, subtotal rows, live formulas with pre-computed values, and a coherent theme.`,
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

  const payload = toolUse.input as ToolPayload;

  if (!payload || !Array.isArray(payload.sheets) || payload.sheets.length === 0) {
    console.warn('[spreadsheet] malformed tool output', JSON.stringify(toolUse.input).slice(0, 500));
    writer.send('error', {
      message: 'Model returned a spreadsheet tool call with no sheets. Please retry.',
    });
    writer.end();
    return;
  }

  const theme = normalizeTheme(payload.theme);

  const normalizedSheets: Array<{
    name: string;
    cells: ICell[][];
    frozenRows?: number;
    frozenCols?: number;
  }> = payload.sheets.map((sh, i) => {
    const name = (sh?.name ?? `Sheet ${i + 1}`).slice(0, 60);
    const grid = Array.isArray(sh?.cells) ? sh.cells : [];
    const cells: ICell[][] = grid.map((row) =>
      Array.isArray(row) ? row.map((c) => normalizeCell(c)) : []
    );
    return {
      name,
      cells,
      frozenRows: typeof sh?.frozenRows === 'number' ? sh.frozenRows : 1,
      frozenCols: typeof sh?.frozenCols === 'number' ? sh.frozenCols : 1,
    };
  });

  // Stream sheet_meta + sheet_row events row-by-row so the viewer paints
  // incrementally. Each row carries both the raw cell objects (new shape)
  // and a legacy `values` string[] so older clients don't crash.
  writer.send('sheet_theme', { theme });
  for (let s = 0; s < normalizedSheets.length; s++) {
    const sh = normalizedSheets[s];
    writer.send('sheet_meta', {
      index: s,
      name: sh.name,
      rowCount: sh.cells.length,
      frozenRows: sh.frozenRows,
      frozenCols: sh.frozenCols,
      theme,
    });
    for (let r = 0; r < sh.cells.length; r++) {
      const rowCells = sh.cells[r];
      writer.send('sheet_row', {
        sheetIndex: s,
        rowIndex: r,
        cells: rowCells.map((c) => c.value),
        richCells: rowCells,
      });
    }
  }

  // Persist — store the rich cells AND the legacy rows for backwards compat.
  const sheetsForDb: ISheet[] = normalizedSheets.map((sh) => ({
    name: sh.name,
    cells: sh.cells,
    rows: cellsToLegacyRows(sh.cells),
    frozenRows: sh.frozenRows,
    frozenCols: sh.frozenCols,
    theme,
  }));

  const doc = await SpreadsheetFile.create({
    userId,
    title: payload.title ?? req.topic.slice(0, 80),
    description: payload.description,
    sheets: sheetsForDb,
    theme,
    sourcePrompt: req.topic,
  });

  // Kick off the E2B-backed openpyxl build. This lights up Mr8's Computer
  // panel via code-execution-start/result events and produces a fully-styled
  // .xlsx on disk. The build is optional: if E2B is unreachable we still
  // return the cell grid and let the client's SheetJS fallback generate the
  // download client-side.
  let xlsxUrl: string | undefined;
  let sandboxId: string | undefined;
  if (process.env.E2B_API_KEY) {
    try {
      const build = await buildStyledSpreadsheet(
        {
          userId: userId.toString(),
          title: doc.title,
          theme,
          sheets: normalizedSheets,
        },
        {
          send(event, data) {
            writer.send(event, data);
          },
        }
      );
      xlsxUrl = build.publicUrl;
      sandboxId = build.sandboxId;
      doc.xlsxUrl = xlsxUrl;
      doc.sandboxId = sandboxId;
      await doc.save();
      writer.send('sheet_xlsx_ready', {
        xlsxUrl,
        sizeBytes: build.sizeBytes,
        durationMs: build.durationMs,
      });
    } catch (buildErr) {
      const message = buildErr instanceof Error ? buildErr.message : String(buildErr);
      writer.send('sheet_xlsx_failed', { message });
      // Fall through — the row stream + client-side SheetJS export still work.
    }
  }

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
    theme,
    xlsxUrl,
  });
  writer.end();
}
