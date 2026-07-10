import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type TipoFilter = "importacion" | "exportacion" | "todos";

export const Route = createFileRoute("/_authenticated/expedientes/")({
  validateSearch: (s: Record<string, unknown>): { tipo?: TipoFilter } => {
    const t = s.tipo;
    return t === "importacion" || t === "exportacion" || t === "todos" ? { tipo: t } : {};
  },
  component: Expedientes,
});

function Expedientes() {
  const { tipo = "todos" } = Route.useSearch();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["expedientes"],
    queryFn: async () => (await supabase
      .from("expedientes")
      .select("*, clientes(nombre), solicitudes(tipo_operacion)")
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const trashMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("expedientes")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expediente movido a la papelera");
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["expedientes-papelera"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover a papelera"),
  });

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const diasRestantes = (e: any) => {
    if (e.estado === "despachado" || !e.fecha_compromiso) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eta = new Date(e.fecha_compromiso);
    eta.setHours(0, 0, 0, 0);
    const diff = Math.round((eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return { text: "Hoy", tone: "warning" as const };
    if (diff > 5) return { text: `${diff} días`, tone: "success" as const };
    if (diff > 0) return { text: `${diff} días`, tone: "warning" as const };
    return { text: `${Math.abs(diff)} días atraso`, tone: "danger" as const, icon: true };
  };

  const detectTipo = (e: any): "importacion" | "exportacion" | "otros" => {
    const t = norm(e.solicitudes?.tipo_operacion ?? "");
    if (t.includes("import")) return "importacion";
    if (t.includes("export")) return "exportacion";
    return "otros";
  };

  const filtered = (data ?? []).filter((e: any) => {
    if (estado !== "todos" && e.estado !== estado) return false;
    if (tipo !== "todos" && detectTipo(e) !== tipo) return false;
    if (q && !norm(JSON.stringify(e)).includes(norm(q))) return false;
    return true;
  });

  const tipoLabel = tipo === "importacion" ? "Importaciones" : tipo === "exportacion" ? "Exportaciones" : "Todos los expedientes";

  type SortKey = "numero" | "cliente" | "numero_dua" | "bl_awb" | "fecha_compromiso" | "puerto_arribo" | "numero_vuce" | "estado";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const activeSort = sort ?? { key: "fecha_compromiso" as SortKey, dir: "asc" as const };
  const getVal = (e: any, k: SortKey) => k === "cliente" ? (e.clientes?.nombre ?? "") : (e[k] ?? "");
  const cmp = (a: any, b: any) => {
    // Regla fija: despachado siempre al final
    const aD = a.estado === "despachado" ? 1 : 0;
    const bD = b.estado === "despachado" ? 1 : 0;
    if (aD !== bD) return aD - bD;
    const av = getVal(a, activeSort.key);
    const bv = getVal(b, activeSort.key);
    const aEmpty = av === "" || av == null;
    const bEmpty = bv === "" || bv == null;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    let r = 0;
    if (activeSort.key === "fecha_compromiso") r = new Date(av).getTime() - new Date(bv).getTime();
    else r = String(av).localeCompare(String(bv), "es", { numeric: true });
    return activeSort.dir === "asc" ? r : -r;
  };

  const grupos: Record<string, any[]> = { importacion: [], exportacion: [], otros: [] };
  filtered.forEach((e: any) => grupos[detectTipo(e)].push(e));
  (Object.keys(grupos) as Array<keyof typeof grupos>).forEach((k) => grupos[k].sort(cmp));

  const isActive = (k: SortKey) => !!sort && sort.key === k;
  const isDefault = (k: SortKey) => !sort && k === "fecha_compromiso";
  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const active = isActive(k);
    const def = isDefault(k);
    const icon = active ? (sort!.dir === "asc" ? "▲" : "▼") : def ? "▲" : "↕";
    return (
      <th className={`text-left ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          title={active ? `Ordenado ${sort!.dir === "asc" ? "ascendente" : "descendente"} · clic para ${sort!.dir === "asc" ? "descendente" : "quitar orden"}` : def ? "Orden por defecto: ETA ascendente · clic para cambiar" : "Clic para ordenar"}
          className={`inline-flex items-center gap-1 uppercase transition-colors ${active ? "text-primary font-semibold" : def ? "text-foreground/70" : "hover:text-foreground"}`}
        >
          {children}
          <span className={`text-[10px] ${active ? "opacity-100" : def ? "opacity-70" : "opacity-30"}`}>{icon}</span>
        </button>
      </th>
    );
  };


  const gruposVisibles = (
    tipo === "importacion" ? ["importacion"] :
    tipo === "exportacion" ? ["exportacion"] :
    ["importacion", "exportacion", "otros"]
  ) as Array<keyof typeof grupos>;

  const grupoLabel: Record<string, string> = {
    importacion: "Importaciones",
    exportacion: "Exportaciones",
    otros: "Otros",
  };

  const countAll = (data ?? []).length;
  const countImp = (data ?? []).filter((e: any) => detectTipo(e) === "importacion").length;
  const countExp = (data ?? []).filter((e: any) => detectTipo(e) === "exportacion").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-2xl font-bold">Expedientes · {tipoLabel}</h1>
          <p className="text-sm text-muted-foreground">Expedientes aduanales agrupados por tipo de solicitud.</p>
        </div>
        <div className="flex gap-1 rounded-md border p-1 bg-card">
          <Link to="/expedientes" search={{ tipo: "todos" }} className={`px-3 py-1 text-xs rounded inline-flex items-center gap-1.5 ${tipo === "todos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Todos <Badge variant="secondary" className="text-[10px] h-4 px-1">{countAll}</Badge></Link>
          <Link to="/expedientes" search={{ tipo: "importacion" }} className={`px-3 py-1 text-xs rounded inline-flex items-center gap-1.5 ${tipo === "importacion" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Importación <Badge variant="secondary" className="text-[10px] h-4 px-1">{countImp}</Badge></Link>
          <Link to="/expedientes" search={{ tipo: "exportacion" }} className={`px-3 py-1 text-xs rounded inline-flex items-center gap-1.5 ${tipo === "exportacion" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Exportación <Badge variant="secondary" className="text-[10px] h-4 px-1">{countExp}</Badge></Link>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3 flex-wrap">
          <CardTitle className="text-base flex-1 min-w-[160px]">{filtered.length} expedientes</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {["digitar","presentar","verificar","facturar","despachado"].map((e) => <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar por BL/AWB, expediente o cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin expedientes. Crea uno desde una solicitud aprobada.</div>
          )}
          {gruposVisibles.map((g) => {
            const rows = grupos[g];
            if (rows.length === 0) return null;
            return (
              <div key={g} className="border-b last:border-0">
                <div className="px-4 py-2 bg-muted/50 flex items-center gap-2 sticky top-0">
                  <span className="text-xs font-semibold uppercase tracking-wide">{grupoLabel[g]}</span>
                  <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b bg-muted/20">
                    <tr>
                      <Th k="numero" className="px-4 py-2">Expediente</Th>
                      <Th k="cliente">Cliente</Th>
                      <Th k="numero_dua">DUA</Th>
                      <Th k="bl_awb">BL / AWB</Th>
                      <Th k="fecha_compromiso">ETA</Th>
                      <th className="text-left px-4 py-2 text-xs uppercase text-muted-foreground">Días Restantes</th>
                      <Th k="puerto_arribo">Puerto Arribo</Th>
                      <Th k="numero_vuce">Solicitud de Permiso</Th>
                      <Th k="estado">Estado</Th>
                      <th className="text-right px-4 py-2 text-xs uppercase text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e: any) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2 font-medium">
                          <Link to="/expedientes/$id" params={{ id: e.id }} className="text-primary hover:underline">{e.numero}</Link>
                        </td>
                        <td>{e.clientes?.nombre ?? "—"}</td>
                        <td className="text-xs">{e.numero_dua ?? "—"}</td>
                        <td className="text-muted-foreground">{e.bl_awb ?? "—"}</td>
                        <td>{e.fecha_compromiso ? new Date(e.fecha_compromiso).toLocaleDateString("es-DO") : "—"}</td>
                        <td>
                          {(() => {
                            const d = diasRestantes(e);
                            if (!d) return <span className="text-muted-foreground">—</span>;
                            const toneClass = d.tone === "success"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : d.tone === "warning"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-destructive";
                            return (
                              <span className={`inline-flex items-center gap-1 font-medium ${toneClass}`}>
                                {d.icon && <AlertTriangle className="h-3 w-3" />}
                                {d.text}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="text-xs">{e.puerto_arribo ?? "—"}</td>
                        <td className="text-xs">{e.numero_vuce ?? "—"}</td>
                        <td><Badge className="bg-primary/10 text-primary border-transparent">{e.estado?.replace("_"," ")}</Badge></td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setToTrash({ id: e.id, numero: e.numero })}
                            title="Mover a papelera"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={!!toTrash} onOpenChange={(o) => !o && setToTrash(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a la papelera</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas mover el expediente <strong>{toTrash?.numero}</strong> a la papelera?
              Podrás restaurarlo más adelante desde la sección Papelera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trashMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={trashMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toTrash) trashMut.mutate(toTrash.id); }}
            >
              {trashMut.isPending ? "Moviendo…" : "Mover a papelera"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


