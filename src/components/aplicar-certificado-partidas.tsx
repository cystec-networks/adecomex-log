import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { FileCheck2 } from "lucide-react";

type Props = {
  expedienteId: string;
  numeroCertificado: string;
  disabled?: boolean;
};

export function AplicarCertificadoPartidas({ expedienteId, numeroCertificado, disabled }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["mercancia-items", expedienteId],
    enabled: !!expedienteId,
    queryFn: async () =>
      (await supabase.from("mercancia_items").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const lista = useMemo(() => items ?? [], [items]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const it of lista as any[]) next[it.id] = !!it.tiene_certificado_origen;
    setSel(next);
  }, [open, lista]);

  const total = lista.length;
  const marcados = (lista as any[]).filter((it) => sel[it.id]).length;
  const todas = total > 0 && marcados === total;

  const aplicar = async () => {
    const numero = (numeroCertificado || "").trim();
    if (!numero) {
      toast.error("Escribe primero el N° Certificado de Origen.");
      return;
    }
    setSaving(true);
    try {
      const conCert = (lista as any[]).filter((it) => sel[it.id]).map((it) => it.id);
      const sinCert = (lista as any[]).filter((it) => !sel[it.id]).map((it) => it.id);

      if (conCert.length) {
        const { error } = await supabase
          .from("mercancia_items")
          .update({ tiene_certificado_origen: true, certificado_origen_numero: numero })
          .in("id", conCert);
        if (error) throw error;
      }
      if (sinCert.length) {
        const { error } = await supabase
          .from("mercancia_items")
          .update({ tiene_certificado_origen: false, certificado_origen_numero: null })
          .in("id", sinCert);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["mercancia-items", expedienteId] });
      toast.success(`Certificado aplicado a ${conCert.length} de ${total} partidas.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo aplicar el certificado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="gap-1.5">
          <FileCheck2 className="h-4 w-4" />
          Aplicar a partidas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplicar certificado de origen a partidas</DialogTitle>
          <DialogDescription>
            Marca las mercancías cubiertas por el certificado {(numeroCertificado || "").trim() || "(sin número)"}. Las no marcadas quedarán sin certificado.
          </DialogDescription>
        </DialogHeader>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Este expediente no tiene partidas registradas.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b pb-2">
              <Checkbox
                id="cert-todas"
                checked={todas}
                onCheckedChange={(v) => {
                  const next: Record<string, boolean> = {};
                  for (const it of lista as any[]) next[it.id] = !!v;
                  setSel(next);
                }}
              />
              <Label htmlFor="cert-todas" className="cursor-pointer text-sm font-medium">
                Todas las partidas ({marcados}/{total})
              </Label>
            </div>
            <ScrollArea className="max-h-72 pr-2">
              <div className="space-y-2 py-1">
                {(lista as any[]).map((it) => (
                  <div key={it.id} className="flex items-start gap-2 rounded-md border p-2">
                    <Checkbox
                      id={`cert-${it.id}`}
                      checked={!!sel[it.id]}
                      onCheckedChange={(v) => setSel((s) => ({ ...s, [it.id]: !!v }))}
                    />
                    <Label htmlFor={`cert-${it.id}`} className="cursor-pointer text-sm font-normal leading-snug">
                      <span className="font-medium">#{it.item_no ?? "-"}</span>{" "}
                      {it.descripcion || it.descripcion_comercial || "Sin descripción"}
                      <span className="block text-xs text-muted-foreground">
                        {[it.codigo_arancelario, it.pais_origen_codigo].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={aplicar} disabled={saving || total === 0}>
            {saving ? "Aplicando..." : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
