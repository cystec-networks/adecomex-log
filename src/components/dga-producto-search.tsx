import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeBusqueda, type DgaProducto } from "@/lib/dga-productos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, History } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  /** Se llama con los datos del producto elegido. `reusarCodigo` indica si debe copiarse el ProductCode. */
  onSelect: (p: DgaProducto, reusarCodigo: boolean) => void;
};

export function DgaProductoSearch({ onSelect }: Props) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DgaProducto[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [elegido, setElegido] = useState<DgaProducto | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    const term = normalizeBusqueda(q);
    if (term.length < 2) { setRows([]); return; }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("dga_productos_historico")
        .select("codigo_producto,partida_arancelaria,nombre_producto,cod_marca,marca,cod_modelo,modelo,unidad,pais,especificaciones,regimen,estado,pct_gravamen,aplica_isc,pct_isc,pct_itbis")
        .ilike("busqueda", `%${term.replace(/[%_]/g, " ")}%`)
        .order("nombre_producto")
        .limit(15);
      setRows((data as DgaProducto[]) ?? []);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [q]);

  const pick = (p: DgaProducto) => { setElegido(p); setOpen(false); };

  const aplicar = (reusarCodigo: boolean) => {
    if (!elegido) return;
    onSelect(elegido, reusarCodigo);
    setElegido(null);
    setQ("");
    setRows([]);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => rows.length && setOpen(true)}
          placeholder="Buscar en histórico DGA por partida o nombre de producto…"
          className="pl-9 h-9"
        />
        {loading && <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
        <History className="h-3 w-3" /> Histórico de referencia — no es obligatorio; siempre puedes declarar un producto nuevo.
      </p>

      {open && rows.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-lg">
          {rows.map((p) => (
            <li key={p.codigo_producto}>
              <button
                type="button"
                onClick={() => pick(p)}
                className="w-full text-left px-3 py-2 hover:bg-accent flex flex-col gap-0.5"
              >
                <span className="text-sm font-medium truncate">{p.nombre_producto || "(sin nombre)"}</span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {p.codigo_producto}{p.partida_arancelaria ? ` · ${p.partida_arancelaria}` : ""}
                  {p.marca ? ` · ${p.marca}` : ""}{p.modelo ? ` · ${p.modelo}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && normalizeBusqueda(q).length >= 2 && rows.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg px-3 py-3 text-xs text-muted-foreground">
          Sin coincidencias en el histórico. Puedes declarar el producto como nuevo.
        </div>
      )}

      <Dialog open={!!elegido} onOpenChange={(v) => !v && setElegido(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Usar producto del histórico</DialogTitle>
            <DialogDescription>
              Decide si reutilizas el ProductCode existente en SIGA o dejas que SIGA asigne uno nuevo.
            </DialogDescription>
          </DialogHeader>
          {elegido && (
            <div className="text-sm space-y-1">
              <div className="font-medium">{elegido.nombre_producto}</div>
              <div className="text-xs text-muted-foreground font-mono">{elegido.codigo_producto}</div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {elegido.partida_arancelaria && <Badge variant="secondary">Partida {elegido.partida_arancelaria}</Badge>}
                {elegido.marca && <Badge variant="outline">Marca: {elegido.marca}</Badge>}
                {elegido.modelo && <Badge variant="outline">Modelo: {elegido.modelo}</Badge>}
                {elegido.unidad && <Badge variant="outline">{elegido.unidad}</Badge>}
              </div>
              {elegido.especificaciones && (
                <p className="text-xs text-muted-foreground pt-1">{elegido.especificaciones}</p>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => aplicar(false)}>
              Copiar datos sin ProductCode
            </Button>
            <Button onClick={() => aplicar(true)}>Reutilizar ProductCode existente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
