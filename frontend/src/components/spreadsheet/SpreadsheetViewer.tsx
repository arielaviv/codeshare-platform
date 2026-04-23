/**
 * Gartner-level spreadsheet viewer.
 *
 * Renders a themed, role-aware grid: header row bolded on an accent strip,
 * section-break rows span full width with a band color, subtotal/total rows
 * get sub-bands, data cells right-align numeric formats, and hovering a
 * formula cell reveals the raw "=..." in a tooltip.
 *
 * Preferred input is the rich `cells` shape; a legacy `rows: string[][]`
 * fallback keeps older documents rendering.
 */
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { RichCell, SheetTheme, SheetPalette } from '../../services/spreadsheetStream';
import { getStaticBase } from '../../lib/apiBase';

export interface SheetData {
  name: string;
  /** New rich grid; preferred. */
  cells?: RichCell[][];
  /** Legacy flat string grid. */
  rows?: string[][];
  frozenRows?: number;
  frozenCols?: number;
  theme?: SheetTheme;
}

interface Props {
  sheets: SheetData[];
  title?: string;
  theme?: SheetTheme;
  /** Public URL of the openpyxl-built .xlsx on the server. When set, the
   *  Download .xlsx button streams the styled server file instead of the
   *  client-side SheetJS fallback (which cannot carry theme formatting). */
  xlsxUrl?: string;
  /** Set to true while SSE is still streaming; shows a live pulse. */
  streaming?: boolean;
}

interface PaletteSpec {
  headerBg: string;
  headerFg: string;
  sectionBg: string;
  sectionFg: string;
  subtotalBg: string;
  totalBg: string;
  totalFg: string;
  labelFg: string;
  dataFg: string;
  gridLine: string;
  negative: string;
  surface: string;
  surfaceAlt: string;
}

const PALETTES: Record<SheetPalette, PaletteSpec> = {
  'gartner-blue': {
    headerBg: '#002060',
    headerFg: '#FFFFFF',
    sectionBg: '#DCE6F4',
    sectionFg: '#002060',
    subtotalBg: '#EEF3FB',
    totalBg: '#002060',
    totalFg: '#FFFFFF',
    labelFg: '#0F172A',
    dataFg: '#1E293B',
    gridLine: '#E3E8F0',
    negative: '#B91C1C',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F9FC',
  },
  'gartner-warm': {
    headerBg: '#5B3A1E',
    headerFg: '#FFF8F0',
    sectionBg: '#F3E6D6',
    sectionFg: '#5B3A1E',
    subtotalBg: '#FAF3E9',
    totalBg: '#C7792F',
    totalFg: '#FFF8F0',
    labelFg: '#3A2410',
    dataFg: '#4A3520',
    gridLine: '#EADFCF',
    negative: '#B91C1C',
    surface: '#FFFDFA',
    surfaceAlt: '#FAF5ED',
  },
  emerald: {
    headerBg: '#064E3B',
    headerFg: '#ECFDF5',
    sectionBg: '#D1FAE5',
    sectionFg: '#064E3B',
    subtotalBg: '#ECFDF5',
    totalBg: '#064E3B',
    totalFg: '#ECFDF5',
    labelFg: '#0F2E25',
    dataFg: '#14332B',
    gridLine: '#D8EFE4',
    negative: '#B91C1C',
    surface: '#FFFFFF',
    surfaceAlt: '#F3FAF6',
  },
  slate: {
    headerBg: '#1E293B',
    headerFg: '#E2E8F0',
    sectionBg: '#E2E8F0',
    sectionFg: '#0F172A',
    subtotalBg: '#F1F5F9',
    totalBg: '#0F172A',
    totalFg: '#F8FAFC',
    labelFg: '#0F172A',
    dataFg: '#1E293B',
    gridLine: '#E2E8F0',
    negative: '#B91C1C',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFC',
  },
  light: {
    headerBg: '#111827',
    headerFg: '#FFFFFF',
    sectionBg: '#F3F4F6',
    sectionFg: '#111827',
    subtotalBg: '#F9FAFB',
    totalBg: '#111827',
    totalFg: '#FFFFFF',
    labelFg: '#111827',
    dataFg: '#1F2937',
    gridLine: '#E5E7EB',
    negative: '#B91C1C',
    surface: '#FFFFFF',
    surfaceAlt: '#F9FAFB',
  },
  dark: {
    headerBg: '#0A0A0A',
    headerFg: '#E8E8E8',
    sectionBg: '#1A1A1A',
    sectionFg: '#FB7701',
    subtotalBg: '#141414',
    totalBg: '#FB7701',
    totalFg: '#0A0A0A',
    labelFg: '#E8E8E8',
    dataFg: '#C8C8C8',
    gridLine: '#222222',
    negative: '#F87171',
    surface: '#0A0A0A',
    surfaceAlt: '#141414',
  },
};

function resolvePalette(theme?: SheetTheme): PaletteSpec {
  const palette = theme?.palette ?? 'gartner-blue';
  const base = PALETTES[palette] ?? PALETTES['gartner-blue'];
  const accent = theme?.accentColor;
  // Accent color overrides only the strongest accents (header band + total row).
  if (accent) {
    return { ...base, headerBg: accent, totalBg: accent };
  }
  return base;
}

function normalizeRows(sheet: SheetData): RichCell[][] {
  if (sheet.cells && sheet.cells.length > 0) return sheet.cells;
  if (sheet.rows) {
    return sheet.rows.map((row, r) =>
      row.map<RichCell>((v, c) => ({
        value: v,
        role: r === 0 ? 'header' : c === 0 ? 'label' : 'data',
      }))
    );
  }
  return [];
}

function isNumericFormat(fmt?: string): boolean {
  return fmt === 'number' || fmt === 'integer' || fmt === 'currency' || fmt === 'percent';
}

function isNegative(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return true;
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return true;
  return false;
}

export default function SpreadsheetViewer({ sheets, title, theme, xlsxUrl, streaming }: Props): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeSheet = sheets[activeIdx];

  const palette = useMemo(
    () => resolvePalette(activeSheet?.theme ?? theme),
    [activeSheet?.theme, theme]
  );

  const handleDownloadXlsx = async () => {
    if (sheets.length === 0) return;
    // Prefer the server-built .xlsx (carries full openpyxl styling). Fall
    // back to the client-side SheetJS export if the server file is absent.
    if (xlsxUrl) {
      try {
        const absoluteUrl = xlsxUrl.startsWith('http')
          ? xlsxUrl
          : `${getStaticBase()}${xlsxUrl}`;
        const resp = await fetch(absoluteUrl);
        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title ?? 'spreadsheet'}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      } catch {
        // fall through to client-side fallback
      }
    }
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
      const grid = normalizeRows(s);
      const aoa = grid.map((row) => row.map((c) => (c.formula ? c.formula : c.value)));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    }
    XLSX.writeFile(wb, `${title ?? 'spreadsheet'}.xlsx`);
  };

  const handleDownloadCsv = () => {
    if (!activeSheet) return;
    const grid = normalizeRows(activeSheet);
    const aoa = grid.map((row) => row.map((c) => c.value));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSheet.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const grid = activeSheet ? normalizeRows(activeSheet) : [];
  const dims = useMemo(() => {
    if (grid.length === 0) return { rows: 0, cols: 0 };
    const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
    return { rows: grid.length, cols };
  }, [grid]);

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: palette.surface, color: palette.dataFg }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: palette.surfaceAlt, borderColor: palette.gridLine }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {streaming && (
            <span
              className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
              style={{ background: theme?.accentColor ?? palette.headerBg }}
            />
          )}
          <span className="text-sm font-semibold truncate" style={{ color: palette.labelFg }}>
            {title ?? 'Untitled'}
          </span>
          {activeSheet && (
            <span className="text-[11px] tabular-nums flex-shrink-0 opacity-60">
              {dims.rows} × {dims.cols}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!activeSheet}
            className="px-2.5 py-1 text-[11px] border rounded transition-colors disabled:opacity-40"
            style={{ borderColor: palette.gridLine, color: palette.labelFg }}
          >
            Download .csv
          </button>
          <button
            type="button"
            onClick={handleDownloadXlsx}
            disabled={sheets.length === 0}
            className="px-2.5 py-1 text-[11px] rounded transition-colors disabled:opacity-40"
            style={{ background: palette.headerBg, color: palette.headerFg }}
          >
            Download .xlsx
          </button>
        </div>
      </div>

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div
          className="flex items-center gap-0 px-2 py-1 border-b overflow-x-auto subtle-scrollbar"
          style={{ background: palette.surfaceAlt, borderColor: palette.gridLine }}
        >
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className="px-3 py-1.5 text-[12px] rounded whitespace-nowrap transition-colors"
              style={
                i === activeIdx
                  ? { background: palette.surface, color: palette.labelFg, fontWeight: 600 }
                  : { color: palette.labelFg, opacity: 0.55 }
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {!activeSheet || grid.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm opacity-50">
            {streaming ? 'Generating…' : 'Empty sheet'}
          </div>
        ) : (
          <table
            className="border-collapse text-[13px] w-max min-w-full"
            style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
          >
            <tbody>
              {grid.map((row, r) => {
                const firstCell = row[0];
                const isSection = firstCell?.role === 'section';
                const isTotal = firstCell?.role === 'total';
                const isSubtotal = firstCell?.role === 'subtotal';
                const isHeader = firstCell?.role === 'header';
                const isBlank = row.every((c) => !c.value);

                // Section rows render as a single spanned cell with the band color.
                if (isSection) {
                  const colSpan = Math.max(dims.cols, 1);
                  return (
                    <tr key={r}>
                      <td
                        className="px-3 py-2 text-[11px] text-center tabular-nums opacity-50"
                        style={{ background: palette.sectionBg, borderTop: `1px solid ${palette.gridLine}`, borderBottom: `1px solid ${palette.gridLine}` }}
                      >
                        {r + 1}
                      </td>
                      <td
                        colSpan={colSpan}
                        className="px-3 py-2 text-[12px] font-semibold tracking-wider uppercase"
                        style={{
                          background: palette.sectionBg,
                          color: palette.sectionFg,
                          borderTop: `1px solid ${palette.gridLine}`,
                          borderBottom: `1px solid ${palette.gridLine}`,
                        }}
                      >
                        {firstCell.value}
                      </td>
                    </tr>
                  );
                }

                let rowBg = palette.surface;
                let rowFg = palette.dataFg;
                let rowWeight: number | undefined;
                if (isHeader) {
                  rowBg = palette.headerBg;
                  rowFg = palette.headerFg;
                  rowWeight = 600;
                } else if (isTotal) {
                  rowBg = palette.totalBg;
                  rowFg = palette.totalFg;
                  rowWeight = 600;
                } else if (isSubtotal) {
                  rowBg = palette.subtotalBg;
                  rowWeight = 600;
                } else if (isBlank) {
                  rowBg = palette.surface;
                }

                return (
                  <tr key={r}>
                    <td
                      className="sticky left-0 z-10 px-2 py-1 text-[11px] tabular-nums text-center min-w-[40px]"
                      style={{
                        background: palette.surfaceAlt,
                        color: palette.labelFg,
                        opacity: 0.5,
                        borderRight: `1px solid ${palette.gridLine}`,
                        borderBottom: `1px solid ${palette.gridLine}`,
                      }}
                    >
                      {r + 1}
                    </td>
                    {row.map((cell, c) => {
                      const isLabel = cell.role === 'label' || (c === 0 && !isHeader && !isTotal);
                      const numeric = isNumericFormat(cell.format);
                      const align = cell.align ?? (numeric ? 'right' : isLabel || isHeader ? 'left' : 'left');
                      const isNeg = numeric && isNegative(cell.value);
                      const fg = isHeader
                        ? palette.headerFg
                        : isTotal
                          ? palette.totalFg
                          : isNeg
                            ? palette.negative
                            : isLabel
                              ? palette.labelFg
                              : rowFg;
                      const weight = cell.bold || isHeader || isTotal || isSubtotal || isLabel ? 600 : 400;
                      return (
                        <td
                          key={c}
                          title={cell.formula ?? undefined}
                          className="px-3 py-1.5 min-w-[120px] max-w-[320px] tabular-nums whitespace-nowrap"
                          style={{
                            background: rowBg,
                            color: fg,
                            fontWeight: rowWeight ?? weight,
                            textAlign: align,
                            borderRight: `1px solid ${palette.gridLine}`,
                            borderBottom: `1px solid ${palette.gridLine}`,
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {cell.value}
                            {cell.formula && !isHeader && (
                              <span
                                className="text-[9px] opacity-40 font-mono"
                                style={{ color: fg }}
                                aria-hidden
                              >
                                fx
                              </span>
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
