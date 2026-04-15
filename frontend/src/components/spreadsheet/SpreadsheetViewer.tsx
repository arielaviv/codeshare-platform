/**
 * Read-only grid viewer with SheetJS download buttons (.xlsx / .csv).
 * Renders the live stream of sheets as rows arrive, then stays in place
 * after completion.
 */
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

export interface SheetData {
  name: string;
  rows: string[][];
}

interface Props {
  sheets: SheetData[];
  title?: string;
  /** Set to true while SSE is still streaming; shows a live pulse. */
  streaming?: boolean;
}

export default function SpreadsheetViewer({ sheets, title, streaming }: Props): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeSheet = sheets[activeIdx];

  const handleDownloadXlsx = () => {
    if (sheets.length === 0) return;
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(s.rows);
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); // excel sheet-name limit
    }
    XLSX.writeFile(wb, `${title ?? 'spreadsheet'}.xlsx`);
  };

  const handleDownloadCsv = () => {
    if (!activeSheet) return;
    const ws = XLSX.utils.aoa_to_sheet(activeSheet.rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSheet.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dims = useMemo(() => {
    if (!activeSheet) return { rows: 0, cols: 0 };
    const cols = activeSheet.rows.reduce((m, r) => Math.max(m, r.length), 0);
    return { rows: activeSheet.rows.length, cols };
  }, [activeSheet]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0A0A0A]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0F0F0F]">
        <div className="flex items-center gap-2 min-w-0">
          {streaming && (
            <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-ink dark:text-[#E8E8E8] truncate">
            {title ?? 'Untitled'}
          </span>
          {activeSheet && (
            <span className="text-[11px] text-ink-tertiary dark:text-[#666] tabular-nums flex-shrink-0">
              {dims.rows} × {dims.cols}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!activeSheet}
            className="px-2.5 py-1 text-[11px] border border-edge dark:border-[#2A2A2A] rounded text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8] hover:bg-white dark:hover:bg-[#1A1A1A] disabled:opacity-40 transition-colors"
          >
            Download .csv
          </button>
          <button
            type="button"
            onClick={handleDownloadXlsx}
            disabled={sheets.length === 0}
            className="px-2.5 py-1 text-[11px] border border-edge dark:border-[#2A2A2A] rounded text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8] hover:bg-white dark:hover:bg-[#1A1A1A] disabled:opacity-40 transition-colors"
          >
            Download .xlsx
          </button>
        </div>
      </div>

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-0 px-2 py-1 border-b border-edge dark:border-[#1A1A1A] bg-surface-secondary dark:bg-[#0F0F0F] overflow-x-auto subtle-scrollbar">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1.5 text-[12px] rounded whitespace-nowrap transition-colors ${
                i === activeIdx
                  ? 'bg-white dark:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] font-medium shadow-sm'
                  : 'text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {!activeSheet || activeSheet.rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-ink-tertiary dark:text-[#666]">
            {streaming ? 'Generating…' : 'Empty sheet'}
          </div>
        ) : (
          <table className="border-collapse text-[13px] font-mono w-max min-w-full">
            <tbody>
              {activeSheet.rows.map((row, r) => (
                <tr key={r} className={r === 0 ? 'bg-surface-secondary dark:bg-[#0F0F0F]' : ''}>
                  <td className="sticky left-0 z-10 bg-surface-secondary dark:bg-[#0F0F0F] border border-edge dark:border-[#1A1A1A] px-2 py-1 text-[11px] text-ink-tertiary dark:text-[#666] tabular-nums text-center min-w-[40px]">
                    {r + 1}
                  </td>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`border border-edge dark:border-[#1A1A1A] px-2 py-1 min-w-[120px] max-w-[300px] ${
                        r === 0
                          ? 'font-semibold text-ink dark:text-[#E8E8E8]'
                          : 'text-ink-secondary dark:text-[#D4D4D4]'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
