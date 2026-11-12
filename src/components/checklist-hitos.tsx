import { useMemo, useState, useEffect, useRef } from "react";
import { useEditorExpediente } from "@/components/expediente-guardado";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Circle, MinusCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { daysFromToday } from "@/lib/dates";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { esHitoAutomatico, etiquetaHitoAutomatico, notaHitoAutomatico, PARCHE_EDICION_MANUAL, textoHitoAutomatico } from "@/lib/hitos-automaticos";
import { EnviarGestor } from "@/components/enviar-gestor";

type HitoRow = {
  id: string;
  expediente_id: string;
  hito_codigo: string;
  orden: number;
  estado: "pendiente" | "en_curso" | "completado" | "no_aplica";
  fecha_programada: string | null;
  fecha_cumplimiento: string | null;
  responsable_id: string | null;
  notas: string | null;
  auto_origen?: string | null;
  auto_fecha?: string | null;
  auto_correo_id?: string | null;
  auto_detalle?: unknown;
  auto_ref_id?: string | null;
  catalogo_hitos?: { nombre: string; orden: number; con_alerta: boolean; activo: boolean } | null;
};


type DeferredTextareaProps = {
  value: string | null;
  onSave: (v: string | null) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
};

function DeferredTextarea({ value, onSave, ...props }: DeferredTextareaProps) {
  const [local, setLocal] = useState(value ?? "");
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setLocal(value ?? "");
    }
  }, [value]);

  return (
    <Textarea
      {...props}
      value={local}
      onChange={(e) => { setLocal(e.target.value); onSave(e.target.value || null); }}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
      }}
    />
  );
}

type DeferredDateInputProps = {
  value: string | null;
  onSave: (v: string | null) => void;
  className?: string;
};

function DeferredDateInput({ value, onSave, className }: DeferredDateInputProps) {
  const [local, setLocal] = useState(value ?? "");
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setLocal(value ?? "");
    }
  }, [value]);

  return (
    <Input
      type="date"
      className={className}
      value={local}
      onChange={(e) => { setLocal(e.target.value); onSave(e.target.value || null); }}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
      }}
    />
  );
}

/** Etiqueta de fecha automática: al pasar el mouse muestra el evento que la originó (y enlaza al correo). */
function EtiquetaAutomatico({ h }: { h: HitoRow }) {
  const nota = notaHitoAutomatico(h);
  return (
    <HoverCard openDelay={150} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button type="button" className="inline-flex items-center gap-0.5 rounded border border-primary/30 bg-primary/5 px-1 py-px text-[11px] font-normal text-primary cursor-help">
          <Sparkles className="h-3 w-3" />{etiquetaHitoAutomatico(h)}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-3 text-[12px] space-y-1">
        <p className="font-medium">{textoHitoAutomatico(h)}</p>
        {h.auto_origen === "correo" && (h.auto_correo_id ? (
          <Link to="/expedientes/correo" search={{ registro: "", correo: h.auto_correo_id }} className="text-primary hover:underline">
            Ver el correo en el Registro de correos recibidos
          </Link>
        ) : (
          <p className="text-[11px] text-muted-foreground">Correo anterior al Registro de correos: es la hora en que llegó a la plataforma.</p>
        ))}
        {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
        <p className="text-[11px] text-muted-foreground">Puedes cambiar la fecha a mano.</p>
      </HoverCardContent>
    </HoverCard>
  );
}

function estadoBadge(e: HitoRow["estado"], atrasado: boolean, proximo: boolean) {
  if (e === "completado") return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" />Completado</Badge>;
  if (e === "no_aplica") return <Badge variant="outline" className="gap-1"><MinusCircle className="h-3 w-3" />No aplica</Badge>;
  if (atrasado) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Atrasado</Badge>;
  if (proximo) return <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1"><Clock className="h-3 w-3" />Próximo</Badge>;
  if (e === "en_curso") return <Badge className="bg-blue-600 hover:bg-blue-600 text-white gap-1"><Clock className="h-3 w-3" />En curso</Badge>;
  return <Badge variant="outline" className="gap-1"><Circle className="h-3 w-3" />Pendiente</Badge>;
}

export function ChecklistHitos({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();

  const { data: hitos, isLoading } = useQuery({
    queryKey: ["expediente-hitos", expedienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expediente_hitos")
        .select("*, catalogo_hitos(nombre, orden, con_alerta, activo)")
        .eq("expediente_id", expedienteId)
        .order("orden", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as HitoRow[];
      return rows.filter((h) => h.catalogo_hitos?.activo !== false);
    },
  });

  type HitoPatch = {
    estado?: HitoRow["estado"];
    fecha_programada?: string | null;
    fecha_cumplimiento?: string | null;
    notas?: string | null;
    responsable_id?: string | null;
    auto_origen?: string | null;
    auto_fecha?: string | null;
    auto_correo_id?: string | null;
    auto_solicitud_id?: string | null;
    auto_detalle?: null;
    auto_ref_id?: string | null;
  };

  const [borradores, setBorradores] = useState<Record<string, HitoPatch>>({});
  const editar = ({ id, patch }: { id: string; patch: HitoPatch }) =>
    setBorradores((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: HitoPatch }) => {
      const p: HitoPatch = { ...patch };
      // El estado se deriva de la fecha de ejecución: con fecha = Completado, sin fecha = Pendiente.
      if ("fecha_cumplimiento" in p) {
        p.estado = p.fecha_cumplimiento ? "completado" : "pendiente";
        // Fecha editada a mano: deja de ser automática y ningún correo o carga posterior la cambia.
        Object.assign(p, PARCHE_EDICION_MANUAL);
      }
      const { error } = await supabase.from("expediente_hitos").update(p).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expediente-hitos", expedienteId] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [guardando, setGuardando] = useState(false);
  useEditorExpediente(Object.keys(borradores).length > 0, guardando, async () => {
    setGuardando(true);
    try {
      for (const [id, patch] of Object.entries(borradores)) {
        await update.mutateAsync({ id, patch });
        setBorradores((prev) => { const next = { ...prev }; delete next[id]; return next; });
      }
    } finally { setGuardando(false); }
  });

  const { done, total, pct } = useMemo(() => {
    const t = hitos?.length ?? 0;
    const d = (hitos ?? []).filter((h) => {
      const b = borradores[h.id];
      const fecha = b && "fecha_cumplimiento" in b ? b.fecha_cumplimiento : h.fecha_cumplimiento;
      const estado = fecha ? "completado" : b && "fecha_cumplimiento" in b ? "pendiente" : h.estado;
      return estado === "completado" || estado === "no_aplica";
    }).length;
    return { done: d, total: t, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [hitos, borradores]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Checklist de Despacho
          </CardTitle>
          <Badge variant="outline" className="text-xs font-normal">
            {done} de {total} completados
          </Badge>
        </div>
        <div className="pt-2">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{pct}%</p>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (hitos?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Sin hitos configurados.</p>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky-table-header bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left">Hito</th>
                  <th className="px-2 py-2 text-left w-40">Fecha programada</th>
                  <th className="px-2 py-2 text-left w-44">Fecha de ejecución</th>
                  <th className="px-2 py-2 text-left">Notas</th>
                </tr>
              </thead>
              <tbody>
                {(hitos ?? []).map((original, i) => {
                  const h = { ...original, ...borradores[original.id] };
                  const fechaTocada = "fecha_cumplimiento" in (borradores[original.id] ?? {});
                  const estadoEfectivo: HitoRow["estado"] = h.fecha_cumplimiento
                    ? "completado"
                    : fechaTocada ? "pendiente" : h.estado;
                  const esCritico = h.catalogo_hitos?.con_alerta === true;
                  const activo = estadoEfectivo !== "completado" && estadoEfectivo !== "no_aplica";
                  const atrasado = !!(
                    activo &&
                    h.fecha_programada &&
                    (esCritico ? h.fecha_programada <= today : h.fecha_programada < today)
                  );
                  const proximo = !!(
                    activo &&
                    h.fecha_programada &&
                    !atrasado &&
                    daysFromToday(h.fecha_programada) <= 3
                  );
                  return (
                    <tr key={h.id} className={`border-t align-top ${esCritico && atrasado ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2 font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          {esCritico && (
                            <Badge className="bg-destructive hover:bg-destructive text-destructive-foreground gap-1 text-[10px] uppercase tracking-wide">
                              <AlertTriangle className="h-3 w-3" />Crítico
                            </Badge>
                          )}
                          <span>{h.catalogo_hitos?.nombre ?? h.hito_codigo}</span>
                        </div>
                        {esCritico && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Cargos por demora/almacenaje en puerto si no se completa en fecha.
                          </p>
                        )}
                        {h.hito_codigo === "expediente_enviado_gestor" && (
                          <EnviarGestor
                            expedienteId={expedienteId}
                            fechaManual={!!original.fecha_cumplimiento && !esHitoAutomatico(original)}
                            yaAutomatico={original.auto_origen === "gestor"}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <DeferredDateInput
                          className="h-8"
                          value={h.fecha_programada}
                          onSave={(v) => editar({ id: h.id, patch: { fecha_programada: v } })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <DeferredDateInput
                            className="h-8 flex-1"
                            value={h.fecha_cumplimiento}
                            onSave={(v) => editar({ id: h.id, patch: { fecha_cumplimiento: v } })}
                          />
                          {estadoBadge(estadoEfectivo, atrasado, proximo)}
                        </div>
                        {!fechaTocada && esHitoAutomatico(h) && <div className="mt-1"><EtiquetaAutomatico h={h} /></div>}
                      </td>
                      <td className="px-2 py-2">
                        <DeferredTextarea
                          rows={1}
                          className="min-h-8 text-sm"
                          value={h.notas}
                          onSave={(v) => editar({ id: h.id, patch: { notas: v } })}
                          placeholder="Observaciones…"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
