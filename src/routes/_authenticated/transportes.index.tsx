import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TruncatedCell } from "@/components/truncated-cell";
import { Trash2, Plus, Truck, Pencil } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { TRANSPORTE_ESTADOS, TRANSPORTE_TIPOS, estadoBadgeTransporte } from "@/components/transporte-form";
import { parseLocalDate, fmtLocalDateShort } from "@/lib/dates";
import { useGruposColapsados, EstadoDivider } from "@/lib/grupos-colapsados";


export const Route = createFileRoute("/_authenticated/transportes/")({
  component: Transportes,
});

function Transportes() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["transportes"],
    queryFn: async () => (await supabase
      .from("transportes")
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
      const { error } = await supabase.from("transportes")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transporte movido a la papelera");
      qc.invalidateQueries({ queryKey: ["transportes"] });
      qc.invalidateQueries({ queryKey: ["papelera-transportes"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover"),
  });

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = (data ?? []).filter((t: any) => {
    if (estado !== "todos" && t.estado !== estado) return false;
    if (cliente !== "todos" && t.cliente_id !== cliente) return false;
    if (q && !norm(JSON.stringify(t)).includes(norm(q))) return false;
    return true;
  });

  type SortKey = "numero_viaje" | "cliente" | "expediente" | "tipo" | "transportista" | "origen" | "destino" | "fecha_salida" | "eta" | "estado";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => setSort((s) => (!s || s.key !== key) ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null);
  const activeSort = sort ?? { key: "eta" as SortKey, dir: "asc" as const };
  const getVal = (t: any, k: SortKey) =>
    k === "cliente" ? (t.clientes?.nombre ?? "") :
    k === "expediente" ? (t.expedientes?.numero ?? "") :
    (t[k] ?? "");
  const cmp = (a: any, b: any) => {
    const av = getVal(a, activeSort.key); const bv = getVal(b, activeSort.key);
    const aE = av === "" || av == null; const bE = bv === "" || bv == null;
    if (aE && bE) return 0; if (aE) return 1; if (bE) return -1;
    let r = 0;
    if (activeSort.key === "eta" || activeSort.key === "fecha_salida") r = parseLocalDate(av).getTime() - parseLocalDate(bv).getTime();
    else r = String(av).localeCompare(String(bv), "es", { numeric: true });
    return activeSort.dir === "asc" ? r : -r;
  };
  const rows = [...filtered].sort(cmp);

  const TRANSPORTES_CERRADOS = ["entregado", "facturado"];
  const { esColapsado, toggleGrupo } = useGruposColapsados("transportes-grupos-colapsados", TRANSPORTES_CERRADOS);
  const ordenGrupos = TRANSPORTE_ESTADOS.map((s) => s.v);
  const grupos: [string, any[]][] = (() => {
    const map = new Map<string, any[]>();
    for (const t of rows) {
      const k = t.estado ?? "sin_estado";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort(
      (a, b) => (ordenGrupos.indexOf(a[0]) + 1 || 999) - (ordenGrupos.indexOf(b[0]) + 1 || 999),
    );
  })();


  const isActive = (k: SortKey) => !!sort && sort.key === k;
  const isDefault = (k: SortKey) => !sort && k === "eta";
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
  const fmtFlete = (t: any) => t.flete_monto != null ? `${t.flete_moneda ?? "USD"} ${Number(t.flete_monto).toLocaleString("es-DO", { minimumFractionDigits: 2 })}` : "—";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Transportes</h1>
          <p className="text-sm text-muted-foreground">Viajes y logística vinculados a expedientes.</p>
        </div>
        <Button asChild><Link to="/transportes/nuevo"><Plus className="h-4 w-4 mr-1" /> Nuevo transporte</Link></Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center gap-3 flex-wrap">
          <CardTitle className="text-base flex-1 min-w-[160px]">{rows.length} transportes</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {TRANSPORTE_ESTADOS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
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
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin transportes.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <Th k="numero_viaje" className="whitespace-nowrap">N° Viaje</Th>
                    <Th k="expediente" className="whitespace-nowrap">Expediente</Th>
                    <Th k="cliente" className="whitespace-nowrap">Cliente</Th>
                    <Th k="tipo" className="whitespace-nowrap">Tipo</Th>
                    <Th k="transportista" className="whitespace-nowrap">Transportista</Th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Placa / Ctn</th>
                    <Th k="origen" className="whitespace-nowrap">Origen</Th>
                    <Th k="destino" className="whitespace-nowrap">Destino</Th>
                    <Th k="fecha_salida" align="right" className="whitespace-nowrap">Salida</Th>
                    <Th k="eta" align="right" className="whitespace-nowrap">ETA</Th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Flete</th>
                    <Th k="estado" align="center" className="whitespace-nowrap">Estado</Th>
                    <th className="px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((t: any) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link to="/transportes/$id" params={{ id: t.id }} className="font-semibold text-primary hover:underline">{t.numero_viaje}</Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {t.expedientes?.numero ? (
                          <Link to="/expedientes/$id" params={{ id: t.expediente_id }} className="text-primary hover:underline">{t.expedientes.numero} ↗</Link>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{t.clientes?.nombre ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{TRANSPORTE_TIPOS.find((x) => x.v === t.tipo)?.l ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{t.transportista ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs tabular-nums"><TruncatedCell value={t.placa_contenedor} maxClass="max-w-[140px]" /></td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.origen ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.destino ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmt(t.fecha_salida)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(t.eta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtFlete(t)}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">{estadoBadgeTransporte(t.estado)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Editar">
                          <Link to="/transportes/$id" params={{ id: t.id }}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setToTrash({ id: t.id, numero: t.numero_viaje })} title="Mover a papelera">
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
            <AlertDialogDescription>El transporte <strong>{toTrash?.numero}</strong> se moverá a la papelera.</AlertDialogDescription>
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
