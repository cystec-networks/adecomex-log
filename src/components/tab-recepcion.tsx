import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { PackageCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";

type Linea = {
  mercancia_item_id: string;
  descripcion: string;
  cantidad_esperada: number;
  cantidad_recibida: string;
  peso_esperado: number | null;
  peso_recibido: string;
  calidad: string;
  observaciones: string;
};

const CALIDADES = [
  { v: "conforme", l: "Conforme" },
  { v: "danado", l: "Dañado" },
  { v: "defectuoso", l: "Defectuoso" },
  { v: "rechazado", l: "Rechazado" },
];

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 }).format(n);

export function TabRecepcion({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [obs, setObs] = useState("");
  const [toleranciaPct, setToleranciaPct] = useState("0.5");

  const { data: items } = useQuery({
    queryKey: ["mercancia_items", expedienteId],
    queryFn: async () =>
      (await supabase.from("mercancia_items").select("id, item_no, detalle_producto, cantidad, peso, unidad_medida")
        .eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const { data: recepciones } = useQuery({
    queryKey: ["recepciones", expedienteId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("recepciones" as any) as any)
        .select("*, recepcion_lineas(*), profiles:recibido_por(nombre)")
        .eq("expediente_id", expedienteId)
        .order("fecha_recepcion", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const openDialog = () => {
    setLineas(
      (items ?? []).map((it) => ({
        mercancia_item_id: it.id,
        descripcion: it.detalle_producto ?? `Ítem ${it.item_no}`,
        cantidad_esperada: Number(it.cantidad ?? 0),
        cantidad_recibida: String(it.cantidad ?? ""),
        peso_esperado: it.peso == null ? null : Number(it.peso),
        peso_recibido: it.peso == null ? "" : String(it.peso),
        calidad: "conforme",
        observaciones: "",
      }))
    );
    setObs("");
    setOpen(true);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const tol = parseFloat(toleranciaPct) || 0;
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;

      const { data: rec, error: e1 } = await (supabase.from("recepciones" as any) as any)
        .insert({ expediente_id: expedienteId, recibido_por: userId, observaciones: obs || null })
        .select("id")
        .single();
      if (e1) throw e1;

      const rows = lineas.map((l) => ({
        recepcion_id: rec.id,
        mercancia_item_id: l.mercancia_item_id,
        cantidad_esperada: l.cantidad_esperada,
        cantidad_recibida: parseFloat(l.cantidad_recibida) || 0,
        peso_esperado: l.peso_esperado,
        peso_recibido: l.peso_recibido === "" ? null : parseFloat(l.peso_recibido) || 0,
        calidad: l.calidad,
        observaciones: l.observaciones || null,
      }));
      const { error: e2 } = await (supabase.from("recepcion_lineas" as any) as any).insert(rows);
      if (e2) throw e2;

      // Detectar diferencias: cantidad y peso se comparan de forma independiente
      const diffs: { texto: string; severidad: "media" | "alta" | "critica" }[] = [];
      for (const l of lineas) {
        const cantRec = parseFloat(l.cantidad_recibida) || 0;
        const pesoRec = l.peso_recibido === "" ? null : parseFloat(l.peso_recibido) || 0;
        const partes: string[] = [];
        let sev: "media" | "alta" | "critica" = "media";

        const difCant = cantRec - l.cantidad_esperada;
        if (difCant !== 0) {
          const pct = l.cantidad_esperada !== 0 ? (difCant / l.cantidad_esperada) * 100 : 100;
          partes.push(
            `cantidad esperada ${fmtNum(l.cantidad_esperada)}, recibida ${fmtNum(cantRec)} (${difCant > 0 ? "+" : ""}${fmtNum(difCant)}, ${difCant > 0 ? "+" : ""}${pct.toFixed(1)}%)`
          );
          if (Math.abs(pct) > 5) sev = "alta";
        }
        if (l.peso_esperado != null && pesoRec != null) {
          const difPeso = pesoRec - l.peso_esperado;
          const pctPeso = l.peso_esperado !== 0 ? (difPeso / l.peso_esperado) * 100 : (difPeso !== 0 ? 100 : 0);
          if (Math.abs(pctPeso) > tol) {
            partes.push(
              `peso esperado ${fmtNum(l.peso_esperado)} kg, recibido ${fmtNum(pesoRec)} kg (${difPeso > 0 ? "+" : ""}${fmtNum(difPeso)} kg, ${difPeso > 0 ? "+" : ""}${pctPeso.toFixed(1)}%)`
            );
            if (Math.abs(pctPeso) > 5) sev = "alta";
          }
        }
        if (l.calidad !== "conforme") {
          const calLabel = CALIDADES.find((c) => c.v === l.calidad)?.l ?? l.calidad;
          partes.push(`calidad: ${calLabel.toLowerCase()}`);
          if (l.calidad === "rechazado") sev = "critica";
          else if (sev === "media") sev = "alta";
        }
        if (partes.length > 0) {
          diffs.push({ texto: `${l.descripcion} — ${partes.join("; ")}`, severidad: sev });
        }
      }

      if (diffs.length > 0) {
        const sevGlobal = diffs.some((d) => d.severidad === "critica")
          ? "critica"
          : diffs.some((d) => d.severidad === "alta")
            ? "alta"
            : "media";
        const descripcion =
          `Recepción del ${fmtLocalDate(new Date().toISOString().slice(0, 10))} con diferencias:\n` +
          diffs.map((d) => `• ${d.texto}`).join("\n");
        const { error: e3 } = await supabase.from("incidencias").insert({
          expediente_id: expedienteId,
          tipo: "Diferencia de peso/cantidad",
          severidad: sevGlobal as any,
          estado: "abierta" as any,
          descripcion,
          created_by: userId,
        });
        if (e3) throw e3;
      }
      return { conDiferencias: diffs.length > 0 };
    },
    onSuccess: (r) => {
      toast.success(r.conDiferencias ? "Recepción registrada — incidencia generada por diferencias" : "Recepción registrada conforme");
      qc.invalidateQueries({ queryKey: ["recepciones", expedienteId] });
      qc.invalidateQueries({ queryKey: ["incidencias", expedienteId] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setLinea = (idx: number, patch: Partial<Linea>) =>
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4" />Recepción de Mercancía</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openDialog} disabled={!items || items.length === 0}>
              <Plus className="h-4 w-4 mr-1" />Registrar Recepción
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Registrar recepción</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">
              Compara lo recibido físicamente contra lo esperado. Cantidad y peso son medidas independientes: puede haber diferencia en una sin que la haya en la otra.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-2">Descripción</th>
                    <th className="text-left py-2 pr-2">Cant. esperada</th>
                    <th className="text-left py-2 pr-2">Cant. recibida</th>
                    <th className="text-left py-2 pr-2">Peso esp. kg</th>
                    <th className="text-left py-2 pr-2">Peso rec. kg</th>
                    <th className="text-left py-2 pr-2">Calidad</th>
                    <th className="text-left py-2">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={l.mercancia_item_id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-2 text-xs max-w-[220px]">{l.descripcion}</td>
                      <td className="py-2 pr-2 text-xs">{fmtNum(l.cantidad_esperada)}</td>
                      <td className="py-2 pr-2">
                        <Input type="number" className="h-8 w-24" value={l.cantidad_recibida}
                          onChange={(e) => setLinea(i, { cantidad_recibida: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2 text-xs">{fmtNum(l.peso_esperado)}</td>
                      <td className="py-2 pr-2">
                        <Input type="number" className="h-8 w-24" value={l.peso_recibido}
                          onChange={(e) => setLinea(i, { peso_recibido: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <Select value={l.calidad} onValueChange={(v) => setLinea(i, { calidad: v })}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CALIDADES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2">
                        <Input className="h-8 w-40" value={l.observaciones}
                          onChange={(e) => setLinea(i, { observaciones: e.target.value })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-1.5">
              <Label>Observaciones generales</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Tolerancia de peso ±%</Label>
              <Input type="number" step="0.1" className="h-8 w-20" value={toleranciaPct}
                onChange={(e) => setToleranciaPct(e.target.value)} />
              <span className="text-xs text-muted-foreground">Diferencias de peso dentro de este % no generan incidencia.</span>
            </div>
            <DialogFooter>
              <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || lineas.length === 0}>
                Guardar recepción
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left">Recibido por</th>
              <th className="text-left">Resumen</th>
              <th className="text-left px-4">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(recepciones ?? []).map((r: any) => {
              const lineasR = (r.recepcion_lineas ?? []) as any[];
              const conDif = lineasR.some(
                (l) =>
                  Number(l.cantidad_recibida) !== Number(l.cantidad_esperada) ||
                  (l.peso_esperado != null && l.peso_recibido != null && Number(l.peso_recibido) !== Number(l.peso_esperado)) ||
                  l.calidad !== "conforme"
              );
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-xs">{fmtLocalDate(r.fecha_recepcion)}</td>
                  <td className="text-xs">{r.profiles?.nombre ?? "—"}</td>
                  <td className="text-xs text-muted-foreground max-w-[380px]">
                    <div>{lineasR.length} ítem(s){r.observaciones ? ` — ${r.observaciones}` : ""}</div>
                    {conDif && (
                      <div className="mt-0.5">
                        {lineasR.filter((l) => l.calidad !== "conforme" || Number(l.cantidad_recibida) !== Number(l.cantidad_esperada) || (l.peso_esperado != null && l.peso_recibido != null && Number(l.peso_recibido) !== Number(l.peso_esperado))).map((l) => (
                          <div key={l.id}>
                            {Number(l.cantidad_recibida) !== Number(l.cantidad_esperada) && `cant. ${fmtNum(Number(l.cantidad_esperada))}→${fmtNum(Number(l.cantidad_recibida))} `}
                            {l.peso_esperado != null && l.peso_recibido != null && Number(l.peso_recibido) !== Number(l.peso_esperado) && `peso ${fmtNum(Number(l.peso_esperado))}→${fmtNum(Number(l.peso_recibido))} kg `}
                            {l.calidad !== "conforme" && `calidad: ${CALIDADES.find((c) => c.v === l.calidad)?.l ?? l.calidad}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4">
                    {conDif
                      ? <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent">Con diferencias</Badge>
                      : <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">Conforme</Badge>}
                  </td>
                </tr>
              );
            })}
            {(!recepciones || recepciones.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin recepciones registradas.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
