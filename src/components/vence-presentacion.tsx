import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, CalendarDays, Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlazosRegimen, plazoEfectivo, diasRegimen, venceEn, habilesRestantes, diasHabilesEntre } from "@/lib/plazo-presentacion";
import { estadoIndex } from "@/lib/estados-expediente";
import { parseLocalDate, fmtLocalDate, hoyRD } from "@/lib/dates";

/** Píldora compacta alineada con el tratamiento visual del badge de Estado del encabezado. */
const pill = (tono: string) =>
  `expediente-presentation-pill inline-grid h-7 items-center whitespace-nowrap rounded-md border px-2 text-xs font-medium ${tono}`;
const TONO_NEUTRO = "border-border bg-muted/50 text-foreground";
const TONO_ALERTA = "border-warning/40 bg-warning/10 text-warning";
const TONO_ERROR = "border-destructive/40 bg-destructive/10 text-destructive";
const TONO_OK = "border-success/40 bg-success/10 text-success";

export function VencePresentacion({ exp, canEdit }: { exp: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: plazos } = usePlazosRegimen();
  const { dias, esOverride } = plazoEfectivo(exp, plazos);
  const base = diasRegimen(exp?.regimen_aduanero, plazos);
  const llegada: string | null = exp?.fecha_llegada_real || null;
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  // Never infer a legal deadline from an estimate or an unconfigured regime.
  const vencimiento = llegada && dias && base ? venceEn(llegada, dias) : null;
  if (!vencimiento) return null;

  // Use the shared state ordering, including every stage after verification.
  const etapaPosterior = estadoIndex(exp?.estado) >= estadoIndex("verificar");
  if (etapaPosterior) {
    const presentado = parseLocalDate(exp?.fecha_presentacion_real);
    if (isNaN(presentado.getTime())) return null;
    const tarde = presentado > vencimiento;
    const diferencia = Math.abs(diasHabilesEntre(presentado, vencimiento));
    const unidad = diferencia === 1 ? "día hábil" : "días hábiles";
    const detalle = tarde
      ? `con ${diferencia} ${unidad} de retraso`
      : presentado.getTime() === vencimiento.getTime()
        ? "el día del vencimiento"
        : `${diferencia} ${unidad} antes del vencimiento`;
    const fecha = fmtLocalDate(exp.fecha_presentacion_real);
    const compacto = `Presentado: ${fecha} ${tarde ? "⚠" : "✓"} (${diferencia === 0 ? "0d" : `${tarde ? "+" : "-"}${diferencia}d`})`;
    const completo = `Presentado: ${fecha} (${detalle}). Fecha real de presentación capturada en Información General.`;
    return <>
      <span className="expediente-header-arrival-separator text-muted-foreground" aria-hidden="true">·</span>
      <span className={pill(tarde ? TONO_ALERTA : TONO_OK)} title={completo} aria-label={completo}>
        <span className="expediente-presentation-content">
          <span className="expediente-presentation-full">{compacto}</span>
          <span className="expediente-presentation-short">{tarde ? <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}{fecha}</span>
        </span>
      </span>
    </>;
  }

  const guardar = async (nuevo: number | null) => {
    setSaving(true);
    const { error } = await supabase.from("expedientes").update({ plazo_presentar_override: nuevo }).eq("id", exp.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(nuevo ? `Plazo de este expediente: ${nuevo} días hábiles` : "Se usa el plazo del régimen");
    qc.invalidateQueries({ queryKey: ["expediente", exp.id] });
    qc.invalidateQueries({ queryKey: ["expedientes"] });
    setOpen(false);
  };

  const r = habilesRestantes(vencimiento);
  const hoy = hoyRD();
  // A Friday deadline is already overdue on Saturday, even with zero business days elapsed.
  const vencido = vencimiento < hoy;
  const cantidad = Math.abs(r);
  const unidad = cantidad === 1 ? "día hábil" : "días hábiles";
  const detalle = vencido ? `vencido hace ${cantidad} ${unidad}` : `${cantidad} ${unidad} ${cantidad === 1 ? "restante" : "restantes"}`;
  const fecha = vencimiento.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const completo = `${vencido ? "Venció" : "Vence"} presentación: ${fecha}${vencido ? " ⚠" : ""} (${detalle}).`
    + ` ${esOverride ? "Plazo propio de este expediente" : "Plazo del régimen"}, contado desde la llegada real.`;
  const compacto = vencido ? `Venció: ${fecha} ⚠ (hace ${cantidad}d)` : `Vence: ${fecha} (${cantidad}d háb.)`;
  const tono = vencido ? TONO_ERROR : r <= 2 ? TONO_ALERTA : TONO_NEUTRO;

  return (<>
    <span className="expediente-header-arrival-separator text-muted-foreground" aria-hidden="true">·</span>
    <span className={pill(tono)} title={completo} aria-label={completo}>
      <span className="expediente-presentation-content">
        <span className="expediente-presentation-full">{compacto}</span>
        <span className="expediente-presentation-short">{vencido ? <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}{fecha}</span>
      </span>
    </span>
    {canEdit && exp?.id && (
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(exp.plazo_presentar_override ? String(exp.plazo_presentar_override) : ""); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Editar plazo de presentación" title="Editar plazo de presentación">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        {open && <PopoverContent align="end" side="bottom" sideOffset={8} className="w-[min(20rem,calc(100vw-2rem))] space-y-2" aria-label="Editar plazo de presentación">
          <Label htmlFor="plazo-ov">Plazo propio (días hábiles)</Label>
          <p className="text-[11px] text-muted-foreground">Solo para este expediente (prórroga o excepción). Régimen: {base ?? "sin configurar"} días.</p>
          <Input id="plazo-ov" type="number" min={1} value={val} onChange={(e) => setVal(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => { const v = parseInt(val, 10); if (!v || v < 1) return toast.error("Escribe un número de días mayor que 0"); guardar(v); }}>Guardar</Button>
            {exp.plazo_presentar_override && <Button size="sm" variant="outline" disabled={saving} onClick={() => guardar(null)}>Usar plazo del régimen</Button>}
          </div>
        </PopoverContent>}
      </Popover>
    )}
    </>
  );
}
