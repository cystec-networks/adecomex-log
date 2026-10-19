import { Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TablaClasificacionFactura } from "./tabla-clasificacion-factura";
import { clasificacionGuardadaOptions, historialCopilotoOptions } from "@/lib/copiloto-facturas-queries";

const fecha = (v: string) => new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" }).format(new Date(v));

function DetalleGuardado({ id }: { id: string }) {
  const { data } = useSuspenseQuery(clasificacionGuardadaOptions(id));
  return <div className="space-y-2"><p className="text-xs text-muted-foreground">{fecha(data.created_at)}</p><TablaClasificacionFactura archivo={data.archivo} filas={data.lineas} /></div>;
}

export function HistorialCopiloto() {
  const { data } = useSuspenseQuery(historialCopilotoOptions);
  const [id, setId] = useState<string | null>(null);
  return <section className="space-y-4">
    {id ? <><Button variant="ghost" size="sm" onClick={() => setId(null)}><ArrowLeft className="h-4 w-4" />Historial</Button>
      <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}><DetalleGuardado id={id} /></Suspense></> : <>
      <h2 className="text-base font-bold">Clasificaciones guardadas</h2>
      {!data.length ? <p className="text-sm text-muted-foreground py-6">No hay clasificaciones guardadas.</p> :
        <div className="divide-y border-y">{data.map((r) => <Button key={r.id} variant="ghost" className="w-full h-auto py-3 justify-start gap-3 rounded-none" onClick={() => setId(r.id)}>
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 text-left whitespace-normal break-all flex-1 text-xs">{r.archivo}</span>
          <span className="text-xs text-muted-foreground shrink-0">{fecha(r.created_at)}</span>
        </Button>)}</div>}
    </>}
  </section>;
}