import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeBusqueda, parseDgaXlsx, type DgaProducto } from "@/lib/dga-productos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Loader2, History, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const NUEVO_FIELDS: Array<{ k: keyof typeof emptyNuevo; label: string; required?: boolean }> = [
  { k: "codigo_producto", label: "Código de Producto", required: true },
  { k: "partida_arancelaria", label: "Partida Arancelaria" },
  { k: "nombre_producto", label: "Nombre de Producto", required: true },
  { k: "marca", label: "Marca" },
  { k: "modelo", label: "Modelo" },
  { k: "unidad", label: "Unidad" },
  { k: "pais", label: "País" },
  { k: "regimen", label: "Régimen" },
  { k: "estado", label: "Estado" },
];

const emptyNuevo = {
  codigo_producto: "",
  partida_arancelaria: "",
  nombre_producto: "",
  marca: "",
  modelo: "",
  unidad: "",
  pais: "",
  regimen: "",
  estado: "",
  especificaciones: "",
};

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
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevo, setNuevo] = useState<Record<string, string>>({ ...emptyNuevo });
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const abrirNuevo = () => {
    setNuevo({ ...emptyNuevo });
    setOpen(false);
    setNuevoOpen(true);
  };

  const onFile = async (file: File) => {
    setSubiendo(true);
    try {
      const unique = await parseDgaXlsx(file);
      if (unique.length === 0) {
        toast.error("No se encontraron filas con 'Código de Producto' en el archivo.");
        return;
      }
      if (unique.length === 1) {
        const r = unique[0];
        setNuevo({
          codigo_producto: r.codigo_producto ?? "",
          partida_arancelaria: r.partida_arancelaria ?? "",
          nombre_producto: r.nombre_producto ?? "",
          marca: r.marca ?? "",
          modelo: r.modelo ?? "",
          unidad: r.unidad ?? "",
          pais: r.pais ?? "",
          regimen: r.regimen ?? "",
          estado: r.estado ?? "",
          especificaciones: r.especificaciones ?? "",
        });
        toast.success("Datos cargados desde el archivo. Revísalos y guarda.");
        return;
      }
      let ok = 0;
      for (let i = 0; i < unique.length; i += 500) {
        const chunk = unique.slice(i, i + 500);
        const { error } = await supabase
          .from("dga_productos_historico")
          .upsert(chunk as any, { onConflict: "codigo_producto" });
        if (error) throw error;
        ok += chunk.length;
      }
      toast.success(`${ok} productos cargados al catálogo`);
      setNuevoOpen(false);
      setNuevo({ ...emptyNuevo });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const guardarNuevo = async () => {
    const codigo = nuevo.codigo_producto.trim();
    const nombre = nuevo.nombre_producto.trim();
    if (!codigo || !nombre) {
      toast.error("Código de Producto y Nombre de Producto son obligatorios");
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        codigo_producto: codigo,
        partida_arancelaria: nuevo.partida_arancelaria.trim() || null,
        nombre_producto: nombre,
        marca: nuevo.marca.trim() || null,
        modelo: nuevo.modelo.trim() || null,
        unidad: nuevo.unidad.trim() || null,
        pais: nuevo.pais.trim() || null,
        especificaciones: nuevo.especificaciones.trim() || null,
        regimen: nuevo.regimen.trim() || null,
        estado: nuevo.estado.trim() || "Activo",
      };
      const { error } = await supabase.from("dga_productos_historico").insert(payload as any);
      if (error) {
        if ((error as any).code === "23505") throw new Error(`El código "${codigo}" ya existe en el catálogo DGA.`);
        throw error;
      }
      toast.success("Producto agregado al catálogo DGA");
      onSelect(payload as unknown as DgaProducto, true);
      setNuevoOpen(false);
      setNuevo({ ...emptyNuevo });
      setQ("");
      setRows([]);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar el producto");
    } finally {
      setGuardando(false);
    }
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
          <li className="border-t">
            <button
              type="button"
              onClick={abrirNuevo}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm text-primary flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Agregar producto nuevo al catálogo DGA
            </button>
          </li>
        </ul>
      )}
      {open && !loading && normalizeBusqueda(q).length >= 2 && rows.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg px-3 py-2 text-xs text-muted-foreground">
          <p className="py-1">Sin coincidencias en el histórico. Puedes declarar el producto como nuevo.</p>
          <button
            type="button"
            onClick={abrirNuevo}
            className="w-full text-left border-t px-0 py-2 hover:bg-accent text-sm text-primary flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Agregar producto nuevo al catálogo DGA
          </button>
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

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar producto nuevo al catálogo DGA</DialogTitle>
            <DialogDescription>
              Se guarda en el histórico con estado Activo y se usa de inmediato en la línea que estabas llenando.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={subiendo}>
              {subiendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {subiendo ? "Procesando…" : "Cargar desde Excel"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Archivo .xlsx de la DGA. Una sola fila precarga el formulario; varias filas se cargan al catálogo.
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {NUEVO_FIELDS.map((f) => (
              <div key={f.k as string} className="grid gap-1.5">
                <Label>{f.label}{f.required ? " *" : ""}</Label>
                <Input
                  value={nuevo[f.k as string] ?? ""}
                  onChange={(e) => setNuevo((p) => ({ ...p, [f.k as string]: e.target.value }))}
                />
              </div>
            ))}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Especificaciones</Label>
              <Textarea
                value={nuevo.especificaciones}
                onChange={(e) => setNuevo((p) => ({ ...p, especificaciones: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNuevoOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={guardarNuevo} disabled={guardando}>
              {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar y usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
