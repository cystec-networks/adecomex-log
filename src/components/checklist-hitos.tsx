import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Circle, MinusCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { daysFromToday } from "@/lib/dates";

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
  catalogo_hitos?: { nombre: string; orden: number; con_alerta: boolean; activo: boolean } | null;
};

const ESTADOS = [
  { v: "pendiente", label: "Pendiente" },
  { v: "en_curso", label: "En curso" },
  { v: "completado", label: "Completado" },
  { v: "no_aplica", label: "No aplica" },
] as const;

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
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        onSave(local || null);
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
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        onSave(local || null);
      }}
    />
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
  };

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: HitoPatch }) => {
      const p: HitoPatch = { ...patch };
      if (p.estado === "completado" && !p.fecha_cumplimiento) {
        p.fecha_cumplimiento = new Date().toISOString().slice(0, 10);
      }
      if (p.estado && p.estado !== "completado") {
        p.fecha_cumplimiento = null;
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

  const { done, total, pct } = useMemo(() => {
    const t = hitos?.length ?? 0;
    const d = (hitos ?? []).filter((h) => h.estado === "completado" || h.estado === "no_aplica").length;
    return { done: d, total: t, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [hitos]);

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left">Hito</th>
                  <th className="px-2 py-2 text-left w-40">Fecha programada</th>
                  <th className="px-2 py-2 text-left w-40">Estado</th>
                  <th className="px-2 py-2 text-left w-40">Fecha cumplida</th>
                  <th className="px-2 py-2 text-left">Notas</th>
                </tr>
              </thead>
              <tbody>
                {(hitos ?? []).map((h, i) => {
                  const esCritico = h.catalogo_hitos?.con_alerta === true;
                  const activo = h.estado !== "completado" && h.estado !== "no_aplica";
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
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="date"
                          className="h-8"
                          value={h.fecha_programada ?? ""}
                          onChange={(e) => update.mutate({ id: h.id, patch: { fecha_programada: e.target.value || null } })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1.5">
                          <Select value={h.estado} onValueChange={(v) => update.mutate({ id: h.id, patch: { estado: v as HitoRow["estado"] } })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ESTADOS.map((e) => <SelectItem key={e.v} value={e.v}>{e.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {estadoBadge(h.estado, atrasado, proximo)}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="date"
                          className="h-8"
                          value={h.fecha_cumplimiento ?? ""}
                          onChange={(e) => update.mutate({ id: h.id, patch: { fecha_cumplimiento: e.target.value || null } })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Textarea
                          rows={1}
                          className="min-h-8 text-sm"
                          value={h.notas ?? ""}
                          onChange={(e) => update.mutate({ id: h.id, patch: { notas: e.target.value || null } })}
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
