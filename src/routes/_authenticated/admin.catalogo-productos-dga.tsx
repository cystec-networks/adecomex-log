import { createFileRoute, redirect } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeBusqueda } from "@/lib/dga-productos";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Search, Loader2, Trash2, PackageSearch, Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/catalogo-productos-dga")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).eq("role", "admin");
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: CatalogoProductosDgaPage,
  head: () => ({
    meta: [
      { title: "Catálogo de Productos DGA | ADECOMEX" },
      { name: "description", content: "Histórico de productos declarados en SIGA, cargado manualmente desde el reporte .xlsx de la DGA." },
      { property: "og:title", content: "Catálogo de Productos DGA | ADECOMEX" },
      { property: "og:description", content: "Histórico de productos declarados en SIGA para agilizar la captura de líneas de producto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// Encabezados reales del reporte de la DGA. El matching es tolerante:
// se ignoran tildes, mayúsculas, puntuación, espacios extra y las palabras "de"/"del".
const COLUMN_ALIASES: Record<string, string[]> = {
  codigo_producto: ["Código de Producto", "Código Producto", "Codigo", "Product Code", "Cod Producto"],
  partida_arancelaria: ["Partida Arancelaria", "Partida", "HS Code", "Código Arancelario"],
  nombre_producto: ["Nombre de Producto", "Nombre Producto", "Producto", "Nombre", "Descripción"],
  cod_marca: ["Cod. Marca", "Código Marca", "Brand Code"],
  marca: ["Marca", "Brand"],
  cod_modelo: ["Cod. Modelo", "Código Modelo", "Model Code"],
  modelo: ["Modelo", "Model"],
  unidad: ["Unidad", "Unidad de Medida", "UM"],
  pais: ["País", "País Origen", "País de Origen", "Country"],
  especificaciones: ["Especificaciones", "Especificación", "Specification"],
  regimen: ["Régimen", "Régimen Aduanero"],
  estado: ["Estado", "Status"],
};

/** Clave tolerante: sin tildes, sin mayúsculas, sin puntuación, sin "de/del", sin espacios. */
function headerKey(h: string) {
  return normalizeBusqueda(String(h ?? ""))
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "de" && w !== "del")
    .join("");
}

const ALIAS_KEYS: Record<string, string[]> = Object.fromEntries(
  Object.entries(COLUMN_ALIASES).map(([f, a]) => [f, a.map(headerKey)]),
);

function mapRow(row: Record<string, any>) {
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) normalized[headerKey(k)] = v;
  const out: Record<string, string | null> = {};
  for (const [field, keys] of Object.entries(ALIAS_KEYS)) {
    let val: any = undefined;
    for (const a of keys) {
      if (normalized[a] != null && String(normalized[a]).trim() !== "") { val = normalized[a]; break; }
    }
    out[field] = val === undefined ? null : String(val).trim();
  }
  return out;
}


function CatalogoProductosDgaPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [borrar, setBorrar] = useState<string | null>(null);
  const [editar, setEditar] = useState<any | null>(null);

  const { data: total } = useQuery({
    queryKey: ["dga-productos-count"],
    queryFn: async () => {
      const { count } = await supabase.from("dga_productos_historico").select("codigo_producto", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["dga-productos-list", q],
    queryFn: async () => {
      let query = supabase.from("dga_productos_historico").select("*").order("updated_at", { ascending: false }).limit(100);
      const term = normalizeBusqueda(q);
      if (term) query = query.ilike("busqueda", `%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const eliminar = useMutation({
    mutationFn: async (codigo: string) => {
      const { error } = await supabase.from("dga_productos_historico").delete().eq("codigo_producto", codigo);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Producto eliminado del histórico");
      qc.invalidateQueries({ queryKey: ["dga-productos-list"] });
      qc.invalidateQueries({ queryKey: ["dga-productos-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const guardar = useMutation({
    mutationFn: async (r: any) => {
      const num = (v: any) => (v === "" || v == null ? null : Number(v));
      const { error } = await supabase
        .from("dga_productos_historico")
        .update({
          nombre_producto: r.nombre_producto || null,
          partida_arancelaria: r.partida_arancelaria || null,
          marca: r.marca || null,
          modelo: r.modelo || null,
          unidad: r.unidad || null,
          pais: r.pais || null,
          especificaciones: r.especificaciones || null,
          pct_gravamen: num(r.pct_gravamen),
          aplica_isc: !!r.aplica_isc,
          pct_isc: r.aplica_isc ? num(r.pct_isc) : null,
          pct_itbis: num(r.pct_itbis),
        })
        .eq("codigo_producto", r.codigo_producto);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Producto actualizado");
      setEditar(null);
      qc.invalidateQueries({ queryKey: ["dga-productos-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onFile = async (file: File) => {
    setSubiendo(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const mapped = json.map(mapRow).filter((r) => r.codigo_producto);
      if (mapped.length === 0) {
        toast.error("No se encontraron filas con 'Código de Producto' en el archivo.");
        return;
      }
      // Deduplicar por codigo_producto dentro del mismo archivo
      const byCode = new Map<string, any>();
      mapped.forEach((r) => byCode.set(r.codigo_producto as string, r));
      const unique = Array.from(byCode.values());

      let ok = 0;
      for (let i = 0; i < unique.length; i += 500) {
        const chunk = unique.slice(i, i + 500);
        const { error } = await supabase
          .from("dga_productos_historico")
          .upsert(chunk as any, { onConflict: "codigo_producto" });
        if (error) throw error;
        ok += chunk.length;
      }
      toast.success(`${ok} producto(s) cargados/actualizados desde el archivo.`);
      qc.invalidateQueries({ queryKey: ["dga-productos-list"] });
      qc.invalidateQueries({ queryKey: ["dga-productos-count"] });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><PackageSearch className="h-6 w-6" /> Catálogo de Productos DGA</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de productos ya declarados en SIGA. Se alimenta <b>únicamente</b> con los archivos .xlsx que subas desde el reporte de la DGA — no hay datos precargados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cargar reporte .xlsx de la DGA</CardTitle>
          <CardDescription>
            Sube el archivo tal cual lo descargas de SIGA/DGA. Se hace <b>upsert por Código de Producto</b>: si ya existe se actualiza, si es nuevo se agrega.
            Columnas esperadas: Código de Producto, Partida Arancelaria, Nombre de Producto, Cod. Marca, Marca, Cod. Modelo, Modelo, Unidad, País, Especificaciones, Régimen, Estado. Los encabezados se reconocen sin importar tildes, mayúsculas o espacios.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={subiendo}>
            {subiendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {subiendo ? "Procesando…" : "Seleccionar archivo .xlsx"}
          </Button>
          <Badge variant="secondary">{total ?? 0} producto(s) en el histórico</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Productos cargados</CardTitle>
            <CardDescription>Mostrando hasta 100 resultados.</CardDescription>
          </div>
          <div className="relative w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, partida, marca…" className="pl-9 h-9" />
            {isFetching && <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-muted/50 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Código Producto</th>
                <th className="px-2 py-2 text-left">Partida</th>
                <th className="px-2 py-2 text-left">Nombre</th>
                <th className="px-2 py-2 text-left">Marca</th>
                <th className="px-2 py-2 text-left">Modelo</th>
                <th className="px-2 py-2 text-left">Unidad</th>
                <th className="px-2 py-2 text-left">País</th>
                <th className="px-2 py-2 text-left">Régimen</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-right bg-amber-50">Grav. %</th>
                <th className="px-2 py-2 text-right bg-amber-50">ISC %</th>
                <th className="px-2 py-2 text-right bg-amber-50">ITBIS %</th>
                <th className="px-2 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {q ? "Sin resultados." : "Aún no has cargado productos. Sube tu primer archivo .xlsx."}
                </td></tr>
              ) : rows.map((r: any) => (
                <tr key={r.codigo_producto} className="border-t">
                  <td className="px-2 py-2 font-mono text-xs">{r.codigo_producto}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.partida_arancelaria || "—"}</td>
                  <td className="px-2 py-2 max-w-[280px] truncate" title={r.nombre_producto || ""}>{r.nombre_producto || "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.marca || "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.modelo || "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.unidad || "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.pais || "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.regimen || "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.estado || "—"}</td>
                  <td className="px-2 py-2 text-xs text-right tabular-nums bg-amber-50/40">{r.pct_gravamen != null ? `${Number(r.pct_gravamen)}%` : "—"}</td>
                  <td className="px-2 py-2 text-xs text-right tabular-nums bg-amber-50/40">{r.aplica_isc && r.pct_isc != null ? `${Number(r.pct_isc)}%` : "—"}</td>
                  <td className="px-2 py-2 text-xs text-right tabular-nums bg-amber-50/40">{r.pct_itbis != null ? `${Number(r.pct_itbis)}%` : "—"}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditar({
                      ...r,
                      pct_gravamen: r.pct_gravamen != null ? String(r.pct_gravamen) : "",
                      pct_isc: r.pct_isc != null ? String(r.pct_isc) : "",
                      pct_itbis: r.pct_itbis != null ? String(r.pct_itbis) : "18",
                      aplica_isc: !!r.aplica_isc,
                    })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setBorrar(r.codigo_producto)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!editar} onOpenChange={(v) => !v && setEditar(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar producto del catálogo DGA</DialogTitle>
            <DialogDescription className="font-mono text-xs">{editar?.codigo_producto}</DialogDescription>
          </DialogHeader>
          {editar && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Nombre del producto</Label>
                <Input value={editar.nombre_producto ?? ""} onChange={(e) => setEditar({ ...editar, nombre_producto: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Partida arancelaria</Label>
                <Input value={editar.partida_arancelaria ?? ""} onChange={(e) => setEditar({ ...editar, partida_arancelaria: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Unidad</Label>
                <Input value={editar.unidad ?? ""} onChange={(e) => setEditar({ ...editar, unidad: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>País</Label>
                <Input value={editar.pais ?? ""} onChange={(e) => setEditar({ ...editar, pais: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Marca</Label>
                <Input value={editar.marca ?? ""} onChange={(e) => setEditar({ ...editar, marca: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Modelo</Label>
                <Input value={editar.modelo ?? ""} onChange={(e) => setEditar({ ...editar, modelo: e.target.value })} />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Especificaciones</Label>
                <Textarea rows={2} value={editar.especificaciones ?? ""} onChange={(e) => setEditar({ ...editar, especificaciones: e.target.value })} />
              </div>

              <div className="md:col-span-2 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tasas fijas de este producto</div>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Si defines estas tasas, tendrán <b>prioridad</b> sobre el auto-aprendizaje por código arancelario y quedarán bloqueadas al elegir el producto en un expediente.
                </p>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="grid gap-1.5">
                    <Label>Gravamen (%)</Label>
                    <Input type="text" inputMode="decimal" placeholder="0" value={editar.pct_gravamen}
                      onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setEditar({ ...editar, pct_gravamen: v }); }} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>¿Aplica ISC?</Label>
                    <div className="h-9 flex items-center gap-2">
                      <Switch checked={!!editar.aplica_isc} onCheckedChange={(v) => setEditar({ ...editar, aplica_isc: v, pct_isc: v ? editar.pct_isc : "" })} />
                      <span className="text-sm text-muted-foreground">{editar.aplica_isc ? "Sí" : "No"}</span>
                    </div>
                  </div>
                  {editar.aplica_isc && (
                    <div className="grid gap-1.5">
                      <Label>ISC (%)</Label>
                      <Input type="text" inputMode="decimal" placeholder="0" value={editar.pct_isc}
                        onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setEditar({ ...editar, pct_isc: v }); }} />
                    </div>
                  )}
                  <div className="grid gap-1.5">
                    <Label>ITBIS (%)</Label>
                    <Input type="text" inputMode="decimal" placeholder="18" value={editar.pct_itbis}
                      onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setEditar({ ...editar, pct_itbis: v }); }} />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditar(null)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate(editar)} disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrar} onOpenChange={(v) => !v && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto del histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <b>{borrar}</b> del catálogo de referencia. No afecta expedientes ya declarados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (borrar) eliminar.mutate(borrar); setBorrar(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
