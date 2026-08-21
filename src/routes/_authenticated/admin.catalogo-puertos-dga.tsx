import { createFileRoute, redirect } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeBusqueda } from "@/lib/dga-productos";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, Search, Loader2, Trash2, Anchor } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/catalogo-puertos-dga")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).eq("role", "admin");
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: CatalogoPuertosDgaPage,
  head: () => ({
    meta: [
      { title: "Catálogo de Puertos DGA | ADECOMEX" },
      { name: "description", content: "Catálogo de puertos de la DGA, cargado manualmente desde el reporte .xlsx oficial." },
      { property: "og:title", content: "Catálogo de Puertos DGA | ADECOMEX" },
      { property: "og:description", content: "Administración del catálogo de puertos de la DGA para la captura de expedientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const COLUMN_ALIASES: Record<string, string[]> = {
  codigo: ["codigo", "Código", "Cod", "Código Puerto", "Codigo Puerto", "Code"],
  puerto: ["puerto", "Puerto", "Nombre Puerto", "Descripción", "Port"],
  codigo_pais: ["codPais", "Cod País", "Código País", "Codigo Pais", "Country Code"],
  pais: ["pais", "País", "Country"],
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

function CatalogoPuertosDgaPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<{ lote: number; total: number } | null>(null);
  const [borrar, setBorrar] = useState<string | null>(null);

  const { data: total } = useQuery({
    queryKey: ["dga-puertos-count"],
    queryFn: async () => {
      const { count } = await supabase.from("dga_puertos").select("codigo", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["dga-puertos-list", q],
    queryFn: async () => {
      let query = supabase.from("dga_puertos").select("*").order("codigo").limit(100);
      const term = sanitizeSearchTerm(q);
      if (term) query = query.or(`codigo.ilike.%${term}%,puerto.ilike.%${term}%,pais.ilike.%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const eliminar = useMutation({
    mutationFn: async (codigo: string) => {
      const { error } = await supabase.from("dga_puertos").delete().eq("codigo", codigo);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Puerto eliminado del catálogo");
      qc.invalidateQueries({ queryKey: ["dga-puertos-list"] });
      qc.invalidateQueries({ queryKey: ["dga-puertos-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onFile = async (file: File) => {
    setSubiendo(true);
    setProgreso(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const mapped = json.map(mapRow).filter((r) => r.codigo && r.puerto);
      if (mapped.length === 0) {
        toast.error("No se encontraron filas con 'codigo' y 'puerto' en el archivo.");
        return;
      }
      const byCode = new Map<string, any>();
      mapped.forEach((r) => byCode.set(r.codigo as string, r));
      const unique = Array.from(byCode.values());

      const lotes = Math.ceil(unique.length / 500);
      let ok = 0;
      for (let i = 0; i < unique.length; i += 500) {
        const chunk = unique.slice(i, i + 500);
        setProgreso({ lote: Math.floor(i / 500) + 1, total: lotes });
        const { error } = await supabase.from("dga_puertos").upsert(chunk as any, { onConflict: "codigo" });
        if (error) throw error;
        ok += chunk.length;
      }
      toast.success(`${ok} puerto(s) cargados/actualizados desde el archivo.`);
      qc.invalidateQueries({ queryKey: ["dga-puertos-list"] });
      qc.invalidateQueries({ queryKey: ["dga-puertos-count"] });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
    } finally {
      setSubiendo(false);
      setProgreso(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Anchor className="h-6 w-6" /> Catálogo de Puertos DGA</h1>
        <p className="text-sm text-muted-foreground">
          Puertos oficiales de la DGA. Se alimenta <b>únicamente</b> con los archivos .xlsx que subas — no hay datos precargados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cargar reporte .xlsx de puertos</CardTitle>
          <CardDescription>
            Sube el archivo tal cual lo descargas de la DGA. Se hace <b>upsert por código</b>: si ya existe se actualiza, si es nuevo se agrega.
            Columnas esperadas: codigo, puerto, codPais, pais. Los encabezados se reconocen sin importar tildes, mayúsculas o espacios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={subiendo}>
              {subiendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {subiendo ? "Procesando…" : "Subir archivo .xlsx"}
            </Button>
            <Badge variant="secondary">{total ?? 0} puerto(s) en el catálogo</Badge>
          </div>
          {progreso && (
            <div className="space-y-1 max-w-md">
              <Progress value={(progreso.lote / progreso.total) * 100} />
              <p className="text-xs text-muted-foreground">Procesando lote {progreso.lote} de {progreso.total}…</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Puertos cargados</CardTitle>
            <CardDescription>Mostrando hasta 100 resultados.</CardDescription>
          </div>
          <div className="relative w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, puerto o país…" className="pl-9 h-9" />
            {isFetching && <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/50 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Código</th>
                <th className="px-2 py-2 text-left">Puerto</th>
                <th className="px-2 py-2 text-left">Cód. País</th>
                <th className="px-2 py-2 text-left">País</th>
                <th className="px-2 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {q ? "Sin resultados." : "Aún no has cargado puertos. Sube tu primer archivo .xlsx."}
                </td></tr>
              ) : rows.map((r: any) => (
                <tr key={r.codigo} className="border-t">
                  <td className="px-2 py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="px-2 py-2 max-w-[320px] truncate" title={r.puerto || ""}>{r.puerto || "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.codigo_pais || "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.pais || "—"}</td>
                  <td className="px-2 py-2 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setBorrar(r.codigo)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={!!borrar} onOpenChange={(v) => !v && setBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar puerto del catálogo?</AlertDialogTitle>
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
