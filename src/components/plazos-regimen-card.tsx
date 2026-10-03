import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PlazosRegimenCard() {
  const qc = useQueryClient();
  const { data: regs } = useQuery({
    queryKey: ["catalogo-regimenes-plazos"],
    queryFn: async () => (await supabase.from("catalogo_regimenes").select("id,codigo,nombre,tipo_operacion,dias_habiles_presentar").order("tipo_operacion").order("codigo")).data ?? [],
  });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setVals(Object.fromEntries((regs ?? []).map((r: any) => [r.id, r.dias_habiles_presentar?.toString() ?? ""])));
  }, [regs]);

  const guardar = async () => {
    const cambios = (regs ?? []).filter((r: any) => (r.dias_habiles_presentar?.toString() ?? "") !== (vals[r.id] ?? ""));
    for (const r of cambios as any[]) {
      const v = vals[r.id]?.trim();
      const n = v ? parseInt(v, 10) : null;
      if (v && (!n || n < 1)) return toast.error(`Valor inválido para ${r.nombre}`);
    }
    setSaving(true);
    for (const r of cambios as any[]) {
      const v = vals[r.id]?.trim();
      const { error } = await supabase.from("catalogo_regimenes").update({ dias_habiles_presentar: v ? parseInt(v, 10) : null }).eq("id", r.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["catalogo-regimenes-plazos"] });
    qc.invalidateQueries({ queryKey: ["plazos-regimen"] });
    toast.success(cambios.length ? `${cambios.length} plazo(s) actualizado(s)` : "Sin cambios");
  };

  const grupos = ["Importación", "Exportación"].map((t) => ({
    t, filas: (regs ?? []).filter((r: any) => (r.tipo_operacion ?? "").toLowerCase().startsWith(t.slice(0, 6).toLowerCase())),
  }));
  const otros = (regs ?? []).filter((r: any) => !grupos.some((g) => g.filas.includes(r)));
  if (otros.length) grupos.push({ t: "Otros", filas: otros });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Cantidad de Días Hábiles para Presentar</CardTitle>
        <CardDescription>
          Días hábiles desde la llegada/ETA para presentar la declaración, por Régimen Aduanero. Si un régimen queda vacío, el expediente mostrará «Configurar plazo para este régimen».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {grupos.filter((g) => g.filas.length).map((g) => (
          <div key={g.t}>
            <h4 className="mb-1 text-sm font-semibold">{g.t}</h4>
            <div className="divide-y rounded-md border">
              {g.filas.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{r.codigo}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.nombre}>{r.nombre}</span>
                  <Input type="number" min={1} className="h-8 w-24" aria-label={`Días hábiles para ${r.nombre}`}
                    value={vals[r.id] ?? ""} onChange={(e) => setVals({ ...vals, [r.id]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button onClick={guardar} disabled={saving}><Save className="mr-1 h-4 w-4" /> Guardar plazos</Button>
      </CardContent>
    </Card>
  );
}
