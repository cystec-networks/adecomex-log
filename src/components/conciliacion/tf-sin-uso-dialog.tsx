import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TfSinUso = { secuencia: string; nota: string; updated_at: string | null; transportes_que_lo_mencionan: string | null };

/** Números TF que nunca tuvieron solicitud de pago (huecos de la secuencia), con nota editable. */
export function useTfSinUso() {
  return useQuery({
    queryKey: ["tf-sin-uso"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vista_tf_sin_uso").select("secuencia, nota, updated_at, transportes_que_lo_mencionan").order("secuencia");
      if (error) throw error;
      return (data ?? []) as TfSinUso[];
    },
  });
}

export function TfSinUsoBoton() {
  const [open, setOpen] = useState(false);
  const { data = [] } = useTfSinUso();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Hash className="mr-1 h-4 w-4" /> Números TF sin uso ({data.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Números TF sin uso</DialogTitle>
            <DialogDescription>Números de la secuencia que nunca tuvieron solicitud de pago. No se reutilizan; anota qué pasó con cada uno.</DialogDescription>
          </DialogHeader>
          {data.length === 0 && <div className="text-[13px] text-muted-foreground">La secuencia no tiene huecos.</div>}
          <div className="space-y-3">{data.map((t) => <FilaTf key={t.secuencia} t={t} />)}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FilaTf({ t }: { t: TfSinUso }) {
  const qc = useQueryClient();
  const [nota, setNota] = useState(t.nota);
  useEffect(() => setNota(t.nota), [t.nota]);
  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tf_sin_uso_notas").upsert({ secuencia: t.secuencia, nota: nota.trim() } as never, { onConflict: "secuencia" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tf-sin-uso"] }); toast.success(`Nota de ${t.secuencia} guardada`); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-mono font-semibold">{t.secuencia}</span>
        {t.transportes_que_lo_mencionan && <span className="text-[11px] text-muted-foreground">Lo menciona: {t.transportes_que_lo_mencionan}</span>}
      </div>
      <Textarea rows={2} placeholder="Nota (p. ej. número saltado, solicitud anulada en papel…)" value={nota} onChange={(e) => setNota(e.target.value)} />
      {nota.trim() !== t.nota && (
        <div className="flex justify-end"><Button size="sm" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar nota</Button></div>
      )}
    </div>
  );
}
