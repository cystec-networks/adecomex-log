import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMyRoles } from "@/lib/auth-hooks";
import { propuestasPendientes, type CampoPropuesto } from "@/lib/correo-expediente";
import { aplicarPropuestaCorreo, correosDeExpediente, descartarPropuestaCorreo, type CorreoRecibido } from "@/lib/correos-recibidos";
import { fmtLocalDate } from "@/lib/dates";

const fechaHora = (s: string) => new Date(s).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });
const ROLES_EDITAN = ["admin", "operaciones", "ejecutivo", "agente_aduanal"];

/** Correos que llegaron para este Expediente (Seguimientos), con datos faltantes por confirmar. */
export function CorreosExpediente({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const { data: roles = [] } = useMyRoles();
  const puedeEditar = roles.some((r) => ROLES_EDITAN.includes(r));
  const clave = ["correos-expediente", expedienteId];
  const { data: correos = [] } = useQuery({ queryKey: clave, queryFn: () => correosDeExpediente(supabase, expedienteId) });

  const accion = useMutation({
    mutationFn: async ({ registro, campo, aplicar }: { registro: CorreoRecibido; campo: CampoPropuesto; aplicar: boolean }) => {
      if (!aplicar) { await descartarPropuestaCorreo(supabase, registro.id, campo); return null; }
      return aplicarPropuestaCorreo(supabase, registro, campo);
    },
    onSuccess: (r) => {
      if (r?.aplicada) toast.success("Dato aplicado al Expediente");
      else if (r && !r.aplicada) toast.warning("El Expediente ya tenía ese dato cargado; no se sobrescribió");
      qc.invalidateQueries({ queryKey: clave });
      qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
      qc.invalidateQueries({ queryKey: ["alertas-correo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!correos.length) return null;
  return (
    <Card className="mb-3">
      <CardHeader className="py-2.5">
        <CardTitle className="text-[14px] flex items-center gap-2"><Mail className="h-4 w-4" />Correos recibidos <Badge variant="secondary">{correos.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {correos.map((c) => {
            const pendientes = propuestasPendientes(c.propuestas);
            return (
              <li key={c.id} className="px-3 py-2 text-[12px] space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground whitespace-nowrap">{fechaHora(c.created_at)}</span>
                  <span className="font-medium min-w-0 break-words">{c.asunto || "(sin asunto)"}</span>
                </div>
                <div className="text-[11px] text-muted-foreground break-words">
                  {c.remitente_correo ?? c.remitente} · {c.adjuntos_total} adjunto{c.adjuntos_total === 1 ? "" : "s"} guardado{c.adjuntos_total === 1 ? "" : "s"} en Documentos · {c.vinculo === "bl" ? "relacionado por BL" : c.vinculo === "vuce" ? "relacionado por trámite VUCE" : "relacionado por número de Expediente"}
                </div>
                {(c.advertencias ?? []).map((a) => <div key={a} className="text-[11px] text-warning-foreground">⚠ {a}</div>)}
                {pendientes.length > 0 && (
                  <div className="rounded-md border border-warning/40 bg-warning/10 p-2 space-y-1.5">
                    <div className="text-[11px] font-medium">Datos que faltan en el Expediente, por confirmar:</div>
                    {pendientes.map(([campo, p]) => (
                      <div key={campo} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0">{p.etiqueta}: <span className="font-mono font-medium">{campo === "fecha_llegada_real" ? fmtLocalDate(p.valor) : p.valor}</span> <span className="text-[11px] text-muted-foreground">({p.origen})</span></span>
                        {puedeEditar && (
                          <span className="flex gap-1 ml-auto">
                            <Button size="sm" className="h-7 px-2" disabled={accion.isPending} onClick={() => accion.mutate({ registro: c, campo, aplicar: true })}><Check className="h-3.5 w-3.5 mr-1" />Aplicar</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={accion.isPending} onClick={() => accion.mutate({ registro: c, campo, aplicar: false })}><X className="h-3.5 w-3.5 mr-1" />Descartar</Button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
