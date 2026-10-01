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
  preferenciaComercial?: string;
  disabled?: boolean;
};

const normCod = (c: string) => (c || "").replace(/\D/g, "");

export function AplicarCertificadoPartidas({ expedienteId, numeroCertificado, preferenciaComercial = "", disabled }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [pctPref, setPctPref] = useState<Record<string, string>>({});

  const { data: items } = useQuery({
    queryKey: ["mercancia-items", expedienteId],
    enabled: !!expedienteId,
    queryFn: async () =>
      (await supabase.from("mercancia_items").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const lista = useMemo(() => items ?? [], [items]);

  const { data: tasas } = useQuery({
    queryKey: ["tasas-cert-partidas", expedienteId, open],
    enabled: open && lista.length > 0,
    queryFn: async () =>
      (await supabase.from("catalogo_tasas_arancelarias").select("codigo_arancelario,pct_gravamen,pct_gravamen_preferencial,acuerdo_preferencial")).data ?? [],
  });
  const tasaPorCodigo = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of (tasas ?? []) as any[]) m.set(normCod(t.codigo_arancelario), t);
    return m;
  }, [tasas]);
  const prefCatalogo = (codigo: string): number | null => {
    const t = tasaPorCodigo.get(normCod(codigo));
    if (!t || t.pct_gravamen_preferencial == null) return null;
    const a = (t.acuerdo_preferencial || "").trim().toLowerCase();
    const p = preferenciaComercial.trim().toLowerCase();
    if (!a || !p) return null;
    return a === p || p.includes(a) || a.includes(p) ? Number(t.pct_gravamen_preferencial) : null;
  };

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const it of lista as any[]) next[it.id] = !!it.tiene_certificado_origen;
    setSel(next);
  }, [open, lista]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const it of lista as any[]) {
      const c = prefCatalogo(it.codigo_arancelario);
      next[it.id] = c != null ? String(c) : it.tiene_certificado_origen && it.pct_gravamen != null ? String(Number(it.pct_gravamen)) : "";
    }
    setPctPref(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lista, tasaPorCodigo]);

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

      let recalculadas = 0;
      for (const id of conCert) {
        const v = (pctPref[id] ?? "").trim().replace(",", ".");
        const upd: any = { tiene_certificado_origen: true, certificado_origen_numero: numero };
        if (v !== "" && isFinite(Number(v))) { upd.pct_gravamen = Number(v); recalculadas++; }
        const { error } = await supabase.from("mercancia_items").update(upd).eq("id", id);
        if (error) throw error;
      }
      for (const id of sinCert) {
        const it = (lista as any[]).find((x) => x.id === id);
        const base = tasaPorCodigo.get(normCod(it?.codigo_arancelario))?.pct_gravamen;
        const upd: any = { tiene_certificado_origen: false, certificado_origen_numero: null };
        if (it?.tiene_certificado_origen && base != null) upd.pct_gravamen = Number(base);
        const { error } = await supabase.from("mercancia_items").update(upd).eq("id", id);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["mercancia-items", expedienteId] });
      qc.invalidateQueries({ queryKey: ["tasas-por-codigos"] });
      const sinPct = conCert.length - recalculadas;
      toast.success(`Certificado aplicado a ${conCert.length} de ${total} partidas. Gravamen preferencial recalculado en ${recalculadas}.`);
      if (sinPct > 0) toast.warning(`${sinPct} partida(s) marcada(s) sin % preferencial: su gravamen no cambió.`);
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
            Marca las mercancías cubiertas por el certificado {(numeroCertificado || "").trim() || "(sin número)"}. Las no marcadas quedarán sin certificado. Indica el % de gravamen preferencial de cada partida (se prellena desde el catálogo de tasas si el acuerdo coincide).
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
                    {sel[it.id] && (
                      <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-[10px] uppercase text-muted-foreground">% Grav. pref.</span>
                        <input
                          inputMode="decimal"
                          className="h-7 w-16 rounded border bg-background px-1 text-right text-sm"
                          value={pctPref[it.id] ?? ""}
                          placeholder={it.pct_gravamen != null ? String(Number(it.pct_gravamen)) : "—"}
                          onChange={(e) => setPctPref((s) => ({ ...s, [it.id]: e.target.value }))}
                        />
                        <span className="text-[10px] text-muted-foreground">Actual {it.pct_gravamen != null ? `${Number(it.pct_gravamen)}%` : "—"}{prefCatalogo(it.codigo_arancelario) != null ? " · catálogo" : ""}</span>
                      </div>
                    )}
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
