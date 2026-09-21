import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

/** Estado de cobro de la Solicitud de Reembolso (uno por Expediente). */
export function ReembolsoEstadoControl({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const queryKey = ["reembolso-estado", expedienteId];

  const { data } = useQuery({
    queryKey,
    enabled: Boolean(expedienteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedientes")
        .select("reembolso_estado, reembolso_fecha_pago")
        .eq("id", expedienteId)
        .maybeSingle();
      if (error) throw error;
      return data as { reembolso_estado: string | null; reembolso_fecha_pago: string | null } | null;
    },
  });

  const guardar = useMutation({
    mutationFn: async (values: { reembolso_estado?: string; reembolso_fecha_pago?: string | null }) => {
      const { error } = await supabase.from("expedientes").update(values as any).eq("id", expedienteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const estado = data?.reembolso_estado || "pendiente";

  return (
    <div className="flex items-end gap-2">
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Estado del reembolso</Label>
        <Select
          value={estado}
          onValueChange={(v) =>
            guardar.mutate({
              reembolso_estado: v,
              ...(v === "pendiente" ? { reembolso_fecha_pago: null } : {}),
            })
          }
        >
          <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="pagado">Pagado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {estado === "pagado" && (
        <div className="grid gap-1">
          <Label className="text-[11px] text-muted-foreground">Fecha de pago</Label>
          <Input
            type="date"
            className="h-8 w-[150px]"
            value={data?.reembolso_fecha_pago ?? ""}
            onChange={(e) => guardar.mutate({ reembolso_fecha_pago: e.target.value || null })}
          />
        </div>
      )}
    </div>
  );
}

export default ReembolsoEstadoControl;
