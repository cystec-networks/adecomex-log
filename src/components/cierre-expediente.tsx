import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, CircleSlash, Lock, RotateCcw, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtLocalDate } from "@/lib/dates";
import { useMyRoles } from "@/lib/auth-hooks";
import { cn } from "@/lib/utils";
import {
  evaluarCierre, lineaTiempoCierre, puedeCompletar, puedeReabrir, snapshotCierre,
  type EvaluacionCierre, type HechosCierre, type LineaTiempoCierre, type RequisitoCierre,
} from "@/lib/expediente-cierre";

/** Lee los hechos de cierre bajo RLS del usuario. */
export async function leerHechosCierre(ids: string[]): Promise<Record<string, HechosCierre>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc("hechos_cierre_expedientes", { p_ids: ids });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: any) => [r.expediente_id, r.hechos as HechosCierre]));
}

export const useHechosCierre = (id: string | undefined, habilitado: boolean) =>
  useQuery({
    queryKey: ["cierre-hechos", id],
    enabled: !!id && habilitado,
    queryFn: async () => (await leerHechosCierre([id!]))[id!] ?? null,
  });

const IconoEstado = ({ estado }: { estado: RequisitoCierre["estado"] }) =>
  estado === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" aria-label="Cumple" />
  : estado === "na" ? <CircleSlash className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="No aplica" />
  : <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-label="Falta" />;

export function LineaTiempoCierreVista({ linea }: { linea: LineaTiempoCierre }) {
  const dia = (n: number | null) => (n == null ? "sin dato" : `${n} día${n === 1 ? "" : "s"}`);
  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4 lg:grid-cols-7">
        {linea.hitos.map((h) => (
          <li key={h.clave} className="min-w-0">
            <div className="text-[11px] text-muted-foreground">{h.titulo}</div>
            <div className={cn("font-medium", !h.fecha && "text-muted-foreground")}>{h.fecha ? fmtLocalDate(h.fecha) : "sin dato"}</div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        <span>Llegada → despacho: <b>{dia(linea.dias.llegada_despacho)}</b></span>
        <span>Despacho → entrega: <b>{dia(linea.dias.despacho_entrega)}</b></span>
        <span>Almacenaje: <b>{dia(linea.dias.almacenaje)}</b></span>
      </div>
    </div>
  );
}

function ListaRequisitos({ ev, onIrFicha }: { ev: EvaluacionCierre; onIrFicha?: (ficha: string) => void }) {
  return (
    <ul className="grid gap-1 md:grid-cols-2">
      {ev.requisitos.map((r) => (
        <li key={r.clave} className="flex min-w-0 items-start gap-2 text-[13px]">
          <IconoEstado estado={r.estado} />
          <div className="min-w-0">
            <div className="font-medium">{r.titulo}</div>
            <div className={cn("break-words text-[12px]", r.estado === "falta" ? "text-destructive" : "text-muted-foreground")}>
              {r.detalle}
              {r.estado === "falta" && onIrFicha && (
                <button type="button" className="ml-1 underline underline-offset-2" onClick={() => onIrFicha(r.ficha)}>Ir a la pestaña</button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

type ExpCierre = { id: string; numero?: string | null; estado: string; fecha_cierre?: string | null; cierre_snapshot?: any };

/** Panel «Requisitos de cierre»: visible desde Facturado y en Completado. */
export function RequisitosCierrePanel({ exp, onIrFicha }: { exp: ExpCierre; onIrFicha?: (ficha: string) => void }) {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const visible = exp.estado === "facturar" || exp.estado === "completado";
  const { data: hechos, isLoading } = useHechosCierre(exp.id, visible);
  const [abierto, setAbierto] = useState(false);
  const [dialogo, setDialogo] = useState<null | "completar" | "reabrir">(null);
  const [motivo, setMotivo] = useState("");

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["expediente", exp.id] });
    qc.invalidateQueries({ queryKey: ["cierre-hechos", exp.id] });
    qc.invalidateQueries({ queryKey: ["expedientes"] });
  };
  const completar = useMutation({
    mutationFn: async () => {
      if (!hechos) throw new Error("Aún no se cargaron los requisitos");
      const { error } = await supabase.rpc("completar_expediente", {
        p_id: exp.id, p_motivo: motivo.trim() || undefined, p_snapshot: snapshotCierre(hechos) as any,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Expediente ${exp.numero ?? ""} marcado como Completado`); setDialogo(null); setMotivo(""); invalidar(); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo completar"),
  });
  const reabrir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("reabrir_expediente", { p_id: exp.id, p_motivo: motivo.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Expediente reabierto: vuelve a Facturado"); setDialogo(null); setMotivo(""); invalidar(); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo reabrir"),
  });

  if (!visible) return null;
  const ev = hechos ? evaluarCierre(hechos) : null;
  const completado = exp.estado === "completado";
  const snap = exp.cierre_snapshot ?? null;
  const linea: LineaTiempoCierre | null = completado
    ? (snap?.linea_tiempo ?? null)
    : hechos ? lineaTiempoCierre(hechos.fechas ?? {}) : null;
  const cumplen = ev ? ev.requisitos.filter((r) => r.estado !== "falta").length : 0;
  const permiteCompletar = puedeCompletar(roles);
  const permiteReabrir = puedeReabrir(roles);
  const pendientesSnap: string[] = Array.isArray(snap?.pendientes) ? snap.pendientes : [];

  return (
    <section aria-label="Requisitos de cierre" className={cn("mb-3 rounded-md border px-3 py-2", completado ? "border-[var(--success)]/40 bg-[var(--success)]/5" : ev?.listo ? "border-[var(--success)]/40" : "border-border")}>
      <Collapsible open={abierto} onOpenChange={setAbierto}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="group -mx-1 h-auto min-w-0 justify-start px-1 py-1 text-[13px] font-semibold">
              <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-0" />
              {completado ? "Expediente completado" : "Requisitos de cierre"}
            </Button>
          </CollapsibleTrigger>
          {completado ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-[12px]">
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>Completado el {fmtLocalDate(exp.fecha_cierre)} · datos importantes bloqueados (se pueden agregar documentos y notas)</span>
            </span>
          ) : isLoading || !ev ? (
            <span className="text-[12px] text-muted-foreground">Revisando requisitos…</span>
          ) : ev.listo ? (
            <span className="text-[12px] font-medium text-[var(--success)]">Listo para completar · {cumplen}/{ev.requisitos.length}</span>
          ) : (
            <span className="text-[12px] text-destructive">{ev.pendientes.length} pendiente(s) · {cumplen}/{ev.requisitos.length} cumplen</span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {!completado && permiteCompletar && ev && (
              <Button size="sm" className="h-7" variant={ev.listo ? "default" : "outline"} onClick={() => { setMotivo(""); setDialogo("completar"); }}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Marcar Completado
              </Button>
            )}
            {completado && permiteReabrir && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => { setMotivo(""); setDialogo("reabrir"); }}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />Reabrir
              </Button>
            )}
          </div>
        </div>
        <CollapsibleContent className="space-y-3 pt-2">
          {completado ? (
            <>
              {snap?.motivo && <p className="text-[12px]"><b>Motivo del cierre con pendientes:</b> {snap.motivo}</p>}
              {pendientesSnap.length > 0 && <p className="text-[12px] text-muted-foreground">Pendientes aceptados: {pendientesSnap.join("; ")}</p>}
              {snap?.lote_id && <p className="text-[12px] text-muted-foreground">Completado en el lote histórico ({snap.hitos_no_aplica ?? 0} paso(s) del Checklist pasaron a «No aplica»).</p>}
            </>
          ) : ev && (
            <>
              <ListaRequisitos ev={ev} onIrFicha={onIrFicha} />
              {ev.avisos.length > 0 && (
                <ul className="space-y-0.5 text-[12px] text-muted-foreground">
                  {ev.avisos.map((a) => <li key={a} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</li>)}
                </ul>
              )}
            </>
          )}
          {linea ? <LineaTiempoCierreVista linea={linea} /> : completado && <p className="text-[12px] text-muted-foreground">Sin línea de tiempo guardada.</p>}
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={dialogo === "completar"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Marcar Expediente {exp.numero} como Completado</DialogTitle>
            <DialogDescription>
              {ev?.listo ? "Cumple todos los requisitos de cierre." : "Tiene pendientes. Para completarlo igual escribe el motivo; quedará en Auditoría."}
            </DialogDescription>
          </DialogHeader>
          {ev && !ev.listo && (
            <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-destructive">
              {ev.pendientes.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {ev && ev.avisos.length > 0 && (
            <ul className="space-y-0.5 text-[12px] text-muted-foreground">
              {ev.avisos.map((a) => <li key={a} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</li>)}
            </ul>
          )}
          <p className="text-[12px] text-muted-foreground">Después de completar, la DUA, el N.º de despacho, la Liquidación SIGA, los montos y las fechas quedan bloqueados. Solo el Administrador puede reabrirlo.</p>
          {ev && !ev.listo && (
            <label className="block space-y-1">
              <span className="text-[13px] font-medium">Motivo (obligatorio)</span>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: cobro registrado fuera del sistema" />
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button disabled={completar.isPending || (!!ev && !ev.listo && !motivo.trim())} onClick={() => completar.mutate()}>
              {completar.isPending ? "Completando…" : "Marcar Completado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "reabrir"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reabrir Expediente {exp.numero}</DialogTitle>
            <DialogDescription>Vuelve a Facturado y se desbloquean sus datos. El motivo queda en Auditoría.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium">Motivo (obligatorio)</span>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button disabled={reabrir.isPending || !motivo.trim()} onClick={() => reabrir.mutate()}>{reabrir.isPending ? "Reabriendo…" : "Reabrir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type FilaLote = { id: string; numero: string; cliente: string; hechos: HechosCierre; ev: EvaluacionCierre };

/** Lote histórico: vista previa de los Facturados, desmarcar filas, confirmar y deshacer. */
export function CierreLoteBoton({ className }: { className?: string }) {
  const { data: roles } = useMyRoles();
  const [abierto, setAbierto] = useState(false);
  if (!puedeCompletar(roles)) return null;
  return (
    <>
      <Button size="sm" variant="outline" className={className} onClick={() => setAbierto(true)} title="Completar Expedientes Facturados en lote, con vista previa">
        <CheckCircle2 className="mr-1 h-4 w-4" />Completar en lote
      </Button>
      {abierto && <CierreLoteDialog onClose={() => setAbierto(false)} esAdmin={puedeReabrir(roles)} />}
    </>
  );
}

function CierreLoteDialog({ onClose, esAdmin }: { onClose: () => void; esAdmin: boolean }) {
  const qc = useQueryClient();
  const [seleccion, setSeleccion] = useState<Record<string, boolean> | null>(null);
  const [verBloqueados, setVerBloqueados] = useState(false);

  const preview = useQuery({
    queryKey: ["cierre-lote-preview"],
    queryFn: async (): Promise<FilaLote[]> => {
      const { data, error } = await supabase.from("expedientes")
        .select("id, numero, clientes(nombre)").eq("estado", "facturar").is("eliminado_en", null).order("numero");
      if (error) throw error;
      const hechos = await leerHechosCierre((data ?? []).map((e) => e.id));
      return (data ?? []).filter((e) => hechos[e.id]).map((e: any) => ({
        id: e.id, numero: e.numero, cliente: e.clientes?.nombre ?? "—", hechos: hechos[e.id],
        ev: evaluarCierre(hechos[e.id], { omitirChecklist: true }),
      }));
    },
  });
  const lotes = useQuery({
    queryKey: ["cierre-lotes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expediente_cierre_lotes")
        .select("id, created_at, cantidad, hitos_no_aplica, deshecho_en").order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filas = preview.data ?? [];
  const cerrables = filas.filter((f) => f.ev.listo);
  const bloqueados = filas.filter((f) => !f.ev.listo);
  const sel = seleccion ?? Object.fromEntries(cerrables.map((f) => [f.id, true]));
  const elegidos = cerrables.filter((f) => sel[f.id]);
  const hitosElegidos = elegidos.reduce((n, f) => n + f.hechos.hitos_pendientes.length, 0);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["cierre-lote-preview"] });
    qc.invalidateQueries({ queryKey: ["cierre-lotes"] });
    qc.invalidateQueries({ queryKey: ["expedientes"] });
  };
  const aplicar = useMutation({
    mutationFn: async () => {
      const items = elegidos.map((f) => ({ expediente_id: f.id, snapshot: snapshotCierre(f.hechos) }));
      const { data, error } = await supabase.rpc("aplicar_lote_cierre", { p_items: items as any });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success(`${elegidos.length} Expediente(s) marcados como Completado. Puedes deshacer el lote.`); setSeleccion(null); invalidar(); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo aplicar el lote"),
  });
  const deshacer = useMutation({
    mutationFn: async (lote: string) => {
      const { data, error } = await supabase.rpc("deshacer_lote_cierre", { p_lote: lote });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Lote deshecho: ${n} Expediente(s) vuelven a Facturado`); invalidar(); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo deshacer"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Completar Facturados en lote</DialogTitle>
          <DialogDescription>
            Vista previa sin guardar. En cada Expediente marcado, los pasos pendientes del Checklist pasan a «No aplica» y queda como Completado. Nada se aplica hasta que confirmes, y el lote completo se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {preview.isLoading ? <p className="text-[13px] text-muted-foreground">Revisando Expedientes Facturados…</p> : preview.isError ? (
          <p className="text-[13px] text-destructive">No se pudo cargar la vista previa.</p>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            <p className="text-[13px]">
              {filas.length} en Facturado · <b>{cerrables.length} se pueden completar</b> · {bloqueados.length} con pendientes.
              {" "}Seleccionados: <b>{elegidos.length}</b> ({hitosElegidos} paso(s) del Checklist a «No aplica»).
            </p>
            {cerrables.length > 0 && (
              <div className="flex gap-2 text-[12px]">
                <button type="button" className="underline" onClick={() => setSeleccion(Object.fromEntries(cerrables.map((f) => [f.id, true])))}>Marcar todos</button>
                <button type="button" className="underline" onClick={() => setSeleccion({})}>Desmarcar todos</button>
              </div>
            )}
            <ul className="divide-y rounded-md border">
              {cerrables.map((f) => (
                <li key={f.id} className="flex min-w-0 items-start gap-2 px-2 py-1.5 text-[13px]">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" aria-label={`Completar ${f.numero}`}
                    checked={!!sel[f.id]} onChange={(e) => setSeleccion({ ...sel, [f.id]: e.target.checked })} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-x-2"><span className="expediente-numero font-semibold">{f.numero}</span><span className="truncate text-muted-foreground" title={f.cliente}>{f.cliente}</span></div>
                    <div className="text-[12px] text-muted-foreground">
                      {f.hechos.hitos_pendientes.length
                        ? `A «No aplica»: ${f.hechos.hitos_pendientes.map((h) => h.nombre).join(", ")}`
                        : "Checklist ya completo"}
                      {f.ev.avisos.length > 0 && <span> · {f.ev.avisos.length} aviso(s): {f.ev.avisos.join(" ")}</span>}
                    </div>
                  </div>
                </li>
              ))}
              {cerrables.length === 0 && <li className="px-2 py-2 text-[13px] text-muted-foreground">Ningún Expediente Facturado cumple los requisitos.</li>}
            </ul>
            {bloqueados.length > 0 && (
              <Collapsible open={verBloqueados} onOpenChange={setVerBloqueados}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="group -mx-1 h-auto px-1 py-1 text-[13px] font-semibold">
                    <ChevronDown className="h-4 w-4 -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
                    No se pueden completar ({bloqueados.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="divide-y rounded-md border">
                    {bloqueados.map((f) => (
                      <li key={f.id} className="px-2 py-1.5 text-[13px]">
                        <div className="flex flex-wrap gap-x-2"><span className="expediente-numero font-semibold">{f.numero}</span><span className="truncate text-muted-foreground" title={f.cliente}>{f.cliente}</span></div>
                        <div className="text-[12px] text-destructive">{f.ev.pendientes.join("; ")}</div>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
            {(lotes.data ?? []).length > 0 && (
              <div className="space-y-1">
                <div className="text-[13px] font-semibold">Lotes recientes</div>
                <ul className="divide-y rounded-md border">
                  {(lotes.data ?? []).map((l: any) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-[12px]">
                      <span>{new Date(l.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}</span>
                      <span>· {l.cantidad} Expediente(s), {l.hitos_no_aplica} paso(s) a «No aplica»</span>
                      {l.deshecho_en ? <span className="text-muted-foreground">· Deshecho</span> : esAdmin ? (
                        <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-[12px]" disabled={deshacer.isPending}
                          onClick={() => { if (confirm("¿Deshacer este lote? Los Expedientes vuelven a Facturado y su Checklist a como estaba.")) deshacer.mutate(l.id); }}>
                          <RotateCcw className="mr-1 h-3 w-3" />Deshacer lote
                        </Button>
                      ) : <span className="ml-auto text-muted-foreground">Solo el Administrador puede deshacerlo</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button disabled={aplicar.isPending || elegidos.length === 0}
            onClick={() => { if (confirm(`¿Completar ${elegidos.length} Expediente(s) y pasar ${hitosElegidos} paso(s) del Checklist a «No aplica»?`)) aplicar.mutate(); }}>
            {aplicar.isPending ? "Aplicando…" : `Completar ${elegidos.length} seleccionado(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
