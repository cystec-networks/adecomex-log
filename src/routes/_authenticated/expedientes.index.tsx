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
import { Trash2 } from "lucide-react";
import { WhatsAppButton } from "@/components/whatsapp-button";
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
      .select("*, clientes(nombre,telefono), solicitudes(tipo_operacion)")
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
    if (diff > 5) return { text: `${diff}`, full: `${diff} días`, tone: "success" as const };
    if (diff >= 0) return { text: `${diff}`, full: diff === 0 ? "Hoy" : `${diff} días`, tone: "warning" as const };
    return { text: `${diff}`, full: `${Math.abs(diff)} días de atraso`, tone: "danger" as const };
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
  const Th = ({ k, children, align = "left", className = "" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" | "center"; className?: string }) => {
    const active = isActive(k);
    const def = isDefault(k);
    const icon = active ? (sort!.dir === "asc" ? "▲" : "▼") : def ? "▲" : "↕";
    const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
    return (
      <th className={`px-4 py-2.5 ${alignClass} ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          title={active ? `Ordenado ${sort!.dir === "asc" ? "ascendente" : "descendente"} · clic para ${sort!.dir === "asc" ? "descendente" : "quitar orden"}` : def ? "Orden por defecto: ETA ascendente · clic para cambiar" : "Clic para ordenar"}
          className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${active ? "text-primary" : def ? "text-foreground/80" : "text-muted-foreground hover:text-foreground"}`}
        >
          {children}
          <span className={`text-[10px] ${active ? "opacity-100" : def ? "opacity-70" : "opacity-40"}`}>{icon}</span>
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

  const estadoBadge = (estadoRaw: string | null) => {
    const s = (estadoRaw ?? "").replace("_", " ");
    const variants: Record<string, string> = {
      digitar: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      presentar: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
      verificar: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
      facturar: "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
      despachado: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${variants[estadoRaw ?? ""] ?? variants.digitar}`}>
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </span>
    );
  };

  const TruncatedCell = ({ value, className = "", maxClass = "max-w-[160px]" }: { value: string | null; className?: string; maxClass?: string }) => (
    <span title={value ?? undefined} className={`block truncate ${maxClass} ${className}`}>
      {value ?? "—"}
    </span>
  );

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

      <Card className="overflow-hidden">
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
        <CardContent className="p-0">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin expedientes. Crea uno desde una solicitud aprobada.</div>
          )}
          <div className="overflow-x-auto">
            {gruposVisibles.map((g) => {
              const rows = grupos[g];
              if (rows.length === 0) return null;
              return (
                <div key={g}>
                  <div className="px-3 py-2 bg-muted/60 border-y flex items-center gap-2 sticky top-0 z-10">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">{grupoLabel[g]}</span>
                    <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
                  </div>
                  <table className="w-full text-[13px] border-collapse">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                        <Th k="numero" className="px-2 whitespace-nowrap">Expediente</Th>
                        <Th k="cliente" className="px-2 whitespace-nowrap">Cliente</Th>
                        <Th k="numero_dua" align="right" className="px-2 whitespace-nowrap">DUA</Th>
                        <Th k="bl_awb" className="px-2 whitespace-nowrap">BL / AWB</Th>
                        <Th k="fecha_compromiso" align="right" className="px-2 whitespace-nowrap">ETA</Th>
                        <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-12 min-w-12">Días</th>
                        <Th k="puerto_arribo" className="px-2 whitespace-nowrap">Puerto</Th>
                        <Th k="numero_vuce" align="right" className="px-2 whitespace-nowrap">Permiso</Th>
                        <Th k="estado" align="center" className="px-2 whitespace-nowrap">Estado</Th>
                        <th className="px-1 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"></th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {rows.map((e: any) => (
                        <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-2 py-2 align-middle whitespace-nowrap">
                            <Link
                              to="/expedientes/$id"
                              params={{ id: e.id }}
                              className="font-semibold text-primary hover:underline underline-offset-2 decoration-primary/40"
                              title={`Abrir expediente ${e.numero}`}
                            >
                              {e.numero}
                            </Link>
                          </td>
                          <td className="px-2 py-2 align-middle whitespace-nowrap text-foreground/90">
                            {e.clientes?.nombre ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                            {e.numero_dua ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-muted-foreground whitespace-nowrap">
                            {e.bl_awb ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-right tabular-nums text-muted-foreground whitespace-nowrap">
                            {e.fecha_compromiso ? new Date(e.fecha_compromiso).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-center whitespace-nowrap w-12 min-w-12">
                            {(() => {
                              const d = diasRestantes(e);
                              if (!d) return <span className="text-muted-foreground">—</span>;
                              const toneClass = d.tone === "success"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : d.tone === "warning"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-destructive";
                              return (
                                <span title={d.full} className={`text-xs font-medium tabular-nums ${toneClass}`}>
                                  {d.text}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-2 align-middle text-muted-foreground text-xs whitespace-nowrap">
                            {e.puerto_arribo ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-right text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                            {e.numero_vuce ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-center whitespace-nowrap">
                            {estadoBadge(e.estado)}
                          </td>
                          <td className="px-1 py-2 align-middle text-right whitespace-nowrap">
                            <WhatsAppButton
                              phone={e.clientes?.telefono}
                              clientName={e.clientes?.nombre}
                              recordType="Expediente"
                              recordNumber={e.numero}
                              variant="icon"
                              className="h-8 w-8"
                            />
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
          </div>
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
