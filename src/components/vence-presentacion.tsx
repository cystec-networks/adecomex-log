import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlazosRegimen, plazoEfectivo, diasRegimen, venceEn, habilesRestantes, diasHabilesEntre } from "@/lib/plazo-presentacion";
import { estadoIndex } from "@/lib/estados-expediente";
import { parseLocalDate, fmtLocalDate } from "@/lib/dates";

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
    const presentado = parseLocalDate(exp?.fecha_presentado);
    if (isNaN(presentado.getTime())) return null;
    const tarde = presentado > vencimiento;
    const diferencia = Math.abs(diasHabilesEntre(presentado, vencimiento));
    const unidad = diferencia === 1 ? "día hábil" : "días hábiles";
    const detalle = tarde
      ? `con ${diferencia} ${unidad} de retraso`
      : presentado.getTime() === vencimiento.getTime()
        ? "el día del vencimiento"
        : `${diferencia} ${unidad} antes del vencimiento`;
    const texto = `Presentado: ${fmtLocalDate(exp.fecha_presentado)} (${detalle})`;
    return <>
      <span className="expediente-header-arrival-separator text-muted-foreground" aria-hidden="true">·</span>
      <span className={`flex min-w-0 items-center gap-1 text-xs md:text-sm ${tarde ? "text-warning" : "text-success"}`} title={`${texto}. Fecha registrada al pasar a Presentado.`}>
        <span className="min-w-0 truncate font-medium">Presentado: {fmtLocalDate(exp.fecha_presentado)} {tarde ? "⚠" : "✓"} ({detalle})</span>
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
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  // A Friday deadline is already overdue on Saturday, even with zero business days elapsed.
  const vencido = vencimiento < hoy;
  const tono = vencido ? "text-destructive" : r <= 2 ? "text-warning" : "text-foreground";
  const cantidad = Math.abs(r);
  const unidad = cantidad === 1 ? "día hábil" : "días hábiles";
  const txt = vencido ? `vencido hace ${cantidad} ${unidad}` : `${cantidad} ${unidad} restantes`;
  const fecha = vencimiento.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const contenido = `${vencido ? "Venció" : "Vence"} presentación: ${fecha}${vencido ? " ⚠" : ""} (${txt})`;

  return (<>
    <span className="expediente-header-arrival-separator text-muted-foreground" aria-hidden="true">·</span>
    <div className={`flex min-w-0 items-center gap-1 text-xs md:text-sm ${tono}`}
      title={`${esOverride ? "Plazo propio de este expediente" : "Plazo del régimen"}, contado desde la llegada real`}>
      <span className="min-w-0 truncate font-medium" title={typeof contenido === "string" ? contenido : undefined}>{contenido}{esOverride && <span className="ml-1 text-[11px] text-muted-foreground">(plazo propio)</span>}</span>
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
    </div>
    </>
  );
}
