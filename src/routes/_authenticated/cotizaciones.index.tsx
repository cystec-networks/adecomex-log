import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseLocalDate, fmtLocalDate } from "@/lib/dates";
import { BadgeVigencia } from "@/components/badge-vigencia";
import { useMyRoles } from "@/lib/auth-hooks";
import {
  COTIZACION_ESTADOS, COTIZACION_ESTADO_CLASS, cotizacionEstadoLabel,
} from "@/lib/estados-cotizacion";
import { useGruposColapsados, EstadoDivider } from "@/lib/grupos-colapsados";


export const Route = createFileRoute("/_authenticated/cotizaciones/")({
  component: Cotizaciones,
});

function Cotizaciones() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "vendedor");

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("todas");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);

  // Expiración automática al abrir el listado
  useEffect(() => {
    (supabase as any).rpc("expirar_cotizaciones_vencidas").then(({ data }: any) => {
      if (data && data > 0) qc.invalidateQueries({ queryKey: ["cotizaciones"] });
    });
  }, [qc]);

  const { data } = useQuery({
    queryKey: ["cotizaciones"],
    queryFn: async () => (await supabase
      .from("cotizaciones")
      .select("*, clientes(nombre)")
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: perfiles } = useQuery({
    queryKey: ["profiles-lite"],
    queryFn: async () => (await supabase.from("profiles").select("id,nombre")).data ?? [],
  });
  const nombreVendedor = (uid: string | null) =>
    (perfiles ?? []).find((p: any) => p.id === uid)?.nombre ?? "—";

  const trashMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cotizaciones")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cotización movida a la papelera");
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      qc.invalidateQueries({ queryKey: ["papelera-cotizaciones"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover a papelera"),
  });

  const filtered = (data ?? []).filter((c: any) => {
    if (estado !== "todas" && c.estado !== estado) return false;
    if (q && !JSON.stringify(c).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  type SortKey = "numero" | "cliente" | "vendedor" | "tipo_mercancia" | "origen" | "destino"
    | "tarifa_propuesta" | "fecha_emision" | "fecha_vigencia" | "estado";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const activeSort = sort ?? { key: "fecha_vigencia" as SortKey, dir: "asc" as const };
  const getVal = (c: any, k: SortKey) =>
    k === "cliente" ? (c.clientes?.nombre ?? "")
      : k === "vendedor" ? nombreVendedor(c.vendedor_id)
        : (c[k] ?? "");

  const sorted = [...filtered].sort((a, b) => {
    // Las aprobadas (ya convertidas) siempre al final
    const aA = a.estado === "aprobada" ? 1 : 0;
    const bA = b.estado === "aprobada" ? 1 : 0;
    if (aA !== bA) return aA - bA;
    const av = getVal(a, activeSort.key);
    const bv = getVal(b, activeSort.key);
    const aEmpty = av === "" || av == null;
    const bEmpty = bv === "" || bv == null;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    let r = 0;
    if (activeSort.key === "fecha_vigencia" || activeSort.key === "fecha_emision") {
      r = parseLocalDate(av).getTime() - parseLocalDate(bv).getTime();
    } else if (activeSort.key === "tarifa_propuesta") {
      r = Number(av) - Number(bv);
    } else {
      r = String(av).localeCompare(String(bv), "es", { numeric: true });
    }
    return activeSort.dir === "asc" ? r : -r;
  });

  const isActive = (k: SortKey) => !!sort && sort.key === k;
  const isDefault = (k: SortKey) => !sort && k === "fecha_vigencia";
  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const active = isActive(k);
    const def = isDefault(k);
    const icon = active ? (sort!.dir === "asc" ? "▲" : "▼") : def ? "▲" : "↕";
    return (
      <th className={`text-left ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 uppercase transition-colors ${active ? "text-primary font-semibold" : def ? "text-foreground/70" : "hover:text-foreground"}`}
        >
          {children}
          <span className={`text-[10px] ${active ? "opacity-100" : def ? "opacity-70" : "opacity-30"}`}>{icon}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Primera etapa del flujo comercial, previa a Solicitudes.</p>
        </div>
        {canEdit && (
          <Button asChild><Link to="/cotizaciones/nueva"><Plus className="h-4 w-4 mr-1" />Nueva cotización</Link></Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle className="text-base flex-1">{filtered.length} cotizaciones</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los estados</SelectItem>
              {COTIZACION_ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>{cotizacionEstadoLabel(e)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th k="numero" className="px-4 py-2">Número</Th>
                <Th k="cliente">Cliente</Th>
                <Th k="vendedor">Vendedor</Th>
                <Th k="tipo_mercancia">Mercancía</Th>
                <Th k="origen">Origen</Th>
                <Th k="destino">Destino</Th>
                <Th k="tarifa_propuesta">Tarifa</Th>
                <Th k="fecha_emision">Emisión</Th>
                <Th k="fecha_vigencia">Vigencia</Th>
                <Th k="estado">Estado</Th>
                <th className="text-right px-4 py-2 text-xs uppercase text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(([est, rows]) => (
                <Fragment key={est}>
                  <EstadoDivider
                    colSpan={11}
                    count={rows.length}
                    colapsado={esColapsado(est)}
                    onToggle={() => toggleGrupo(est)}
                    label={
                      <Badge className={COTIZACION_ESTADO_CLASS[est] ?? "bg-muted text-muted-foreground border-transparent"}>
                        {cotizacionEstadoLabel(est)}
                      </Badge>
                    }
                  />
                  {!esColapsado(est) && rows.map((c: any) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2 font-medium">
                        <Link to="/cotizaciones/$id" params={{ id: c.id }} className="hover:underline text-primary">{c.numero}</Link>
                      </td>
                      <td>{c.clientes?.nombre ?? "—"}</td>
                      <td className="text-muted-foreground">{nombreVendedor(c.vendedor_id)}</td>
                      <td className="text-muted-foreground">{c.tipo_mercancia ?? "—"}</td>
                      <td>{c.origen ?? "—"}</td>
                      <td>{c.destino ?? "—"}</td>
                      <td className="tabular-nums">
                        {c.tarifa_propuesta != null
                          ? `${c.moneda ?? "USD"} ${Number(c.tarifa_propuesta).toLocaleString("es-DO", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="text-xs">{fmtLocalDate(c.fecha_emision)}</td>
                      <td><BadgeVigencia fecha={c.fecha_vigencia} /></td>
                      <td>
                        <Badge className={COTIZACION_ESTADO_CLASS[c.estado] ?? "bg-muted text-muted-foreground border-transparent"}>
                          {cotizacionEstadoLabel(c.estado)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToTrash({ id: c.id, numero: c.numero })}
                            title="Mover a la papelera"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {filtered.length === 0 && (

                <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Sin cotizaciones.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toTrash} onOpenChange={(o) => !o && setToTrash(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a la papelera</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas mover la cotización <strong>{toTrash?.numero}</strong> a la papelera?
              Podrás restaurarla desde <em>Papelera</em>.
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
