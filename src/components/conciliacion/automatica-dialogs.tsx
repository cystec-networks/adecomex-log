import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtLocalDate } from "@/lib/dates";
import { fmtRD, useInvalidarConciliacion } from "./datos";

export type DetalleAutomatico = {
  movimiento_id: string;
  accion: "conciliar" | "crear" | "revision";
  secuencia?: string;
  tf_asignado?: boolean;
  beneficiario?: string;
  categoria?: string;
  motivo?: string;
};

export type ResultadoAutomatico = {
  lote: string;
  conciliados: number;
  creadas: number;
  revision: number;
  total: number;
  detalle: DetalleAutomatico[];
  creditos: number;
  archivo: string;
};

type MovMin = { id: string; fecha: string; monto: number; descripcion: string | null };

function useDeshacerLote(onDone: () => void) {
  const invalidar = useInvalidarConciliacion();
  return useMutation({
    mutationFn: async (lote: string) => {
      const { data, error } = await supabase.rpc("deshacer_lote_automatico", { p_lote: lote });
      if (error) throw error;
      return data as { deshechos: number; anuladas: number };
    },
    onSuccess: (r) => {
      toast.success(`${r.deshechos} débitos vuelven a Pendiente${r.anuladas ? ` · ${r.anuladas} entradas creadas quedaron «Anulada»` : ""}`);
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
            Los {cantidad} débitos conciliados en este lote vuelven a Pendiente. Las entradas creadas desde el banco quedan
            «Anulada» en la secuencia TF (no se borran). Los TF puestos a entradas que ya existían se conservan.
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

/** Resumen al terminar una importación: «X conciliados automáticamente, Y requieren tu revisión». */
export function ResultadoAutomaticoDialog({ resultado, movimientos, onClose, onVerRevision }: {
  resultado: ResultadoAutomatico | null;
  movimientos: Map<string, MovMin>;
  onClose: () => void;
  onVerRevision: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const auto = resultado ? resultado.conciliados + resultado.creadas : 0;
  const filas = (resultado?.detalle ?? []).map((d) => ({ d, m: movimientos.get(d.movimiento_id) }));
  const autoFilas = filas.filter((x) => x.d.accion !== "revision");
  const revFilas = filas.filter((x) => x.d.accion === "revision");
  return (
    <>
      <Dialog open={!!resultado} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{auto} conciliados automáticamente, {resultado?.revision ?? 0} requieren tu revisión</DialogTitle>
            <DialogDescription>
              {resultado?.archivo} · {resultado?.conciliados ?? 0} con su entrada del Diario y {resultado?.creadas ?? 0} con entrada nueva creada desde el banco.
              {resultado && resultado.creditos > 0 ? ` ${resultado.creditos} créditos importados quedan fuera (solo se concilian débitos).` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-auto">
            {autoFilas.length > 0 && (
              <div className="rounded-md border">
                <div className="flex items-center gap-1 border-b bg-muted px-2 py-1 text-[12px] font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Conciliados automáticamente
                </div>
                <table className="w-full text-[12px]">
                  <tbody>
                    {autoFilas.map(({ d, m }) => (
                      <tr key={d.movimiento_id} className="border-t first:border-t-0">
                        <td className="px-2 py-1 whitespace-nowrap">{m ? fmtLocalDate(m.fecha) : "—"}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">{m ? fmtRD(m.monto) : "—"}</td>
                        <td className="px-2 py-1 min-w-0 truncate max-w-[220px]" title={d.beneficiario}>{d.beneficiario}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <span className="font-mono">{d.secuencia}</span>{" "}
                          {d.accion === "crear"
                            ? <Badge variant="outline" className="text-[11px] font-normal">Entrada creada{d.categoria ? ` · ${d.categoria}` : ""}</Badge>
                            : d.tf_asignado ? <Badge variant="outline" className="text-[11px] font-normal">TF asignado</Badge> : null}
                        </td>
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
                    {revFilas.map(({ d, m }) => (
                      <tr key={d.movimiento_id} className="border-t first:border-t-0">
                        <td className="px-2 py-1 whitespace-nowrap">{m ? fmtLocalDate(m.fecha) : "—"}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">{m ? fmtRD(m.monto) : "—"}</td>
                        <td className="px-2 py-1 min-w-0 truncate max-w-[240px]" title={m?.descripcion ?? ""}>{m?.descripcion ?? "—"}</td>
                        <td className="px-2 py-1 text-amber-700 dark:text-amber-400">{d.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filas.length === 0 && <div className="text-[13px] text-muted-foreground">No había débitos nuevos que conciliar.</div>}
          </div>
          <DialogFooter className="gap-2">
            {auto > 0 && (
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

type LoteFila = {
  id: string; creado_en: string; archivo: string | null; conciliados: number; creadas: number; revision: number;
  total: number; deshecho_en: string | null; deshechos: number | null;
};

/** Historial de conciliaciones automáticas con opción de deshacer cada lote completo. */
export function LotesAutomaticosDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<LoteFila | null>(null);
  const { data: lotes = [], isLoading } = useQuery({
    queryKey: ["banco-lotes-automaticos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("banco_lotes_automaticos")
        .select("id, creado_en, archivo, conciliados, creadas, revision, total, deshecho_en, deshechos")
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
            <DialogDescription>Una por importación. Deshacer devuelve sus débitos a Pendiente y anula (sin borrar) las entradas creadas.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Archivo</th>
                  <th className="px-2 py-1 text-right">Automáticos</th><th className="px-2 py-1 text-right">Revisión</th>
                  <th className="px-2 py-1 text-right">Total</th><th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Cargando…</td></tr>}
                {!isLoading && lotes.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Todavía no hay conciliaciones automáticas.</td></tr>}
                {lotes.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-2 py-1 whitespace-nowrap">{new Date(l.creado_en).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}</td>
                    <td className="px-2 py-1 truncate max-w-[180px]" title={l.archivo ?? ""}>{l.archivo ?? "—"}</td>
                    <td className="px-2 py-1 text-right">{l.conciliados + l.creadas}{l.creadas ? <span className="text-muted-foreground"> ({l.creadas} creadas)</span> : null}</td>
                    <td className="px-2 py-1 text-right">{l.revision}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">{fmtRD(Number(l.total))}</td>
                    <td className="px-2 py-1 text-right">
                      {l.deshecho_en
                        ? <Badge variant="outline" className="text-[11px] font-normal">Deshecho ({l.deshechos ?? 0})</Badge>
                        : l.conciliados + l.creadas > 0
                          ? <Button size="sm" variant="ghost" onClick={() => setSel(l)}><Undo2 className="mr-1 h-3.5 w-3.5" /> Deshacer</Button>
                          : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter><Button onClick={onClose}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmarDeshacer lote={sel?.id ?? null} cantidad={sel ? sel.conciliados + sel.creadas : 0} onClose={() => setSel(null)} onDone={() => {}} />
    </>
  );
}
