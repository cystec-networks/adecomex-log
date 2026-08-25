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
import { Trash2, Plus, FileCheck2, Pencil } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { parseLocalDate, fmtLocalDateShort, daysFromToday } from "@/lib/dates";
import { PERMISO_ESTADOS, PERMISO_TIPOS } from "@/components/permiso-form";
import { estadoBadgePermiso } from "@/components/transporte-form";
import { useGruposColapsados, EstadoDivider } from "@/lib/grupos-colapsados";


export const Route = createFileRoute("/_authenticated/permisos/")({
  component: Permisos,
});

function Permisos() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["permisos"],
    queryFn: async () => (await supabase
      .from("permisos")
      .select("*, clientes(nombre), expedientes(numero)")
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const trashMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("permisos")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permiso movido a la papelera");
      qc.invalidateQueries({ queryKey: ["permisos"] });
      qc.invalidateQueries({ queryKey: ["papelera-permisos"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover"),
  });

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtered = (data ?? []).filter((p: any) => {
    if (estado !== "todos" && p.estado !== estado) return false;
    if (cliente !== "todos" && p.cliente_id !== cliente) return false;
    if (q && !norm(JSON.stringify(p)).includes(norm(q))) return false;
    return true;
  });

  type SortKey = "numero" | "cliente" | "expediente" | "tipo" | "institucion_emisora" | "estado" | "fecha_solicitud" | "fecha_emision" | "fecha_vencimiento";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => setSort((s) => (!s || s.key !== key) ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null);
  const activeSort = sort ?? { key: "fecha_vencimiento" as SortKey, dir: "asc" as const };
  const getVal = (p: any, k: SortKey) =>
    k === "cliente" ? (p.clientes?.nombre ?? "") :
    k === "expediente" ? (p.expedientes?.numero ?? "") :
    (p[k] ?? "");
  const cmp = (a: any, b: any) => {
    const closedA = ["aprobado","rechazado","vencido"].includes(a.estado) ? 1 : 0;
    const closedB = ["aprobado","rechazado","vencido"].includes(b.estado) ? 1 : 0;
    if (closedA !== closedB) return closedA - closedB;
    const av = getVal(a, activeSort.key);
    const bv = getVal(b, activeSort.key);
    const aE = av === "" || av == null; const bE = bv === "" || bv == null;
    if (aE && bE) return 0; if (aE) return 1; if (bE) return -1;
    let r = 0;
    if (activeSort.key.startsWith("fecha_")) r = parseLocalDate(av).getTime() - parseLocalDate(bv).getTime();
    else r = String(av).localeCompare(String(bv), "es", { numeric: true });
    return activeSort.dir === "asc" ? r : -r;
  };
  const rows = [...filtered].sort(cmp);

  const isActive = (k: SortKey) => !!sort && sort.key === k;
  const isDefault = (k: SortKey) => !sort && k === "fecha_vencimiento";
  const Th = ({ k, children, align = "left", className = "" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" | "center"; className?: string }) => {
    const active = isActive(k); const def = isDefault(k);
    const icon = active ? (sort!.dir === "asc" ? "▲" : "▼") : def ? "▲" : "↕";
    const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
    return (
      <th className={`px-3 py-2.5 ${alignClass} ${className}`}>
        <button type="button" onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${active ? "text-primary" : def ? "text-foreground/80" : "text-muted-foreground hover:text-foreground"}`}>
          {children}
          <span className={`text-[10px] ${active ? "opacity-100" : def ? "opacity-70" : "opacity-40"}`}>{icon}</span>
        </button>
      </th>
    );
  };

  const fmt = (d: string | null) => fmtLocalDateShort(d);
  const venceProximo = (d: string | null) => {
    if (!d) return false;
    const days = daysFromToday(d);
    return days >= 0 && days <= 15;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><FileCheck2 className="h-6 w-6" /> Permisos</h1>
          <p className="text-sm text-muted-foreground">Permisos gubernamentales vinculados a expedientes.</p>
        </div>
        <Button asChild><Link to="/permisos/nuevo"><Plus className="h-4 w-4 mr-1" /> Nuevo permiso</Link></Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center gap-3 flex-wrap">
          <CardTitle className="text-base flex-1 min-w-[160px]">{rows.length} permisos</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {PERMISO_ESTADOS.map((s: { v: string; l: string }) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los clientes</SelectItem>
              {(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin permisos.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <Th k="numero" className="whitespace-nowrap">N° Permiso</Th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">N° Resolución</th>
                    <Th k="expediente" className="whitespace-nowrap">Expediente</Th>
                    <Th k="cliente" className="whitespace-nowrap">Cliente</Th>
                    <Th k="tipo" className="whitespace-nowrap">Tipo</Th>
                    <Th k="institucion_emisora" className="whitespace-nowrap">Institución</Th>
                    <Th k="estado" align="center" className="whitespace-nowrap">Estado</Th>
                    <Th k="fecha_solicitud" align="right" className="whitespace-nowrap">Solic.</Th>
                    <Th k="fecha_emision" align="right" className="whitespace-nowrap">Emisión</Th>
                    <Th k="fecha_vencimiento" align="right" className="whitespace-nowrap">Vence</Th>
                    <th className="px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((p: any) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link to="/permisos/$id" params={{ id: p.id }} className="font-semibold text-primary hover:underline">{p.numero}</Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{p.numero_resolucion ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {p.expedientes?.numero ? (
                          <Link to="/expedientes/$id" params={{ id: p.expediente_id }} className="text-primary hover:underline">{p.expedientes.numero} ↗</Link>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{p.clientes?.nombre ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{PERMISO_TIPOS.find((t: { v: string; l: string }) => t.v === p.tipo)?.l ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{p.institucion_emisora ?? "—"}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">{estadoBadgePermiso(p.estado)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmt(p.fecha_solicitud)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmt(p.fecha_emision)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${venceProximo(p.fecha_vencimiento) ? "text-amber-600 font-medium dark:text-amber-400" : "text-muted-foreground"}`}>{fmt(p.fecha_vencimiento)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Editar">
                          <Link to="/permisos/$id" params={{ id: p.id }}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setToTrash({ id: p.id, numero: p.numero })} title="Mover a papelera">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toTrash} onOpenChange={(o) => !o && setToTrash(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a la papelera</AlertDialogTitle>
            <AlertDialogDescription>El permiso <strong>{toTrash?.numero}</strong> se moverá a la papelera.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trashMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={trashMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toTrash) trashMut.mutate(toTrash.id); }}>
              {trashMut.isPending ? "Moviendo…" : "Mover a papelera"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
