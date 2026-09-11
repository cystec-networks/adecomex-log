import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import { Plus, Ship } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/lib/auth-hooks";
import { ETAPAS_LOGISTICA, ESTADO_LOGISTICA_LABEL, estadoLogisticaClass } from "@/lib/logistica";
import { fmtLocalDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstadoDivider, useGruposColapsados } from "@/lib/grupos-colapsados";

export const Route = createFileRoute("/_authenticated/logistica/")({
  head: () => ({ meta: [
    { title: "Operaciones de Logística | ADECOMEX" },
    { name: "description", content: "Control de operaciones marítimas y aéreas desde origen hasta República Dominicana." },
    { property: "og:title", content: "Operaciones de Logística | ADECOMEX" },
    { property: "og:description", content: "Control de operaciones marítimas y aéreas desde origen hasta República Dominicana." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: LogisticaIndex,
});

function LogisticaIndex() {
  const [q, setQ] = useState("");
  const search = useSearch({ from: "/_authenticated/logistica/" });
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "logistica");
  const { esColapsado, toggleGrupo } = useGruposColapsados("logistica-grupos-colapsados");

  const { data: operaciones = [], isLoading } = useQuery({
    queryKey: ["operaciones-logistica"],
    queryFn: async () => {
      const { data, error } = await supabase.from("operaciones_logistica")
        .select("*, clientes(nombre)")
        .is("eliminado_en", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: responsables = [] } = useQuery({
    queryKey: ["encargados-logistica"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_encargados_logistica");
      if (error) throw error;
      return data ?? [];
    },
  });
  const responsablesMap = new Map(responsables.map((r) => [r.id, r.nombre]));
  const normalizar = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const activasOnly = (search as { estado?: string }).estado === "activas";
  const filtered = operaciones
    .filter((o: any) => !q || normalizar(`${o.numero} ${o.clientes?.nombre}`).includes(normalizar(q)))
    .filter((o: any) => !activasOnly || o.estado !== "arribo");
  const ordenEstados = [...ETAPAS_LOGISTICA.map((e) => e.codigo), "finalizadas"];
  const grupos = ordenEstados.map((estado) => [estado, filtered.filter((o: any) => estado === "finalizadas" ? ["completada", "cancelada"].includes(o.estado) : o.estado === estado)] as const)
    .filter(([, rows]) => rows.length > 0);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="font-display text-2xl font-bold">Logística</h1><p className="text-sm text-muted-foreground">Carga marítima y aérea desde origen hasta República Dominicana.</p></div>
        {canEdit && <Button asChild><Link to="/logistica/nueva"><Plus className="h-4 w-4 mr-1" />Nueva Operación</Link></Button>}
      </div>
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle className="text-base flex-1 flex items-center gap-2"><Ship className="h-4 w-4" />{filtered.length} operaciones</CardTitle>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número o cliente…" className="max-w-sm" />
        </CardHeader>
        <CardContent className="p-0 overflow-auto max-h-[72vh]">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30 uppercase"><tr>
              <th className="text-left px-4 py-2">Número</th><th className="text-left">Cliente</th><th className="text-left">Tipo</th>
              <th className="text-left">Proveedor logístico</th><th className="text-left">ETA</th><th className="text-left">Responsable</th><th className="text-left px-4">Estado</th>
            </tr></thead>
            <tbody>
              {grupos.map(([estado, rows]) => <Fragment key={estado}>
                <EstadoDivider colSpan={7} count={rows.length} colapsado={esColapsado(estado)} onToggle={() => toggleGrupo(estado)}
                  label={<Badge className={estadoLogisticaClass(estado === "finalizadas" ? "completada" : estado)}>{estado === "finalizadas" ? "Completadas / canceladas" : (ESTADO_LOGISTICA_LABEL[estado] ?? estado)}</Badge>} />
                {!esColapsado(estado) && rows.map((o: any) => <tr key={o.id} className="border-b hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium"><Link to="/logistica/$id" params={{ id: o.id }} className="text-primary hover:underline">{o.numero}</Link></td>
                  <td>{o.clientes?.nombre ?? "—"}</td><td className="capitalize">{o.tipo}</td><td>{o.proveedor_logistico ?? "—"}</td>
                  <td>{fmtLocalDate(o.eta)}</td><td>{responsablesMap.get(o.responsable_id) ?? "—"}</td>
                  <td className="px-4"><Badge className={estadoLogisticaClass(o.estado)}>{ESTADO_LOGISTICA_LABEL[o.estado] ?? o.estado}</Badge></td>
                </tr>)}
              </Fragment>)}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No hay operaciones de Logística.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}