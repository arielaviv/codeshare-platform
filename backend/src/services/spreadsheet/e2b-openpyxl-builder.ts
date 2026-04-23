/**
 * E2B openpyxl builder for spreadsheets.
 *
 * Takes the normalized cell grid + theme produced by the model, spins up (or
 * reuses) the user's shared E2B sandbox, runs an openpyxl script inside it
 * to materialize a fully-styled .xlsx, pulls the bytes back into Node, and
 * mirrors them to `/uploads/spreadsheets/<userId>/<filename>.xlsx` so the
 * frontend can link directly.
 *
 * Emits `code-execution-start` + `code-execution-result` SSE events so the
 * Mr8 Computer panel lights up exactly like the book formatter does.
 *
 * Mirrors the session-locking / pause pattern from
 * `services/computer/python-handler.ts` so it cooperates with any other
 * module (code-app, book, visualization) the user might run in parallel.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';
import {
  loadE2BConfig,
  createComputeSandbox,
  connectComputeSandbox,
  type E2BClientConfig,
} from '../computer/e2b-client';
import {
  acquireLock,
  getSession,
  upsertSession,
} from '../computer/e2b-session-store';
import { readBinaryFromSandbox } from '../book/sandbox-io';
import type { ICell, ISheetTheme } from '../../models/SpreadsheetFile';

const UPLOADS_BASE = path.join(__dirname, '../../../uploads/spreadsheets');
const SANDBOX_OUTPUT = '/home/user/output/spreadsheet.xlsx';
const BUILD_TIMEOUT_MS = 90_000;

export interface BuilderWriter {
  send(event: string, data: unknown): void;
}

export interface BuildInput {
  userId: string;
  title: string;
  theme: ISheetTheme;
  sheets: Array<{
    name: string;
    cells: ICell[][];
    frozenRows?: number;
    frozenCols?: number;
  }>;
}

export interface BuildOutput {
  publicUrl: string;
  filepath: string;
  sandboxId: string;
  sizeBytes: number;
  durationMs: number;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Try to reuse the user's cached sandbox; create a fresh one if none. */
async function acquireSandbox(
  config: E2BClientConfig,
  userId: string
): Promise<ComputeSandbox> {
  const session = getSession(userId);
  if (session?.computeSandboxId) {
    try {
      return await connectComputeSandbox(config, session.computeSandboxId);
    } catch {
      // stale — fall through to create
    }
  }
  const fresh = await createComputeSandbox(config);
  upsertSession(userId, { computeSandboxId: fresh.sandboxId, status: 'running' });
  return fresh;
}

/** JSON-encode the cell payload with a python-safe marker for formulas. */
function buildPythonScript(input: BuildInput): string {
  const payload = {
    title: input.title,
    theme: input.theme,
    sheets: input.sheets.map((sh) => ({
      name: sh.name,
      frozenRows: sh.frozenRows ?? 1,
      frozenCols: sh.frozenCols ?? 1,
      cells: sh.cells.map((row) =>
        row.map((c) => ({
          value: c.value ?? '',
          formula: c.formula,
          role: c.role,
          format: c.format,
          bold: c.bold,
          align: c.align,
        }))
      ),
    })),
  };

  const payloadJson = JSON.stringify(payload);
  // Escape closing triple-quotes just in case any user-supplied prose snuck in.
  const safeJson = payloadJson.replace(/"""/g, '\\"\\"\\"');

  return `import json, os, re
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

PAYLOAD = json.loads("""${safeJson}""")

PALETTES = {
    "gartner-blue":  {"headerBg":"002060","headerFg":"FFFFFF","sectionBg":"DCE6F4","sectionFg":"002060","subtotalBg":"EEF3FB","totalBg":"002060","totalFg":"FFFFFF","dataFg":"1E293B","gridLine":"E3E8F0"},
    "gartner-warm":  {"headerBg":"5B3A1E","headerFg":"FFF8F0","sectionBg":"F3E6D6","sectionFg":"5B3A1E","subtotalBg":"FAF3E9","totalBg":"C7792F","totalFg":"FFF8F0","dataFg":"4A3520","gridLine":"EADFCF"},
    "emerald":       {"headerBg":"064E3B","headerFg":"ECFDF5","sectionBg":"D1FAE5","sectionFg":"064E3B","subtotalBg":"ECFDF5","totalBg":"064E3B","totalFg":"ECFDF5","dataFg":"14332B","gridLine":"D8EFE4"},
    "slate":         {"headerBg":"1E293B","headerFg":"E2E8F0","sectionBg":"E2E8F0","sectionFg":"0F172A","subtotalBg":"F1F5F9","totalBg":"0F172A","totalFg":"F8FAFC","dataFg":"1E293B","gridLine":"E2E8F0"},
    "light":         {"headerBg":"111827","headerFg":"FFFFFF","sectionBg":"F3F4F6","sectionFg":"111827","subtotalBg":"F9FAFB","totalBg":"111827","totalFg":"FFFFFF","dataFg":"1F2937","gridLine":"E5E7EB"},
    "dark":          {"headerBg":"0A0A0A","headerFg":"E8E8E8","sectionBg":"1A1A1A","sectionFg":"FB7701","subtotalBg":"141414","totalBg":"FB7701","totalFg":"0A0A0A","dataFg":"C8C8C8","gridLine":"222222"},
}

def hex_no_hash(c):
    if not c:
        return None
    c = c.strip()
    return c[1:] if c.startswith("#") else c

theme = PAYLOAD.get("theme") or {}
palette_name = theme.get("palette", "gartner-blue")
palette = PALETTES.get(palette_name, PALETTES["gartner-blue"]).copy()
accent = hex_no_hash(theme.get("accentColor")) or palette["headerBg"]
palette["headerBg"] = accent
palette["totalBg"] = accent

NUM_RE = re.compile(r"^[\\s]*-?[\\$\\u20ac\\u00a3]?\\s*-?[0-9][0-9,]*(\\.[0-9]+)?\\s*%?\\s*$")

def parse_numeric(s):
    if s is None:
        return None
    raw = str(s).strip()
    if not raw:
        return None
    if raw.startswith("(") and raw.endswith(")"):
        raw = "-" + raw[1:-1]
    cleaned = raw.replace("$", "").replace("\\u20ac", "").replace("\\u00a3", "").replace(",", "").strip()
    percent = cleaned.endswith("%")
    if percent:
        cleaned = cleaned[:-1].strip()
    try:
        n = float(cleaned)
        if percent:
            n = n / 100.0
        return n
    except ValueError:
        return None

NUMBER_FORMATS = {
    "currency": '"$"#,##0.00',
    "percent":  '0.0%',
    "integer":  '#,##0',
    "number":   '#,##0.00',
    "text":     '@',
}

def side_grid():
    return Side(style="thin", color=palette["gridLine"])

grid_border = Border(left=side_grid(), right=side_grid(), top=side_grid(), bottom=side_grid())

wb = openpyxl.Workbook()
wb.remove(wb.active)

for sheet_data in PAYLOAD["sheets"]:
    ws = wb.create_sheet(title=sheet_data["name"][:31] or "Sheet")
    frozen_rows = int(sheet_data.get("frozenRows") or 1)
    frozen_cols = int(sheet_data.get("frozenCols") or 1)
    rows = sheet_data.get("cells") or []

    max_col = 0
    for r, row in enumerate(rows):
        max_col = max(max_col, len(row))
        first_role = row[0].get("role") if row else None
        is_section_row = first_role == "section"
        is_total_row = first_role == "total"
        is_subtotal_row = first_role == "subtotal"
        is_header_row = first_role == "header"

        for c, cell in enumerate(row):
            ws_cell = ws.cell(row=r+1, column=c+1)
            value = cell.get("value", "")
            formula = cell.get("formula")
            fmt = cell.get("format")
            role = cell.get("role")

            if formula and isinstance(formula, str) and formula.startswith("="):
                # openpyxl treats a string starting with "=" as a formula.
                ws_cell.value = formula
            elif fmt in ("currency", "percent", "integer", "number"):
                parsed = parse_numeric(value)
                ws_cell.value = parsed if parsed is not None else value
            else:
                ws_cell.value = value

            if fmt in NUMBER_FORMATS:
                ws_cell.number_format = NUMBER_FORMATS[fmt]

            # Default border + font
            font_kwargs = {"name": "Calibri", "size": 11}
            align_kwargs = {"vertical": "center"}
            fill = None

            if cell.get("align") in ("left", "center", "right"):
                align_kwargs["horizontal"] = cell["align"]
            elif fmt in ("currency", "percent", "integer", "number"):
                align_kwargs["horizontal"] = "right"
            elif role == "label" or c == 0:
                align_kwargs["horizontal"] = "left"
            else:
                align_kwargs["horizontal"] = "center" if is_header_row else "left"

            if is_header_row:
                fill = PatternFill(start_color=palette["headerBg"], end_color=palette["headerBg"], fill_type="solid")
                font_kwargs.update({"bold": True, "color": palette["headerFg"], "size": 11})
            elif is_section_row:
                fill = PatternFill(start_color=palette["sectionBg"], end_color=palette["sectionBg"], fill_type="solid")
                font_kwargs.update({"bold": True, "color": palette["sectionFg"], "size": 11})
                align_kwargs["horizontal"] = "left"
            elif is_total_row:
                fill = PatternFill(start_color=palette["totalBg"], end_color=palette["totalBg"], fill_type="solid")
                font_kwargs.update({"bold": True, "color": palette["totalFg"]})
            elif is_subtotal_row:
                fill = PatternFill(start_color=palette["subtotalBg"], end_color=palette["subtotalBg"], fill_type="solid")
                font_kwargs.update({"bold": True, "color": palette["dataFg"]})
            else:
                font_kwargs["color"] = palette["dataFg"]
                if role == "label" or cell.get("bold") or c == 0:
                    font_kwargs["bold"] = True

            ws_cell.font = Font(**font_kwargs)
            ws_cell.alignment = Alignment(**align_kwargs)
            ws_cell.border = grid_border
            if fill is not None:
                ws_cell.fill = fill

        # Merge section rows across all columns for a band look.
        if is_section_row and max_col > 1:
            try:
                ws.merge_cells(start_row=r+1, start_column=1, end_row=r+1, end_column=max_col)
            except Exception:
                pass

    # Column widths: first column wider (labels), rest uniform.
    for col_idx in range(1, max(max_col, 1) + 1):
        letter = get_column_letter(col_idx)
        ws.column_dimensions[letter].width = 28 if col_idx == 1 else 16

    # Row heights: headers a bit taller for presence.
    ws.row_dimensions[1].height = 28

    # Freeze header + label column.
    ws.freeze_panes = ws.cell(row=frozen_rows + 1, column=frozen_cols + 1).coordinate

    # Hide gridlines so our borders + fills do the talking.
    ws.sheet_view.showGridLines = False

os.makedirs(os.path.dirname("${SANDBOX_OUTPUT}"), exist_ok=True)
wb.save("${SANDBOX_OUTPUT}")
print("DONE bytes=" + str(os.path.getsize("${SANDBOX_OUTPUT}")))
`;
}

export async function buildStyledSpreadsheet(
  input: BuildInput,
  writer: BuilderWriter
): Promise<BuildOutput> {
  const config = loadE2BConfig();
  const release = await acquireLock(input.userId);
  const executionId = `py-${Date.now()}-sheet-${Math.random().toString(36).slice(2, 6)}`;
  const pythonCode = buildPythonScript(input);
  const startTime = Date.now();

  writer.send('code-execution-start', {
    executionId,
    code: pythonCode,
    language: 'python',
    description: 'Materialize styled .xlsx with openpyxl',
  });

  let sbx: ComputeSandbox | undefined;
  try {
    sbx = await acquireSandbox(config, input.userId);

    // Ensure openpyxl is present. On the stock code-interpreter template it
    // already is, but a quick `-q` install is a cheap safety net.
    await sbx.commands
      .run('python3 -c "import openpyxl" 2>/dev/null || pip install --quiet openpyxl', {
        timeoutMs: 30_000,
      })
      .catch(() => {});
    await sbx.commands
      .run('mkdir -p /home/user/output', { timeoutMs: 5_000 })
      .catch(() => {});

    const execution = await sbx.runCode(pythonCode, { timeoutMs: BUILD_TIMEOUT_MS });
    const stdout = (execution.logs?.stdout ?? []).join('\n');
    const stderr = (execution.logs?.stderr ?? []).join('\n');

    if (execution.error) {
      const durationMs = Date.now() - startTime;
      writer.send('code-execution-result', {
        executionId,
        status: 'error',
        stdout: stdout ? stdout.split('\n') : [],
        stderr: stderr ? stderr.split('\n') : [],
        error: {
          name: execution.error.name ?? 'Error',
          value: execution.error.value ?? '',
          traceback: execution.error.traceback ?? '',
        },
        results: [],
        outputFiles: [],
        durationMs,
      });
      throw new Error(`openpyxl build failed: ${execution.error.value}`);
    }

    const buf = await readBinaryFromSandbox(sbx, SANDBOX_OUTPUT);

    const userDir = path.join(UPLOADS_BASE, input.userId);
    ensureDir(userDir);
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.xlsx`;
    const filepath = path.join(userDir, filename);
    fs.writeFileSync(filepath, buf);
    const publicUrl = `/uploads/spreadsheets/${input.userId}/${filename}`;

    const durationMs = Date.now() - startTime;

    writer.send('code-execution-result', {
      executionId,
      status: 'success',
      stdout: stdout ? stdout.split('\n') : [],
      stderr: stderr ? stderr.split('\n') : [],
      results: [],
      outputFiles: [
        {
          path: 'spreadsheet.xlsx',
          format: 'xlsx',
          sizeBytes: buf.byteLength,
        },
      ],
      durationMs,
    });

    await sbx.pause().catch(() => {});
    upsertSession(input.userId, { status: 'paused' });

    return {
      publicUrl,
      filepath,
      sandboxId: sbx.sandboxId,
      sizeBytes: buf.byteLength,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    writer.send('code-execution-result', {
      executionId,
      status: 'error',
      stdout: [],
      stderr: [message],
      error: { name: 'SandboxError', value: message, traceback: '' },
      results: [],
      outputFiles: [],
      durationMs,
    });
    upsertSession(input.userId, { status: 'failed' });
    if (sbx) {
      await sbx.pause().catch(() => {});
    }
    throw err;
  } finally {
    release();
  }
}
