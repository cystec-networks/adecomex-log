import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeSearchTerm, normalizarNombre, patronSinTildes } from "@/lib/search-filter";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type DgaTable = "dga_paises" | "dga_puertos" | "dga_areas";

type Row = {
  codigo: string;
  pais?: string | null;
  puerto?: string | null;
  area?: string | null;
  localizacion?: string | null;
  codigo_pais?: string | null;
};

const CFG: Record<DgaTable, { cols: string; label: (r: Row) => string; sub: (r: Row) => string }> = {
  dga_paises: {
    cols: "codigo, pais",
    label: (r) => r.pais ?? "",
    sub: (r) => r.codigo,
  },
  dga_puertos: {
    cols: "codigo, puerto, codigo_pais, pais",
    label: (r) => r.puerto ?? "",
    sub: (r) => `${r.codigo}${r.pais ? ` · ${r.pais}` : ""}`,
  },
  dga_areas: {
    cols: "codigo, area, localizacion",
    label: (r) => r.area ?? "",
    sub: (r) => `${r.codigo}${r.localizacion ? ` · ${r.localizacion}` : ""}`,
  },
};

type Props = {
  table: DgaTable;
  /** Nombre visible (país / puerto / área) */
  value?: string;
  /** Código oficial DGA guardado */
  codigo?: string;
  onChange: (nombre: string, codigo: string, extra?: Row) => void;
  placeholder?: string;
  /** Solo dga_puertos: filtra por código de país */
  filterCodPais?: string;
  disabled?: boolean;
  className?: string;
};

export function DgaCombobox({
  table, value, codigo, onChange, placeholder = "Buscar en catálogo DGA…", filterCodPais, disabled, className,
}: Props) {
  const cfg = CFG[table];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const nameCol = table === "dga_paises" ? "pais" : table === "dga_puertos" ? "puerto" : "area";

  useEffect(() => {
    if (!open) return;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      let query: any = supabase.from(table).select(cfg.cols);
      const term = sanitizeSearchTerm(q);
      if (term) query = query.or(`${nameCol}.ilike.%${term}%,codigo.ilike.%${term}%`);
      if (table === "dga_puertos" && filterCodPais) query = query.eq("codigo_pais", filterCodPais);
      query = query.order(nameCol).limit(50);
      const { data } = await query;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    }, 200);
    return () => window.clearTimeout(debounceRef.current);
  }, [q, open, table, filterCodPais, cfg.cols, nameCol]);

  // Resuelve el nombre cuando solo tenemos el código guardado.
  const [resolved, setResolved] = useState("");
  useEffect(() => {
    let cancel = false;
    if (!codigo || value) { setResolved(""); return; }
    (async () => {
      const { data } = await (supabase.from(table) as any).select(cfg.cols).eq("codigo", codigo).maybeSingle();
      if (!cancel && data) setResolved(cfg.label(data as Row));
    })();
    return () => { cancel = true; };
  }, [codigo, value, table, cfg]);

  // Refuerzo: si hay nombre pero no código, resuelve el código por coincidencia exacta
  // (sin distinguir mayúsculas ni tildes) contra el catálogo DGA.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    let cancel = false;
    const nombre = (value ?? "").trim();
    if (!nombre || codigo) return;
    (async () => {
      const patron = patronSinTildes(nombre);
      if (!patron) return;
      const { data } = await (supabase.from(table) as any)
        .select(cfg.cols)
        .ilike(nameCol, patron)
        .limit(20);
      if (cancel || !data) return;
      const matches = (data as Row[]).filter((r) => normalizarNombre(cfg.label(r)) === normalizarNombre(nombre));
      if (matches.length === 1) onChangeRef.current(cfg.label(matches[0]), matches[0].codigo, matches[0]);
    })();
    return () => { cancel = true; };
  }, [value, codigo, table, cfg, nameCol]);


  const display = useMemo(() => {
    const nombre = value || resolved;
    if (!nombre && !codigo) return "";
    if (nombre && codigo) return `${codigo} · ${nombre}`;
    return nombre || codigo || "";
  }, [value, resolved, codigo]);


  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between font-normal h-9"
          >
            <span className={cn("truncate", !display && "text-muted-foreground")}>
              {display || placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Escribe para buscar…"
              className="h-8"
            />
          </div>
          <div className="max-h-72 overflow-auto">
            {loading && <div className="px-3 py-4 text-xs text-muted-foreground">Buscando…</div>}
            {!loading && rows.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">Sin resultados en el catálogo DGA.</div>
            )}
            {!loading && rows.map((r) => (
              <button
                key={r.codigo}
                type="button"
                onClick={() => { onChange(cfg.label(r), r.codigo, r); setOpen(false); setQ(""); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start justify-between gap-2",
                  codigo === r.codigo && "bg-accent",
                )}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{cfg.label(r)}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums truncate">{cfg.sub(r)}</div>
                </div>
                {codigo === r.codigo && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {display && !disabled && (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Limpiar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
