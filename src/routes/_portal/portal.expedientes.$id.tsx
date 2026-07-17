import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { estadoLabel } from "@/lib/estados-expediente";
import { fmtLocalDate } from "@/lib/dates";
import { RastrearEmbarqueButton } from "@/components/rastrear-embarque-button";
import { ArrowLeft, Check, Circle, Download, FileText } from "lucide-react";
import { toast } from "sonner";
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
            </div>
            <Badge variant="outline" className="text-sm">
              {estadoLabel(expediente.estado)}
            </Badge>
          </div>
        </CardHeader>
        {expediente.bl_awb && (
          <CardContent className="pt-0">
            <RastrearEmbarqueButton blNumber={expediente.bl_awb} expedienteNumber={expediente.numero} />
          </CardContent>
        )}
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
    </div>
  );
}
