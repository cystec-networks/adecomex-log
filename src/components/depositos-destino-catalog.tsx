import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { headerKey } from "@/lib/dga-productos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

type Deposito = { codigo: string; nombre: string; area_codigo: string | null; centro_logistico: string | null };

const ALIASES: Record<keyof Deposito, string[]> = {
  codigo: ["Código de Destino", "Codigo Destino", "Código", "Codigo"],
  nombre: ["Nombre de Destino", "Nombre Destino", "Nombre", "Destino"],
  area_codigo: ["Administración", "Administracion Asociada", "Código Administración", "Area", "Área", "AreaCode", "Código Área"],
  centro_logistico: ["Centro Logístico", "Centro Logistico"],
};
const KEYS = Object.fromEntries(Object.entries(ALIASES).map(([f, a]) => [f, a.map(headerKey)])) as Record<keyof Deposito, string[]>;

async function parseXlsx(file: File, areas: Array<{ codigo: string; area: string }>) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const porNombre = new Map(areas.map((a) => [headerKey(a.area), a.codigo]));
  const codigos = new Set(areas.map((a) => a.codigo));
  const out = new Map<string, Deposito>();
  for (const row of json) {
    const n: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) n[headerKey(k)] = v;
    const get = (f: keyof Deposito) => {
      for (const k of KEYS[f]) if (n[k] != null && String(n[k]).trim() !== "") return String(n[k]).trim();
      return null;
    };
    const codigo = get("codigo");
    const nombre = get("nombre");
    if (!codigo || !nombre) continue;
    let area = get("area_codigo");
    if (area && !codigos.has(area)) {
      const m = area.match(/\d{5}/);
      area = m && codigos.has(m[0]) ? m[0] : porNombre.get(headerKey(area)) ?? area;
    }
    out.set(codigo, { codigo, nombre, area_codigo: area, centro_logistico: get("centro_logistico") });
  }
  return Array.from(out.values());
}

export function DepositosDestinoCatalog({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [editar, setEditar] = useState<(Deposito & { nuevo?: boolean }) | null>(null);

  const { data: areas = [] } = useQuery({
    queryKey: ["dga_areas_all"],
    queryFn: async () => (await supabase.from("dga_areas").select("codigo, area").order("codigo")).data ?? [],
  });
  const areaNombre = useMemo(() => new Map(areas.map((a) => [a.codigo, a.area])), [areas]);

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["dga_depositos_destino_admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dga_depositos_destino").select("codigo, nombre, area_codigo, centro_logistico").order("codigo");
      if (error) throw error;
      return (data ?? []) as Deposito[];
    },
  });
  const filtrados = useMemo(() => {
    const t = headerKey(q);
    if (!t) return rows;
    return rows.filter((r) => headerKey(`${r.codigo} ${r.nombre} ${r.centro_logistico ?? ""} ${areaNombre.get(r.area_codigo ?? "") ?? ""}`).includes(t));
  }, [rows, q, areaNombre]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["dga_depositos_destino_admin"] });
    qc.invalidateQueries({ queryKey: ["dga_depositos_destino"] });
  };

  const guardar = useMutation({
    mutationFn: async (d: Deposito) => {
      const { error } = await supabase.from("dga_depositos_destino").upsert({
        codigo: d.codigo.trim(), nombre: d.nombre.trim(), area_codigo: d.area_codigo || null, centro_logistico: d.centro_logistico?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Depósito guardado"); setEditar(null); refrescar(); },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (codigo: string) => {
      const { error } = await supabase.from("dga_depositos_destino").delete().eq("codigo", codigo);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Depósito eliminado"); refrescar(); },
    onError: (e: any) => toast.error(e.message),
  });

  const onFile = async (file: File) => {
    setSubiendo(true);
    try {
      const filas = await parseXlsx(file, areas);
      if (!filas.length) { toast.error("No se encontraron filas con Código y Nombre de Destino."); return; }
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await supabase.from("dga_depositos_destino").upsert(filas.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw error;
      }
      const sinArea = filas.filter((f) => !f.area_codigo || !areaNombre.has(f.area_codigo)).length;
      toast.success(`${filas.length} depósito(s) cargados/actualizados.${sinArea ? ` ${sinArea} sin Administración reconocida.` : ""}`);
      refrescar();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cargar Depósitos de Destino (.xlsx)</CardTitle>
            <CardDescription>
              Upsert por Código de Destino. Columnas esperadas: Código de Destino, Nombre de Destino, Administración (código o nombre del área DGA), Centro Logístico. Los encabezados se reconocen sin importar tildes ni mayúsculas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            <Button onClick={() => fileRef.current?.click()} disabled={subiendo}>
              {subiendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {subiendo ? "Procesando…" : "Seleccionar archivo .xlsx"}
            </Button>
            <Button variant="outline" onClick={() => setEditar({ codigo: "", nombre: "", area_codigo: null, centro_logistico: null, nuevo: true })}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo depósito
            </Button>
            <Badge variant="secondary">{rows.length} depósito(s)</Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Depósitos de Destino</CardTitle>
          <div className="relative w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, nombre, administración…" className="pl-9 h-9" />
            {isFetching && <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky-table-header bg-muted/50 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Código</th>
                <th className="px-2 py-2 text-left">Nombre de Destino</th>
                <th className="px-2 py-2 text-left">Administración</th>
                <th className="px-2 py-2 text-left">Centro Logístico</th>
                {isAdmin && <th className="px-2 py-2 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {q ? "Sin resultados." : "Aún no hay depósitos. Carga un archivo .xlsx o agrega uno manualmente."}
                </td></tr>
              ) : filtrados.map((r) => (
                <tr key={r.codigo} className="border-t">
                  <td className="px-2 py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="px-2 py-2">{r.nombre}</td>
                  <td className="px-2 py-2 text-xs">
                    {r.area_codigo ? <><span className="font-mono">{r.area_codigo}</span> · {areaNombre.get(r.area_codigo) ?? "No reconocida"}</> : "—"}
                  </td>
                  <td className="px-2 py-2 text-xs">{r.centro_logistico || "—"}</td>
                  {isAdmin && (
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditar({ ...r })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => { if (window.confirm(`¿Eliminar el depósito ${r.codigo}?`)) eliminar.mutate(r.codigo); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!editar} onOpenChange={(v) => !v && setEditar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editar?.nuevo ? "Nuevo depósito de destino" : "Editar depósito de destino"}</DialogTitle></DialogHeader>
          {editar && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Código de Destino</Label>
                <Input value={editar.codigo} disabled={!editar.nuevo} onChange={(e) => setEditar({ ...editar, codigo: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Nombre de Destino</Label>
                <Input value={editar.nombre} onChange={(e) => setEditar({ ...editar, nombre: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Administración asociada</Label>
                <Select value={editar.area_codigo || undefined} onValueChange={(v) => setEditar({ ...editar, area_codigo: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona administración" /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => <SelectItem key={a.codigo} value={a.codigo}>{a.codigo} · {a.area}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Centro Logístico</Label>
                <Input value={editar.centro_logistico ?? ""} onChange={(e) => setEditar({ ...editar, centro_logistico: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditar(null)}>Cancelar</Button>
            <Button disabled={!editar?.codigo.trim() || !editar?.nombre.trim() || guardar.isPending} onClick={() => editar && guardar.mutate(editar)}>
              {guardar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
