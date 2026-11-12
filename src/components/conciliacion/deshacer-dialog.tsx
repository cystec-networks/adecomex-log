import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtLocalDate } from "@/lib/dates";
import { fmtRD, useInvalidarConciliacion } from "./datos";

type Mov = { id: string; fecha: string; monto: number; descripcion: string | null; notas: string | null };

/** Vuelve un movimiento a Pendiente. Si la entrada se creó desde el banco, permite
 * anularla (queda en la secuencia TF como Anulada, nunca se borra). */
export function DeshacerConciliacionDialog({ mov, onClose }: { mov: Mov | null; onClose: () => void }) {
  const invalidar = useInvalidarConciliacion();
  const [anular, setAnular] = useState(true);
  const [motivo, setMotivo] = useState("");
  useEffect(() => { if (mov) { setAnular(true); setMotivo(""); } }, [mov]);

  const { data: creada } = useQuery({
    queryKey: ["entrada-creada-banco", mov?.id],
    enabled: !!mov,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitudes_pago_transferencia")
        .select("id, secuencia")
        .eq("banco_movimiento_id", mov!.id).eq("origen", "banco").eq("estado", "pagada")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const deshacer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("deshacer_conciliacion_banco", {
        p_movimiento: mov!.id, p_anular_creada: !!creada && anular, p_motivo: motivo.trim() || undefined,
      });
      if (error) throw error;
      return data as { anulada: string | null };
    },
    onSuccess: (r) => {
      toast.success(r.anulada ? `Movimiento pendiente otra vez · ${r.anulada} anulada` : "Movimiento pendiente otra vez");
      invalidar();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={!!mov} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Deshacer la conciliación?</AlertDialogTitle>
          <AlertDialogDescription>
            {mov && <>{fmtLocalDate(mov.fecha)} · {fmtRD(Number(mov.monto))} · {mov.descripcion}{mov.notas ? ` · ${mov.notas}` : ""}. El movimiento vuelve a Pendiente.</>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {creada && (
          <div className="space-y-2 rounded-md border p-3 text-[13px]">
            <label className="flex items-start gap-2">
              <Checkbox checked={anular} onCheckedChange={(v) => setAnular(!!v)} className="mt-0.5" />
              <span>Anular la entrada <strong className="font-mono">{creada.secuencia}</strong> creada desde este movimiento. Queda en la secuencia como «Anulada» y sale del Diario; no se borra.</span>
            </label>
            {anular && (
              <div className="space-y-1">
                <Label>Motivo de la anulación</Label>
                <Input value={motivo} placeholder="Conciliación bancaria deshecha" onChange={(e) => setMotivo(e.target.value)} />
              </div>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={deshacer.isPending} onClick={(e) => { e.preventDefault(); deshacer.mutate(); }}>
            Deshacer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
