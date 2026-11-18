// Simulación y aplicación en lote del autocompletado desde BL/AWB o Factura comercial.
// Vista previa antes de guardar, aplicación seleccionable y deshacer del lote completo.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, ChevronLeft, ChevronRight, Loader2, RotateCcw, ScanLine, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { etiquetaCampoOperativo } from "@/lib/autocompletar-operativo";
import {
  aplicarLoteOperativo, deshacerLoteOperativo, listarLotesOperativo, prepararLecturasOperativo, simularLoteOperativo,
  type FilaLoteOperativo,
} from "@/lib/autocompletar-operativo-lote.functions";

const TAM = 20;

/** Botón del encabezado del listado: abre la simulación del autocompletado en lote. */
export function AutocompletadoLoteBoton({ className }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={() => setAbierto(true)}>
        <Bot className="h-4 w-4 mr-1" />Autocompletar BL/Factura
      </Button>
      <AutocompletadoLoteDialog open={abierto} onOpenChange={setAbierto} />
    </>
  );
}

export function AutocompletadoLoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [filas, setFilas] = useState<FilaLoteOperativo[]>([]);
  const [desde, setDesde] = useState(0);
  const [simulando, setSimulando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [lote, setLote] = useState<string | null>(null);
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null);
  const [simulado, setSimulado] = useState(false);

  const lotes = useQuery({
    queryKey: ["autocompletado-lotes"],
    queryFn: () => listarLotesOperativo(),
    enabled: open,
  });

  const simular = async (punto: number) => {
    setSimulando(true); setFilas([]);
    try {
      const r = await simularLoteOperativo({ data: { desde: punto, limite: TAM } });
      setFilas(r.filas); setDesde(r.desde); setExcluidos(new Set()); setSimulado(true);
      if (!r.filas.length) toast.info("No hay más Expedientes con lectura guardada en este tramo.");
    } catch (e) { toast.error(`No se pudo simular: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSimulando(false); }
  };

  const leer = async () => {
    setLeyendo(true);
    try {
      for (;;) {
        const r = await prepararLecturasOperativo({ data: { limite: 3 } });
        setProgreso(`${r.leidos} leídos · ${r.restantes} restantes`);
        setAvisos((a) => [...a, ...r.avisos].slice(-12));
        if (!r.leidos || !r.restantes) break;
      }
      qc.invalidateQueries({ queryKey: ["documentos"] });
      toast.success("Lecturas preparadas.");
    } catch (e) { toast.error(`No se pudieron leer los documentos: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setLeyendo(false); }
  };

  const aplicar = async () => {
    const ids = filas.filter((f) => f.ok && f.completados.length && !excluidos.has(f.documento_id)).map((f) => f.documento_id);
    if (!ids.length) { toast.info("No hay filas seleccionadas con campos que completar."); return; }
    setAplicando(true);
    try {
      const r = await aplicarLoteOperativo({ data: { documentoIds: ids } });
      setLote(r.lote_id); setAvisos((a) => [...a, ...r.avisos].slice(-12));
      toast.success(`Lote aplicado: ${r.aplicados} Expediente(s), ${r.campos} campo(s), ${r.contenedores} contenedor(es). Puedes deshacerlo.`);
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["autocompletado-lotes"] });
      await simular(desde);
    } catch (e) { toast.error(`No se pudo aplicar el lote: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setAplicando(false); }
  };

  const deshacer = async (loteId: string) => {
    setDeshaciendo(loteId);
    try {
      const r = await deshacerLoteOperativo({ data: { loteId } });
      toast.success(`Lote deshecho: ${r.restaurados} campo(s) devueltos, ${r.contenedores} contenedor(es) quitados.`);
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["autocompletado-lotes"] });
      qc.invalidateQueries({ queryKey: ["documentos"] });
      await simular(desde);
    } catch (e) { toast.error(`No se pudo deshacer: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDeshaciendo(null); }
  };

  const seleccionadas = filas.filter((f) => f.ok && f.completados.length && !excluidos.has(f.documento_id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Autocompletar desde BL y Factura · Simulación</DialogTitle>
          <DialogDescription>
            Nada se guarda hasta que apliques el lote. Solo se completan campos vacíos de Expedientes
            que no están Completados; lo manual no se cambia. El lote se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void leer()} disabled={leyendo}>
            {leyendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1 h-4 w-4" />}
            Leer documentos sin lectura
          </Button>
          {progreso && <span className="text-[12px] text-muted-foreground">{progreso}</span>}
          <Button size="sm" onClick={() => void simular(0)} disabled={simulando}>
            {simulando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
            Ver simulación
          </Button>
          {filas.length === TAM && (
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={desde <= 0 || simulando} onClick={() => void simular(Math.max(0, desde - TAM))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-[12px] tabular-nums">{desde + 1}–{desde + filas.length}</span>
              <Button variant="ghost" size="sm" disabled={simulando} onClick={() => void simular(desde + TAM)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {avisos.length > 0 && (
          <div className="grid gap-1 rounded-md border border-amber-500/40 p-2 text-[12px]">
            {avisos.map((a, i) => <div key={i} className="break-words">{a}</div>)}
          </div>
        )}

        {simulado && !simulando && !filas.length && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[12px]">
            Ningún documento de este tramo tiene lectura guardada todavía. Pulsa «Leer documentos
            sin lectura» para leerlos con el modelo económico y vuelve a simular.
          </div>
        )}

        {filas.length > 0 && (
          <div className="grid gap-1.5">
            {filas.map((f) => (
              <div key={f.documento_id} className={`rounded-md border p-2 ${f.ok ? "" : "border-destructive/40 bg-destructive/5"}`}>
                <label className="flex items-start gap-2">
                  <Checkbox
                    disabled={!f.ok || !f.completados.length}
                    checked={f.ok && !!f.completados.length && !excluidos.has(f.documento_id)}
                    onCheckedChange={(c) => setExcluidos((prev) => {
                      const s = new Set(prev);
                      if (c === true) s.delete(f.documento_id); else s.add(f.documento_id);
                      return s;
                    })}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{f.numero}</span>
                    <span className="text-muted-foreground"> · {f.tipo}</span>
                    {!f.ok && <span className="text-destructive"> · no corresponde al Expediente</span>}
                  </span>
                </label>
                {!f.ok && <div className="mt-1 pl-6 text-[12px] text-destructive">{f.errores.join(" ")}</div>}
                {f.ok && f.completados.length > 0 && (
                  <div className="mt-1 pl-6 text-[12px]">
                    <span className="text-muted-foreground">Se llenará: </span>
                    {f.completados.map((c) => etiquetaCampoOperativo(c)).join(", ")}
                    {Array.isArray(f.cambios.contenedores) && <span> · contenedores ({(f.cambios.contenedores as unknown[]).length})</span>}
                  </div>
                )}
                {f.ok && !f.completados.length && <div className="mt-1 pl-6 text-[12px] text-muted-foreground">No tiene campos vacíos que completar.</div>}
                {f.alertas.length > 0 && <div className="mt-1 pl-6 text-[12px] text-destructive">Difiere: {f.alertas.join(" ")}</div>}
                {f.avisos.length > 0 && <div className="mt-1 pl-6 text-[12px] text-muted-foreground">{f.avisos.join(" ")}</div>}
              </div>
            ))}
          </div>
        )}

        {lote && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-[12px]">
            Último lote aplicado: <span className="font-mono">{lote.slice(0, 8)}</span>
          </div>
        )}

        {(lotes.data?.length ?? 0) > 0 && (
          <div className="grid gap-1.5 rounded-md border p-2">
            <div className="text-[12px] font-semibold">Lotes aplicados</div>
            {lotes.data!.map((l) => (
              <div key={l.lote_id} className="flex items-center gap-2 text-[12px]">
                <span className="tabular-nums">{new Date(l.aplicado_en).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" })}</span>
                <span className="text-muted-foreground">{l.expedientes} Expediente(s) · {l.campos} campo(s)</span>
                {l.deshecho_en
                  ? <span className="text-muted-foreground">deshecho</span>
                  : (
                    <Button variant="outline" size="sm" className="ml-auto h-7" disabled={deshaciendo === l.lote_id} onClick={() => void deshacer(l.lote_id)}>
                      {deshaciendo === l.lote_id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
                      Deshacer
                    </Button>
                  )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <span className="mr-auto flex items-center gap-1 text-[12px] text-muted-foreground">
            <Bot className="h-3.5 w-3.5" /> {seleccionadas} Expediente(s) seleccionados
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={() => void aplicar()} disabled={aplicando || !seleccionadas}>
            {aplicando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Aplicar lote ({seleccionadas})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
