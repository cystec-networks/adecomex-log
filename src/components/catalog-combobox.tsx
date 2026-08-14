import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Row = { codigo: string; nombre: string; pais?: string | null; cod_pais?: string | null; tipo?: string | null };

export type CatalogTable =
  | "catalogo_paises"
  | "catalogo_puertos"
  | "catalogo_unidades"
  | "catalogo_acuerdos"
  | "catalogo_tipos_despacho"
  | "catalogo_estados_producto"
  | "catalogo_metodos_transporte";

// Catálogos que usan la columna booleana `activo`; el resto usa `estado` (texto).
const TABLAS_ACTIVO = new Set(["catalogo_paises", "catalogo_puertos", "catalogo_unidades"]);

type Props = {
  table: CatalogTable;
  value?: string; // nombre visible
  codigo?: string;
  onChange: (nombre: string, codigo: string, extra?: Row) => void;
  placeholder?: string;
  filterCodPais?: string; // puertos: filtrar por país
  disabled?: boolean;
  className?: string;
};

export function CatalogCombobox({
  table, value, codigo, onChange, placeholder = "Buscar…", filterCodPais, disabled, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const cols =
        table === "catalogo_puertos" ? "codigo, nombre, cod_pais, pais"
        : table === "catalogo_unidades" ? "codigo, nombre, tipo"
        : "codigo, nombre";
      let query: any = supabase.from(table).select(cols);
      if (TABLAS_ACTIVO.has(table)) query = query.eq("activo", true);
      const term = sanitizeSearchTerm(q);
      if (term) query = query.or(`nombre.ilike.%${term}%,codigo.ilike.%${term}%`);
      if (table === "catalogo_puertos" && filterCodPais) query = query.eq("cod_pais", filterCodPais);
      query = query.order("nombre").limit(50);
      const { data } = await query;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    }, 200);
    return () => window.clearTimeout(debounceRef.current);
  }, [q, open, table, filterCodPais]);

  const display = useMemo(() => {
    if (!value) return "";
    return codigo ? `${codigo} · ${value}` : value;
  }, [value, codigo]);

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
              <div className="px-3 py-4 text-xs text-muted-foreground">Sin resultados.</div>
            )}
            {!loading && rows.map((r) => (
              <button
                key={r.codigo}
                type="button"
                onClick={() => { onChange(r.nombre, r.codigo, r); setOpen(false); setQ(""); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start justify-between gap-2",
                  codigo === r.codigo && "bg-accent",
                )}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.nombre}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {r.codigo}
                    {r.pais && ` · ${r.pais}`}
                    {r.tipo && ` · ${r.tipo}`}
                  </div>
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
