import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlazosRegimen, plazoEfectivo, diasRegimen, venceEn, habilesRestantes } from "@/lib/plazo-presentacion";

export function VencePresentacion({ exp, canEdit }: { exp: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: plazos } = usePlazosRegimen();
  const { dias, esOverride } = plazoEfectivo(exp, plazos);
  const base = diasRegimen(exp?.regimen_aduanero, plazos);
  const llegada: string | null = exp?.fecha_llegada_real || exp?.fecha_compromiso || null;
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

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

  let contenido: React.ReactNode;
  let tono = "text-muted-foreground";
  if (!dias) {
    contenido = <span>Vence presentación: — <span className="italic">Configurar plazo para este régimen</span></span>;
  } else if (!llegada) {
    contenido = <span>Vence presentación: — (falta fecha de llegada/ETA · {dias} días hábiles)</span>;
  } else {
    const v = venceEn(llegada, dias);
    if (v) {
      const r = habilesRestantes(v);
      tono = r < 0 ? "text-destructive" : r <= 2 ? "text-warning" : "text-foreground";
      const txt = r < 0 ? `vencido hace ${-r} ${-r === 1 ? "día hábil" : "días hábiles"}` : `${r} ${r === 1 ? "día hábil" : "días hábiles"}`;
      contenido = `Vence presentación: ${v.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" })} (${txt})`;
    } else {
      contenido = "Vence presentación: — (falta fecha de llegada/ETA válida)";
    }
  }

  return (
    <div className={`flex min-w-0 items-center gap-1 text-xs md:text-sm ${tono}`}
      title={`${esOverride ? `Plazo propio de este expediente: ${dias}` : `Plazo del régimen: ${base ?? "sin configurar"}`} días hábiles desde la llegada/ETA`}>
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
  );
}
