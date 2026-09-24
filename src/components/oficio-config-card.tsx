import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OFICIO_CONFIG_KEY, fetchOficioConfig, OFICIO_CONFIG_DEFAULT, type OficioConfig } from "@/lib/oficios";

const CAMPOS: [keyof OficioConfig, string][] = [
  ["destinatario_nombre", "Nombre del Director General de Aduanas"],
  ["destinatario_cargo", "Cargo del destinatario"],
  ["destinatario_institucion", "Institución"],
  ["firmante_nombre", "Firmante"],
  ["firmante_cargo", "Cargo del firmante"],
  ["ciudad", "Ciudad"],
  ["direccion", "Dirección (pie de página)"],
  ["telefono", "Teléfono (pie de página)"],
  ["email", "Email (pie de página)"],
];

export function OficioConfigCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["system_settings", OFICIO_CONFIG_KEY], queryFn: fetchOficioConfig });
  const [cfg, setCfg] = useState<OficioConfig>({ ...OFICIO_CONFIG_DEFAULT });
  useEffect(() => { if (data) setCfg(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("system_settings").upsert(
        {
          key: OFICIO_CONFIG_KEY,
          value: JSON.stringify(cfg),
          description: "Destinatario, firmante y pie de página de los oficios generados desde los Expedientes.",
          updated_by: u.user?.id ?? null,
        },
        { onConflict: "key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos de oficios guardados");
      qc.invalidateQueries({ queryKey: ["system_settings", OFICIO_CONFIG_KEY] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-primary" /> Datos de oficios a la DGA
        </CardTitle>
        <CardDescription>Se usan en el Oficio de Rectificación Técnica y en futuros oficios generados desde los Expedientes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS.map(([k, label]) => (
            <div key={k} className="grid gap-2">
              <Label>{label}</Label>
              <Input value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-1" /> Guardar datos de oficios
        </Button>
      </CardContent>
    </Card>
  );
}
