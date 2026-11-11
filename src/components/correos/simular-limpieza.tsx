import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eraser, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DIAS_ADJUNTOS_DESCARTADOS, DIAS_REGISTRO_DESCARTADOS, simularLimpiezaCorreos } from "@/lib/correos-recibidos";

const fechaHora = (s: string) => new Date(s).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "medium", timeStyle: "short" });
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

/** «Simular limpieza»: muestra qué borraría hoy la limpieza diaria, sin borrar nada. */
export function SimularLimpieza() {
  const [abierto, setAbierto] = useState(false);
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["simular-limpieza-correos"], queryFn: () => simularLimpiezaCorreos(supabase), enabled: abierto, staleTime: 0, gcTime: 0,
  });
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => setAbierto(true)}>
        <Eraser className="h-3.5 w-3.5" />Simular limpieza
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Simulación de la limpieza diaria</DialogTitle>
            <DialogDescription className="text-[12px]">
              Lo que se borraría si la limpieza se ejecutara ahora. No se borra nada. La limpieza quita los adjuntos de correos descartados hace más de {DIAS_ADJUNTOS_DESCARTADOS} días y la línea de los descartados hace más de {DIAS_REGISTRO_DESCARTADOS}. Errores, solicitudes creadas y adjuntadas nunca se borran.
            </DialogDescription>
          </DialogHeader>
          {isError ? <p className="text-[13px] text-destructive">No se pudo calcular la simulación.</p>
            : !data ? <p className="text-[13px] text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Calculando…</p>
            : (
              <div className="space-y-3 text-[13px]">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-muted-foreground">Adjuntos que se borrarían</div>
                    <div className="text-[18px] font-semibold">{data.adjuntos}</div>
                    <div className="text-[11px] text-muted-foreground">{plural(data.correosConAdjuntos, "correo")}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-muted-foreground">Líneas que se quitarían</div>
                    <div className="text-[18px] font-semibold">{data.lineas}</div>
                    <div className="text-[11px] text-muted-foreground">descartados de más de {DIAS_REGISTRO_DESCARTADOS} días</div>
                  </div>
                </div>
                <p className="text-[12px] text-muted-foreground">Próxima limpieza programada: {fechaHora(data.ejecucion)}.</p>
                {data.ejemplos.length > 0 && (
                  <div>
                    <div className="text-[12px] font-medium mb-1">Correos afectados{data.correosConAdjuntos > data.ejemplos.length ? ` (primeros ${data.ejemplos.length})` : ""}</div>
                    <ul className="divide-y rounded-md border text-[12px] max-h-56 overflow-y-auto">
                      {data.ejemplos.map((e, i) => (
                        <li key={i} className="px-2 py-1.5 min-w-0">
                          <div className="truncate" title={e.asunto ?? ""}>{e.asunto || "(sin asunto)"}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{e.remitente} · {plural(e.adjuntos, "adjunto")}{e.quitaLinea ? " · también se quita la línea" : ""}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.adjuntos === 0 && data.lineas === 0 && <p className="text-[12px]">Hoy la limpieza no borraría nada.</p>}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={isFetching} onClick={() => refetch()}>
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />Volver a calcular
                </Button>
              </div>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}
