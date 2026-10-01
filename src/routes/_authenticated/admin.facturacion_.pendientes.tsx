import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { FacturaEcfSelector } from "@/components/factura-ecf-selector";
import { fmtRD } from "@/lib/facturas-ecf";

export const Route = createFileRoute("/_authenticated/admin/facturacion_/pendientes")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: PendientesPage,
});

function PendientesPage() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const { data: expedientes } = useQuery({
    queryKey: ["ecf-pendientes-exp"],
    queryFn: async () => (await supabase
      .from("expedientes")
      .select("id, numero, cliente_id, factura_comercial, estado, created_at, fecha_aprobacion_despacho, clientes(nombre)")
      .is("eliminado_en", null)
      .is("factura_ecf_id", null)
      .not("factura_comercial", "is", null)
      .order("created_at", { ascending: false })
    ).data ?? [],
  });

  const { data: transportes } = useQuery({
    queryKey: ["ecf-pendientes-tr"],
    queryFn: async () => (await supabase
      .from("transportes")
      .select("id, numero_viaje, cliente_id, factura_numero, factura_fecha, ingreso_facturado, estado, clientes(nombre)")
      .is("eliminado_en", null)
      .is("factura_ecf_id", null)
      .not("factura_numero", "is", null)
      .order("factura_fecha", { ascending: false })
    ).data ?? [],
  });

  const linkExp = useMutation({
    mutationFn: async ({ id, fid }: { id: string; fid: string | null }) => {
      const { error } = await supabase.from("expedientes").update({ factura_ecf_id: fid }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expediente vinculado a e-CF");
      qc.invalidateQueries({ queryKey: ["ecf-pendientes-exp"] });
      qc.invalidateQueries({ queryKey: ["ecf-pendientes-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const linkTr = useMutation({
    mutationFn: async ({ id, fid }: { id: string; fid: string | null }) => {
      const { error } = await supabase.from("transportes").update({ factura_ecf_id: fid }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transporte vinculado a e-CF");
      qc.invalidateQueries({ queryKey: ["ecf-pendientes-tr"] });
      qc.invalidateQueries({ queryKey: ["ecf-pendientes-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const expsFiltered = useMemo(() => {
    const s = q.toLowerCase();
    return (expedientes ?? []).filter((e: any) =>
      !s ||
      e.numero?.toLowerCase().includes(s) ||
      e.factura_comercial?.toLowerCase().includes(s) ||
      e.clientes?.nombre?.toLowerCase().includes(s)
    ).sort((a: any, b: any) => {
      const fa = String(a.fecha_aprobacion_despacho ?? ""), fb = String(b.fecha_aprobacion_despacho ?? "");
      if (fa !== fb) return !fa ? 1 : !fb ? -1 : fa > fb ? -1 : 1;
      const ca = String(a.created_at ?? ""), cb = String(b.created_at ?? "");
      if (ca !== cb) return ca > cb ? -1 : 1;
      return String(b.numero ?? "").localeCompare(String(a.numero ?? ""), undefined, { numeric: true });
    });
  }, [expedientes, q]);

  const gruposExp = useMemo(() => {
    const mapa = new Map<string, { mes: string; titulo: string; items: any[] }>();
    for (const e of expsFiltered) {
      const raw = String(e.fecha_aprobacion_despacho ?? "").slice(0, 7);
      const mes = /^\d{4}-\d{2}$/.test(raw) ? raw : "";
      let g = mapa.get(mes);
      if (!g) {
        g = {
          mes,
          titulo: mes
            ? new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T12:00:00Z`))
            : "Sin fecha de despacho",
          items: [],
        };
        mapa.set(mes, g);
      }
      g.items.push(e);
    }
    return [...mapa.values()];
  }, [expsFiltered]);

  const [abiertos, setAbiertos] = useState<Set<string> | null>(null);
  useEffect(() => { setAbiertos(null); }, [q]);
  const estaAbierto = (mes: string) => (abiertos ? abiertos.has(mes) : gruposExp[0]?.mes === mes);
  const toggleGrupo = (mes: string) => {
    const next = new Set(abiertos ?? (gruposExp[0] ? [gruposExp[0].mes] : []));
    if (next.has(mes)) next.delete(mes); else next.add(mes);
    setAbiertos(next);
  };

  const trsFiltered = useMemo(() => {
    const s = q.toLowerCase();
    return (transportes ?? []).filter((t: any) =>
      !s ||
      t.numero_viaje?.toLowerCase().includes(s) ||
      t.factura_numero?.toLowerCase().includes(s) ||
      t.clientes?.nombre?.toLowerCase().includes(s)
    );
  }, [transportes, q]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/facturacion"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Facturas Pendientes de Vincular</h1>
          <p className="text-sm text-muted-foreground">
            Regulariza los registros históricos que tienen un N° de factura anotado pero aún no están vinculados a un e-CF formal.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-8" />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Expedientes <Badge variant="secondary">{expsFiltered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-3 py-2">Expediente</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">N° Factura anotado</th>
                <th className="text-left">Fecha despacho</th>
                <th className="text-left">Estado</th>
                <th className="text-left w-[420px]">Vincular a e-CF</th>
              </tr>
            </thead>
            <tbody>
              {expsFiltered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin expedientes pendientes.</td></tr>
              )}
              {gruposExp.flatMap((g) => [
                <tr key={`mes-${g.mes}`} className="bg-muted/70 border-y border-border cursor-pointer hover:bg-muted" onClick={() => toggleGrupo(g.mes)} aria-expanded={estaAbierto(g.mes)}>
                  <th colSpan={6} scope="rowgroup" className="px-3 py-2 text-left text-xs font-bold uppercase text-foreground">
                    {estaAbierto(g.mes) ? "▾" : "▸"} {g.titulo} <span className="font-normal normal-case text-muted-foreground">— {g.items.length} {g.items.length === 1 ? "expediente" : "expedientes"}</span>
                  </th>
                </tr>,
                ...(!estaAbierto(g.mes) ? [] : g.items).map((e: any) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    <Link to="/expedientes/$id" params={{ id: e.id }} className="expediente-numero hover:underline flex items-center gap-1">
                      {e.numero} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td>{e.clientes?.nombre ?? "—"}</td>
                  <td className="font-mono">{e.factura_comercial}</td>
                  <td className="text-muted-foreground">{e.fecha_aprobacion_despacho ? fmtLocalDate(e.fecha_aprobacion_despacho) : "—"}</td>
                  <td><Badge variant="outline">{e.estado}</Badge></td>
                  <td className="py-1.5 pr-3">
                    <FacturaEcfSelector
                      value={null}
                      onChange={(fid) => fid && linkExp.mutate({ id: e.id, fid })}
                      preload={{ cliente_id: e.cliente_id, encf: e.factura_comercial }}
                    />
                  </td>
                </tr>
                )),
              ])}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Transportes <Badge variant="secondary">{trsFiltered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-3 py-2">Viaje</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">N° Factura</th>
                <th className="text-left">Fecha</th>
                <th className="text-right">Ingreso</th>
                <th className="text-left w-[420px]">Vincular a e-CF</th>
              </tr>
            </thead>
            <tbody>
              {trsFiltered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin transportes pendientes.</td></tr>
              )}
              {trsFiltered.map((t: any) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    <Link to="/transportes/$id" params={{ id: t.id }} className="hover:underline flex items-center gap-1">
                      {t.numero_viaje} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td>{t.clientes?.nombre ?? "—"}</td>
                  <td className="font-mono">{t.factura_numero}</td>
                  <td className="text-muted-foreground">{fmtLocalDate(t.factura_fecha)}</td>
                  <td className="text-right">{fmtRD(t.ingreso_facturado)}</td>
                  <td className="py-1.5 pr-3">
                    <FacturaEcfSelector
                      value={null}
                      onChange={(fid) => fid && linkTr.mutate({ id: t.id, fid })}
                      preload={{
                        cliente_id: t.cliente_id,
                        encf: t.factura_numero,
                        monto_total: Number(t.ingreso_facturado) || 0,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
