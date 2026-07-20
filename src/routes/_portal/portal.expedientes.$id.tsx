import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { estadoLabel } from "@/lib/estados-expediente";
import { fmtLocalDate } from "@/lib/dates";

import { ArrowLeft, Check, Circle, Download, FileText } from "lucide-react";

import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";

export const Route = createFileRoute("/_portal/portal/expedientes/$id")({
  component: PortalExpedienteDetalle,
});

type EstadoKey = "digitar" | "en_transito" | "presentar" | "verificar" | "despachado" | "entregado" | "facturar";

const TIMELINE: { key: EstadoKey; label: string; fechaField: string }[] = [
  { key: "digitar", label: "Recibido", fechaField: "fecha_recibido" },
  { key: "en_transito", label: "En Tránsito", fechaField: "fecha_en_transito" },
  { key: "presentar", label: "Presentado", fechaField: "fecha_presentado" },
  { key: "verificar", label: "Verificado", fechaField: "fecha_verificado" },
  { key: "despachado", label: "Despachado", fechaField: "fecha_despachado" },
  { key: "entregado", label: "Entregado", fechaField: "fecha_entregado" },
  { key: "facturar", label: "Facturado", fechaField: "fecha_facturado" },
];

function PortalExpedienteDetalle() {
  const { id } = Route.useParams();

  const { data: expediente, isLoading, isError } = useQuery({
    queryKey: ["portal-expediente", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_expedientes_cliente")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: documentos } = useQuery({
    queryKey: ["portal-docs", id],
    enabled: !!expediente,
    queryFn: async () => {
      const { data } = await supabase
        .from("documentos")
        .select("id, tipo, estado, storage_path, created_at, fecha_recepcion")
        .eq("expediente_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: mercancia } = useQuery({
    queryKey: ["portal-mercancia", id],
    enabled: !!expediente,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_mercancia_cliente" as any)
        .select("id, item_no, detalle_producto, cantidad, unidad_medida, peso")
        .eq("expediente_id", id)
        .order("item_no", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const { data: permisos } = useQuery({
    queryKey: ["portal-permisos", id],
    enabled: !!expediente,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_permisos_cliente" as any)
        .select("id, numero, tipo, estado, fecha_solicitud, fecha_emision, fecha_vencimiento")
        .eq("expediente_id", id)
        .order("fecha_solicitud", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: facturas } = useQuery({
    queryKey: ["portal-facturas", id],
    enabled: !!expediente,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_facturas_cliente" as any)
        .select("id, encf, fecha_emision, monto_total, pdf_url")
        .eq("expediente_id", id)
        .order("fecha_emision", { ascending: false });
      return (data ?? []) as any[];
    },
  });



  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (isError || !expediente) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Expediente no encontrado o sin acceso.
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/portal"><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentIdx = TIMELINE.findIndex((s) => s.key === (expediente.estado as EstadoKey));

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/portal"><ArrowLeft className="h-4 w-4 mr-1" /> Mis expedientes</Link>
      </Button>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Expediente</div>
              <CardTitle className="font-mono">{expediente.numero ?? "—"}</CardTitle>
              {expediente.bl_awb && (
                <div className="text-sm text-muted-foreground mt-1">BL/AWB: <span className="font-mono">{expediente.bl_awb}</span></div>
              )}
              {(expediente as any).puerto_arribo && (
                <div className="text-sm text-muted-foreground">Puerto de llegada: <span className="font-medium text-foreground">{(expediente as any).puerto_arribo}</span></div>
              )}
              {(expediente as any).numero_dua && (
                <div className="text-sm text-muted-foreground">DUA: <span className="font-mono">{(expediente as any).numero_dua}</span></div>
              )}
            </div>
            <Badge variant="outline" className="text-sm">
              {estadoLabel(expediente.estado)}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Progreso</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative border-l-2 border-border ml-3 space-y-5">
            {TIMELINE.map((step, idx) => {
              const fecha = (expediente as any)[step.fechaField] as string | null;
              const done = !!fecha || idx < currentIdx;
              const active = idx === currentIdx;
              return (
                <li key={step.key} className="ml-6">
                  <span
                    className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                      done
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : active
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-border text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2 fill-current" />}
                  </span>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className={`font-medium ${active ? "text-primary" : done ? "" : "text-muted-foreground"}`}>
                      {step.label}
                      {active && <span className="ml-2 text-xs font-normal">(actual)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fecha ? fmtLocalDate(fecha) : done ? "—" : "Pendiente"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documentos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!documentos || documentos.length === 0) ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Aún no hay documentos disponibles.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Recepción</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{d.tipo}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-xs capitalize">{d.estado}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{fmtLocalDate(d.fecha_recepcion ?? d.created_at)}</td>
                      <td className="px-4 py-2 text-right">
                        {d.storage_path ? (
                          <DocumentoPreviewButton
                            path={d.storage_path}
                            variant="outline"
                            size="sm"
                            icon={<Download className="h-3.5 w-3.5 mr-1" />}
                            label="Descargar"
                            restringido
                          />
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            <Download className="h-3.5 w-3.5 mr-1" /> Descargar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mercancía declarada</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!mercancia || mercancia.length === 0) ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Sin información de mercancía disponible.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Descripción</th>
                    <th className="px-4 py-2 text-right">Cantidad</th>
                    <th className="px-4 py-2">Unidad</th>
                    <th className="px-4 py-2 text-right">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {mercancia.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-muted-foreground">{m.item_no ?? "—"}</td>
                      <td className="px-4 py-2">{m.detalle_producto ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{m.cantidad ?? "—"}</td>
                      <td className="px-4 py-2">{m.unidad_medida ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{m.peso ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {permisos && permisos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Permisos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Solicitud</th>
                    <th className="px-4 py-2">Aprobación</th>
                  </tr>
                </thead>
                <tbody>
                  {permisos.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{p.tipo ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-xs capitalize">{p.estado ?? "—"}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{p.fecha_solicitud ? fmtLocalDate(p.fecha_solicitud) : "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.fecha_emision ? fmtLocalDate(p.fecha_emision) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {facturas && facturas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Facturas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <th className="px-4 py-2">e-NCF</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2 text-right">Monto total</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f) => (
                    <tr key={f.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono">{f.encf ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{f.fecha_emision ? fmtLocalDate(f.fecha_emision) : "—"}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {f.monto_total != null
                          ? new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(Number(f.monto_total))
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {f.pdf_url ? (
                          <DocumentoPreviewButton
                            path={f.pdf_url}
                            variant="outline"
                            size="sm"
                            icon={<Download className="h-3.5 w-3.5 mr-1" />}
                            label="Ver PDF"
                            restringido
                          />
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            <Download className="h-3.5 w-3.5 mr-1" /> Ver PDF
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
