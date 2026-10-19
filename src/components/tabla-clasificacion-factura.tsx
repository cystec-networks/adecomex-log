import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { descargarExcelClasificacion, excelClasificacion, type FilaClasificacion } from "@/lib/copiloto-facturas";

export function TablaClasificacionFactura({ archivo, filas, pendiente = false, onGuardar, guardado = false }: {
  archivo: string; filas: FilaClasificacion[]; pendiente?: boolean; onGuardar?: () => Promise<unknown>; guardado?: boolean;
}) {
  const [excel, setExcel] = useState<Blob | null>(null);
  useEffect(() => {
    let activo = true;
    setExcel(null);
    if (filas.length && !pendiente) excelClasificacion(filas).then((blob) => { if (activo) setExcel(blob); }).catch(() => { if (activo) toast.error("No se pudo preparar el Excel"); });
    return () => { activo = false; };
  }, [filas, pendiente]);
  const guardar = useMutation({
    mutationFn: async () => { if (onGuardar) await onGuardar(); },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar la clasificación"),
  });
  const pct = (v: number | null) => v == null ? <span className="text-muted-foreground">—</span> : `${v}%`;
  return <Card>
    <CardHeader className="border-b py-3 flex flex-row items-center justify-between gap-3 flex-wrap">
      <CardTitle className="text-sm text-muted-foreground min-w-0 break-all">Clasificación de factura{archivo ? ` · ${archivo}` : ""}</CardTitle>
      {!pendiente && <div className="flex items-center gap-2 flex-wrap">
        {onGuardar && <Button type="button" variant="outline" size="sm" disabled={guardar.isPending || guardado} onClick={() => guardar.mutate()}>
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{guardado ? "Guardado" : "Guardar"}
        </Button>}
        <Button type="button" variant="outline" size="sm" disabled={!excel} onClick={() => { if (excel) descargarExcelClasificacion(excel, archivo); }}>
          <Download className="h-4 w-4" />Descargar (.xlsx)
        </Button>
      </div>}
    </CardHeader>
    <CardContent className="p-0 overflow-auto">
      {pendiente ? <div className="p-4 text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo y clasificando líneas…</div> :
        <table className="w-full text-xs min-w-[580px]">
          <thead className="bg-muted/40 text-muted-foreground"><tr>
            <th className="text-left p-2">Descripción</th><th className="text-left p-2">Partida sugerida</th>
            <th className="text-right p-2">Gravamen (%)</th><th className="text-right p-2">ITBIS (%)</th><th className="p-2 w-10" />
          </tr></thead>
          <tbody>{filas.map((f, i) => <tr key={i} className="border-t align-top">
            <td className="p-2">{f.descripcion || <span className="text-muted-foreground">(sin descripción)</span>}
              {(f.cantidad != null || f.unidad) && <div className="text-[11px] text-muted-foreground">{[f.cantidad, f.unidad].filter((x) => x != null).join(" ")}</div>}
            </td>
            <td className="p-2 font-mono whitespace-nowrap">{f.insuficiente ? <span className="font-sans text-muted-foreground">Descripción insuficiente — clasifica manualmente abajo</span> : f.partida ? <>
              {f.partida}{!f.enArancel && <div className="font-sans text-[11px] text-muted-foreground">No encontrada en el Arancel</div>}
            </> : <span className="font-sans text-muted-foreground">Sin sugerencia</span>}</td>
            <td className="p-2 text-right tabular-nums">{pct(f.gravamen)}</td><td className="p-2 text-right tabular-nums">{pct(f.itbis)}</td>
            <td className="p-2">{f.partida && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Copiar partida ${f.partida}`} onClick={async () => {
              if (!f.partida) return;
              try { await navigator.clipboard.writeText(f.partida); toast.success(`Partida ${f.partida} copiada`); } catch { toast.error("No se pudo copiar la partida"); }
            }}><Copy className="h-3.5 w-3.5" /></Button>}</td>
          </tr>)}</tbody>
        </table>}
    </CardContent>
  </Card>;
}