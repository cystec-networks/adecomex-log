import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Progressive presentation for native and shared tables; original controls stay mounted. */
export function AdaptiveTables() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [tables, setTables] = useState<HTMLTableElement[]>([]);
  const [expanded, setExpanded] = useState<Set<HTMLTableElement>>(new Set());

  useEffect(() => {
    const root = anchor.current?.closest("main");
    if (!root) return;
    let frame = 0;
    const scan = () => {
      const found: HTMLTableElement[] = [];
      root.querySelectorAll<HTMLTableElement>("table:not(.expedientes-listado-tabla)").forEach((table) => {
        const headings = Array.from(table.tHead?.rows[0]?.cells ?? []);
        if (headings.length < 4 || table.closest('[data-print-only], #ficha-generales-print')) return;
        // Editable matrices retain column alignment and local horizontal scrolling.
        const matrix = !!table.querySelector('tbody input:not([type="checkbox"]):not([type="radio"]), tbody textarea, tbody [role="combobox"]');
        table.classList.toggle("adaptive-matrix", matrix);
        table.classList.toggle("adaptive-data-table", !matrix);
        if (matrix) return;
        const essential = new Set([0, 1]);
        headings.forEach((h, i) => { if (/estado|eta|fecha|total/i.test(h.textContent ?? "")) essential.add(i); });
        if (essential.size < 3) essential.add(2);
        const mark = (cell: HTMLTableCellElement, i: number) => {
          const label = (headings[i]?.textContent ?? "").trim();
          if (cell.dataset.columnLabel !== label) cell.dataset.columnLabel = label;
          const value = essential.has(i) ? "true" : "false";
          if (cell.dataset.essential !== value) cell.dataset.essential = value;
        };
        headings.forEach(mark);
        table.querySelectorAll<HTMLTableRowElement>("tbody > tr, tfoot > tr").forEach(row => {
          Array.from(row.cells).forEach(mark);
          row.classList.toggle("adaptive-summary-row", row.cells.length === 1 && row.cells[0].colSpan > 1);
        });
        found.push(table);
      });
      setTables(previous => previous.length === found.length && previous.every((t, i) => t === found[i]) ? previous : found);
    };
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    scan();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  return <><span ref={anchor} hidden />{tables.map((table, index) => table.parentElement && createPortal(
    <div className="adaptive-table-tools">
      <Button size="sm" variant="outline" aria-expanded={expanded.has(table)} onClick={() => {
        const next = !expanded.has(table);
        table.dataset.showColumns = String(next);
        setExpanded(previous => { const result = new Set(previous); next ? result.add(table) : result.delete(table); return result; });
      }}><Columns3 className="h-4 w-4" />{expanded.has(table) ? "Columnas esenciales" : "Ver más columnas"}</Button>
    </div>, table.parentElement, `adaptive-${index}`
  ))}</>;
}