import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FilePlus2, ListChecks, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RESULTADO_CORREO, correoAtascado, registroCorreos } from "@/lib/correos-recibidos";
import { crearSolicitudDesdeCorreo } from "@/lib/correos-recibidos.functions";

const FILTROS = [
  { id: "todos", etiqueta: "Todos" },
  { id: "error", etiqueta: "Errores" },
  { id: "creada", etiqueta: "Creadas" },
  { id: "adjuntada", etiqueta: "Adjuntadas a Expediente" },
  { id: "descartada", etiqueta: "Descartadas" },
] as const;

const TONO: Record<string, string> = {
  ok: "bg-[var(--success)]/15 text-[var(--success)] border-transparent",
  info: "bg-[var(--info)]/15 text-[var(--info)] border-transparent",
  aviso: "bg-[var(--warning)]/25 text-[var(--warning-foreground)] border-transparent",
  error: "bg-destructive/15 text-destructive border-transparent",
};

const fechaHora = (s: string) => new Date(s).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });

/** Auditoría: cada correo entregado por el script con su resultado, para comprobar que ninguno se pierde. */
export function RegistroCorreos({ filtroInicial }: { filtroInicial?: string }) {
  const [filtro, setFiltro] = useState<string>(FILTROS.some((f) => f.id === filtroInicial) ? filtroInicial! : "todos");
  useEffect(() => { if (filtroInicial) document.getElementById("registro-correos")?.scrollIntoView({ block: "start" }); }, [filtroInicial]);
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["registro-correos", filtro], queryFn: () => registroCorreos(supabase, filtro), refetchInterval: 60_000 });
  const qc = useQueryClient();
  const crear = useServerFn(crearSolicitudDesdeCorreo);
  const crearSolicitud = useMutation({
    mutationFn: (registroId: string) => crear({ data: { registroId } }),
    onSuccess: (r) => {
      if (r.resultado === "adjuntada") toast.success(`El correo corresponde al Expediente ${r.expediente_numero}; sus documentos se adjuntaron allí.`);
      else toast.success(r.resultado === "actualizada" ? "Se actualizó la solicitud pendiente de este remitente." : "Solicitud creada. Revísala en la bandeja de solicitudes.");
      qc.invalidateQueries({ queryKey: ["registro-correos"] });
      qc.invalidateQueries({ queryKey: ["solicitudes-correo"] });
      qc.invalidateQueries({ queryKey: ["correos-pendientes-kpi"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear la solicitud"),
  });
  return (
    <section className="space-y-2" id="registro-correos">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[14px] font-bold flex items-center gap-2"><ListChecks className="h-4 w-4" />Registro de correos recibidos</h2>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <Button key={f.id} size="sm" variant={filtro === f.id ? "default" : "outline"} className="h-7 px-2 text-[12px]" onClick={() => setFiltro(f.id)}>{f.etiqueta}</Button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Últimos 200 correos que el buzón entregó a la plataforma. Solo crean solicitud los correos con documentos de importación en PDF que no corresponden a un Expediente. Un correo con error se reintenta automáticamente. Si un correo descartado sí era un embarque, usa «Crear solicitud».</p>
      <Card>
        <CardContent className="p-0 overflow-auto">
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Cargando…</p> : isError ? <p className="p-6 text-sm text-destructive">No se pudo cargar el registro.</p> : data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">Sin correos registrados con este filtro.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr><th className="px-2 py-1.5">Último intento</th><th className="px-2">Remitente / Asunto</th><th className="px-2">Resultado</th><th className="px-2">Motivo</th><th className="px-2 text-center">Intentos</th><th className="px-2">Destino</th></tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const atascado = correoAtascado(c);
                  const r = atascado ? { etiqueta: "Interrumpido", tono: "error" as const } : RESULTADO_CORREO[c.resultado] ?? { etiqueta: c.resultado, tono: "aviso" as const };
                  return (
                    <tr key={c.id} className="border-t align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap">{fechaHora(c.ultimo_intento_at)}</td>
                      <td className="px-2 py-1.5 min-w-0 max-w-[420px]">
                        <div className="text-[11px] text-muted-foreground truncate" title={c.remitente}>{c.remitente_correo ?? c.remitente}</div>
                        <div className="break-words">{c.asunto || "(sin asunto)"}</div>
                        {(c.advertencias ?? []).slice(0, 3).map((a) => <div key={a} className="text-[11px] text-warning-foreground">⚠ {a}</div>)}
                      </td>
                      <td className="px-2 py-1.5"><Badge className={`text-[11px] whitespace-nowrap ${TONO[r.tono]}`}>{r.etiqueta}</Badge></td>
                      <td className="px-2 py-1.5 max-w-[360px] break-words">{atascado ? "El proceso se interrumpió sin terminar; se reintentará." : c.motivo ?? "—"}</td>
                      <td className="px-2 py-1.5 text-center">{c.intentos}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {c.expediente_id && c.resultado === "adjuntada" ? <Link to="/expedientes/$id" params={{ id: c.expediente_id }} search={{ ficha: "checklist" }} className="text-primary hover:underline expediente-numero">{c.expediente_numero}</Link>
                          : c.solicitud_id && c.resultado !== "descartada" ? <span className="text-muted-foreground">Solicitud por correo</span>
                          : (c.resultado === "descartada" || (c.resultado === "error" && !atascado && (c.cuerpo || c.asunto))) ? (
                            <div className="space-y-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" disabled={crearSolicitud.isPending}
                                onClick={() => crearSolicitud.mutate(c.id)} title={c.solicitud_id ? "Restaurar la solicitud descartada en la bandeja" : "Crear la solicitud con el texto y los PDF guardados de este correo"}>
                                {crearSolicitud.isPending && crearSolicitud.variables === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                                Crear solicitud
                              </Button>
                              {Array.isArray(c.adjuntos_respaldo) && c.adjuntos_respaldo.length > 0 && (
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" />{c.adjuntos_respaldo.length} adjunto{c.adjuntos_respaldo.length === 1 ? "" : "s"} guardado{c.adjuntos_respaldo.length === 1 ? "" : "s"}</div>
                              )}
                            </div>
                          ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
