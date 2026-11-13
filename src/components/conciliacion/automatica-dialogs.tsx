import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Undo2, Ban, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtLocalDate } from "@/lib/dates";
import { resumenLoteAutomatico, SECUENCIAS_EXCLUIDAS_AUTOMATICA, type MovimientoBanco, type PlanAutomatico } from "@/lib/conciliacion-diario";
import { ejecutarConciliacionAutomatica, fmtRD, useInvalidarConciliacion, type DetalleAutomaticoFila, type ResultadoRpcAutomatico } from "./datos";

export type ResultadoAutomatico = ResultadoRpcAutomatico & { creditos: number; archivo: string };

type MovMin = { id: string; fecha: string; monto: number; descripcion: string | null };

const autoResueltos = (r: Pick<ResultadoRpcAutomatico, "conciliados" | "creadas" | "no_aplica" | "comisiones"> | null | undefined) =>
  r ? (r.conciliados ?? 0) + (r.creadas ?? 0) + (r.no_aplica ?? 0) + (r.comisiones ?? 0) : 0;

function useDeshacerLote(onDone: () => void) {
  const invalidar = useInvalidarConciliacion();
  return useMutation({
    mutationFn: async (lote: string) => {
      const { data, error } = await supabase.rpc("deshacer_lote_automatico", { p_lote: lote });
      if (error) throw error;
      return data as { deshechos: number; anuladas: number; tf_liberados?: string[] };
    },
    onSuccess: (r) => {
      const lib = r.tf_liberados ?? [];
      toast.success(`${r.deshechos} débitos vuelven a Pendiente`
        + (r.anuladas ? ` · ${r.anuladas} entradas creadas quedaron «Anulada»` : "")
        + (lib.length ? ` · ${lib.join(", ")} pasan a «Números TF sin uso» y se reutilizan primero` : ""));
      invalidar();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function ConfirmarDeshacer({ lote, cantidad, onClose, onDone }: { lote: string | null; cantidad: number; onClose: () => void; onDone: () => void }) {
  const deshacer = useDeshacerLote(() => { onClose(); onDone(); });
  return (
    <AlertDialog open={!!lote} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Deshacer toda la conciliación automática?</AlertDialogTitle>
          <AlertDialogDescription>
            Los {cantidad} débitos resueltos en este lote vuelven a Pendiente (también los «No aplica» y las comisiones vinculadas).
            Las entradas creadas desde el banco quedan «Anulada» en la secuencia TF (no se borran). Los TF puestos a entradas que ya
            existían se les quitan y pasan a «Números TF sin uso»; se reutilizan primero en la siguiente asignación.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={deshacer.isPending} onClick={(e) => { e.preventDefault(); if (lote) deshacer.mutate(lote); }}>
            Deshacer lote
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EtiquetaAccion({ d }: { d: DetalleAutomaticoFila }) {
  const b = (t: string) => <Badge variant="outline" className="text-[11px] font-normal">{t}</Badge>;
  switch (d.accion) {
    case "crear": return <><span className="font-mono">{d.secuencia}</span> {b(`Entrada nueva${d.categoria ? ` · ${d.categoria}` : ""}`)}</>;
    case "conciliar": return <><span className="font-mono">{d.secuencia}</span> {d.tf_asignado ? b(d.fuente_tf === "reutilizado" ? "TF reutilizado" : "TF asignado") : null}</>;
    case "no_aplica": return b("No aplica (anterior al Diario)");
    case "comision": return <span title={d.pago ?? ""}>{b("Comisión vinculada a su pago")}</span>;
    default: return null;
  }
}

/** Tablas de débitos resueltos solos y pendientes de revisión (resultado y vista previa). */
function TablasDetalle({ detalle, movimientos }: { detalle: DetalleAutomaticoFila[]; movimientos: Map<string, MovMin> }) {
  const filas = detalle.map((d) => ({ d, m: movimientos.get(d.movimiento_id) }));
  const autoFilas = filas.filter((x) => x.d.accion !== "revision");
  const revFilas = filas.filter((x) => x.d.accion === "revision");
  const fecha = (x: { d: DetalleAutomaticoFila; m?: MovMin }) => fmtLocalDate(x.m?.fecha ?? x.d.fecha ?? "");
  const monto = (x: { d: DetalleAutomaticoFila; m?: MovMin }) => fmtRD(Number(x.m?.monto ?? x.d.monto ?? 0));
  return (
    <>
      {autoFilas.length > 0 && (
        <div className="rounded-md border">
          <div className="flex items-center gap-1 border-b bg-muted px-2 py-1 text-[12px] font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Resueltos automáticamente
          </div>
          <table className="w-full text-[12px]">
            <tbody>
              {autoFilas.map((x) => (
                <tr key={x.d.movimiento_id} className="border-t first:border-t-0">
                  <td className="px-2 py-1 whitespace-nowrap">{fecha(x)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{monto(x)}</td>
                  <td className="px-2 py-1 min-w-0 truncate max-w-[220px]" title={x.d.beneficiario ?? x.m?.descripcion ?? ""}>{x.d.beneficiario ?? x.m?.descripcion ?? "—"}</td>
                  <td className="px-2 py-1 whitespace-nowrap"><EtiquetaAccion d={x.d} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {revFilas.length > 0 && (
        <div className="rounded-md border border-amber-500/60">
          <div className="flex items-center gap-1 border-b bg-amber-500/10 px-2 py-1 text-[12px] font-medium">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Pendientes de revisión
          </div>
          <table className="w-full text-[12px]">
            <tbody>
              {revFilas.map((x) => (
                <tr key={x.d.movimiento_id} className="border-t first:border-t-0">
                  <td className="px-2 py-1 whitespace-nowrap">{fecha(x)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{monto(x)}</td>
                  <td className="px-2 py-1 min-w-0 truncate max-w-[240px]" title={x.m?.descripcion ?? ""}>{x.m?.descripcion ?? "—"}</td>
                  <td className="px-2 py-1 text-amber-700 dark:text-amber-400">{x.d.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Resumen al terminar: «X conciliados automáticamente, Y requieren tu revisión». */
export function ResultadoAutomaticoDialog({ resultado, movimientos, onClose, onVerRevision }: {
  resultado: ResultadoAutomatico | null;
  movimientos: Map<string, MovMin>;
  onClose: () => void;
  onVerRevision: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const auto = autoResueltos(resultado);
  return (
    <>
      <Dialog open={!!resultado} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{auto} conciliados automáticamente, {resultado?.revision ?? 0} requieren tu revisión</DialogTitle>
            <DialogDescription>
              {resultado?.archivo} · {resultado?.conciliados ?? 0} con su entrada del Diario, {resultado?.creadas ?? 0} con entrada nueva,
              {" "}{resultado?.no_aplica ?? 0} «No aplica (anterior al Diario)» y {resultado?.comisiones ?? 0} comisiones vinculadas a su pago.
              {resultado && resultado.creditos > 0 ? ` ${resultado.creditos} créditos importados quedan fuera (solo se concilian débitos).` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-auto">
            <TablasDetalle detalle={resultado?.detalle ?? []} movimientos={movimientos} />
            {(resultado?.detalle ?? []).length === 0 && <div className="text-[13px] text-muted-foreground">No había débitos que conciliar.</div>}
          </div>
          <DialogFooter className="gap-2">
            {auto > 0 && resultado?.lote && (
              <Button variant="outline" onClick={() => setConfirmar(true)}>
                <Undo2 className="mr-1 h-4 w-4" /> Deshacer todo el lote
              </Button>
            )}
            {(resultado?.revision ?? 0) > 0 && <Button variant="secondary" onClick={onVerRevision}>Ver pendientes de revisión</Button>}
            <Button onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmarDeshacer lote={confirmar ? resultado?.lote ?? null : null} cantidad={auto} onClose={() => setConfirmar(false)} onDone={onClose} />
    </>
  );
}

type Previa = {
  resultado: ResultadoRpcAutomatico | null;
  plan: PlanAutomatico<MovimientoBanco>;
  evaluados: number;
  desde: string;
  hasta: string;
};

const etiquetaRango = (desde: string, hasta: string) =>
  desde || hasta ? `${desde ? fmtLocalDate(desde) : "inicio"} – ${hasta ? fmtLocalDate(hasta) : "hoy"}` : "todas las fechas";

/** «Ejecutar conciliación automática sobre pendientes existentes»: mismas reglas que tras importar, sobre los débitos
 * pendientes del rango. Primero una vista previa exacta (simulada en el servidor, sin guardar ni consumir números TF);
 * solo al confirmar se aplica, y si algo cambió desde la vista previa no se guarda nada. */
export function PendientesAutomaticaDialog({ open, onClose, movimientos, onResultado }: {
  open: boolean;
  onClose: () => void;
  movimientos: Map<string, MovMin>;
  onResultado: (r: ResultadoAutomatico) => void;
}) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const invalidar = useInvalidarConciliacion();
  const enRango = (d: string, h: string) => (ps: MovimientoBanco[]) => ps.filter((m) => (!d || m.fecha >= d) && (!h || m.fecha <= h));

  const calcular = useMutation({
    mutationFn: async () => {
      const r = await ejecutarConciliacionAutomatica({ elegir: enRango(desde, hasta), archivo: "", origen: "pendientes", simular: true });
      return { ...r, desde, hasta };
    },
    onSuccess: (r) => setPrevia(r),
    onError: (e: Error) => toast.error(`No se pudo calcular la vista previa: ${e.message}`),
  });

  const confirmar = useMutation({
    mutationFn: async () => {
      if (!previa?.resultado) throw new Error("Calcula la vista previa primero");
      const archivo = `Pendientes existentes (${etiquetaRango(previa.desde, previa.hasta)})`;
      const r = await ejecutarConciliacionAutomatica({
        elegir: enRango(previa.desde, previa.hasta), archivo, origen: "pendientes", previsto: previa.resultado.detalle,
      });
      if (!r.resultado) throw new Error("Ya no quedan débitos pendientes en ese rango");
      return { ...r.resultado, creditos: 0, archivo };
    },
    onSuccess: (r) => { invalidar(); setPrevia(null); onClose(); onResultado(r); },
    onError: (e: Error) => { toast.error(e.message); setPrevia(null); invalidar(); },
  });

  const cerrar = () => { setPrevia(null); onClose(); };
  const res = previa?.resultado ?? null;
  const tot = resumenLoteAutomatico(res?.detalle ?? []);
  const excluidosTotal = (previa?.plan.excluidos ?? []).reduce((t, x) => t + x.movimiento.monto, 0);
  const auto = autoResueltos(res);
  const filas: { etiqueta: string; cantidad: number; total: number; nota?: string }[] = res ? [
    { etiqueta: "Conciliar con su entrada del Diario", ...tot.conciliar,
      nota: (() => { const n = (res.detalle ?? []).filter((d) => d.accion === "conciliar" && d.tf_asignado).length; return n ? `${n} reciben TF` : undefined; })() },
    { etiqueta: "Crear entrada nueva (con TF) y conciliar", ...tot.crear },
    { etiqueta: "No aplica (anterior al Diario)", ...tot.no_aplica },
    { etiqueta: "Comisiones vinculadas al pago del mismo día (sin TF)", ...tot.comision },
  ] : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Ejecutar conciliación automática sobre pendientes existentes</DialogTitle>
          <DialogDescription>
            Aplica las mismas reglas que tras cada importación a los débitos pendientes ya cargados. Primero verás la vista previa con los
            totales; no se guarda nada ni se usa ningún número TF hasta que confirmes. {SECUENCIAS_EXCLUIDAS_AUTOMATICA.join(", ")} quedan
            fuera hasta que indiques su TF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label className="text-[12px]">Desde</Label>
            <Input type="date" className="h-9 w-40" value={desde} onChange={(e) => { setDesde(e.target.value); setPrevia(null); }} /></div>
          <div className="space-y-1"><Label className="text-[12px]">Hasta</Label>
            <Input type="date" className="h-9 w-40" value={hasta} onChange={(e) => { setHasta(e.target.value); setPrevia(null); }} /></div>
          <Button onClick={() => calcular.mutate()} disabled={calcular.isPending || confirmar.isPending}>
            {calcular.isPending ? "Calculando…" : previa ? "Recalcular vista previa" : "Calcular vista previa"}
          </Button>
          {!desde && !hasta && <span className="text-[11px] text-muted-foreground">Sin fechas se evalúan todos los débitos pendientes.</span>}
        </div>

        {previa && !res && previa.plan.excluidos.length === 0 && (
          <div className="text-[13px] text-muted-foreground">No hay débitos pendientes en {etiquetaRango(previa.desde, previa.hasta)}.</div>
        )}

        {previa && (res || previa.plan.excluidos.length > 0) && (
          <div className="space-y-3">
            <div className="text-[13px]">
              <strong>{auto} se resolverían automáticamente, {res?.revision ?? 0} quedarían en revisión</strong>
              <span className="text-muted-foreground"> · {previa.evaluados} débitos pendientes en {etiquetaRango(previa.desde, previa.hasta)}</span>
            </div>
            <div className="rounded-md border">
              <table className="w-full text-[12px]">
                <thead className="bg-muted"><tr className="text-left">
                  <th className="px-2 py-1">Acción</th><th className="px-2 py-1 text-right">Débitos</th><th className="px-2 py-1 text-right">Monto</th><th className="px-2 py-1" />
                </tr></thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.etiqueta} className="border-t">
                      <td className="px-2 py-1">{f.etiqueta}</td>
                      <td className="px-2 py-1 text-right">{f.cantidad}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">{fmtRD(f.total)}</td>
                      <td className="px-2 py-1 text-[11px] text-muted-foreground">{f.nota}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-amber-500/5">
                    <td className="px-2 py-1 font-medium text-amber-700 dark:text-amber-400">Pendientes de revisión</td>
                    <td className="px-2 py-1 text-right">{tot.revision.cantidad}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">{fmtRD(tot.revision.total)}</td>
                    <td />
                  </tr>
                  {[...tot.porMotivo].sort((a, b) => b[1].cantidad - a[1].cantidad).map(([motivo, b]) => (
                    <tr key={motivo} className="text-muted-foreground">
                      <td className="px-2 py-0.5 pl-6">{motivo}</td>
                      <td className="px-2 py-0.5 text-right">{b.cantidad}</td>
                      <td className="px-2 py-0.5 text-right whitespace-nowrap">{fmtRD(b.total)}</td>
                      <td />
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="px-2 py-1"><Ban className="mr-1 inline h-3.5 w-3.5" />Excluidos: esperan el TF que indiques</td>
                    <td className="px-2 py-1 text-right">{previa.plan.excluidos.length}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">{fmtRD(excluidosTotal)}</td>
                    <td className="px-2 py-1 text-[11px] text-muted-foreground">
                      {previa.plan.excluidos.map((x) => `${fmtLocalDate(x.movimiento.fecha)} → ${x.secuencias.join(", ")}`).join(" · ")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {tot.tf.length > 0 && (
              <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-[12px]">
                <span className="font-medium">Números TF que se usarían ({tot.tf.length}, en orden de fecha):</span>{" "}
                <span className="font-mono">{tot.tf[0]}{tot.tf.length > 1 ? ` … ${tot.tf[tot.tf.length - 1]}` : ""}</span>
                <span className="text-muted-foreground"> · los liberados de «Números TF sin uso» se usan primero.</span>
              </div>
            )}
            <div className="max-h-[38vh] space-y-3 overflow-auto">
              <TablasDetalle detalle={res?.detalle ?? []} movimientos={movimientos} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={() => confirmar.mutate()} disabled={!res || confirmar.isPending || calcular.isPending}>
            {confirmar.isPending ? "Aplicando…" : `Confirmar y ejecutar${res ? ` (${auto} automáticos, ${res.revision} a revisión)` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LoteFila = {
  id: string; creado_en: string; archivo: string | null; conciliados: number; creadas: number; revision: number;
  no_aplica: number; comisiones: number; total: number; deshecho_en: string | null; deshechos: number | null; tf_liberados: string[] | null;
};

/** Historial de conciliaciones automáticas con opción de deshacer cada lote completo. */
export function LotesAutomaticosDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<LoteFila | null>(null);
  const { data: lotes = [], isLoading } = useQuery({
    queryKey: ["banco-lotes-automaticos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("banco_lotes_automaticos")
        .select("id, creado_en, archivo, conciliados, creadas, revision, no_aplica, comisiones, total, deshecho_en, deshechos, tf_liberados")
        .order("creado_en", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as LoteFila[];
    },
  });
  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Conciliaciones automáticas</DialogTitle>
            <DialogDescription>
              Una por importación o ejecución sobre pendientes. Deshacer devuelve sus débitos a Pendiente, anula (sin borrar) las entradas
              creadas y pasa a «Números TF sin uso» los TF puestos a entradas que ya existían.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Origen</th>
                  <th className="px-2 py-1 text-right">Automáticos</th><th className="px-2 py-1 text-right">Revisión</th>
                  <th className="px-2 py-1 text-right">Total</th><th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Cargando…</td></tr>}
                {!isLoading && lotes.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Todavía no hay conciliaciones automáticas.</td></tr>}
                {lotes.map((l) => {
                  const auto = autoResueltos(l);
                  const partes = [l.creadas ? `${l.creadas} creadas` : "", l.no_aplica ? `${l.no_aplica} no aplica` : "", l.comisiones ? `${l.comisiones} comisiones` : ""].filter(Boolean);
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="px-2 py-1 whitespace-nowrap">{new Date(l.creado_en).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}</td>
                      <td className="px-2 py-1 truncate max-w-[200px]" title={l.archivo ?? ""}>{l.archivo ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{auto}{partes.length ? <span className="text-muted-foreground"> ({partes.join(", ")})</span> : null}</td>
                      <td className="px-2 py-1 text-right">{l.revision}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">{fmtRD(Number(l.total))}</td>
                      <td className="px-2 py-1 text-right">
                        {l.deshecho_en
                          ? <Badge variant="outline" className="text-[11px] font-normal" title={(l.tf_liberados ?? []).length ? `TF liberados: ${(l.tf_liberados ?? []).join(", ")}` : undefined}>
                              Deshecho ({l.deshechos ?? 0}){(l.tf_liberados ?? []).length ? ` · ${(l.tf_liberados ?? []).length} TF liberados` : ""}
                            </Badge>
                          : auto > 0
                            ? <Button size="sm" variant="ghost" onClick={() => setSel(l)}><Undo2 className="mr-1 h-3.5 w-3.5" /> Deshacer</Button>
                            : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter><Button onClick={onClose}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmarDeshacer lote={sel?.id ?? null} cantidad={sel ? autoResueltos(sel) : 0} onClose={() => setSel(null)} onDone={() => {}} />
    </>
  );
}
