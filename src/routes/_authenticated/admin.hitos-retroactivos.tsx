import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2, Undo2, Wand2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtFechaHora } from "@/lib/documento-versiones";
import { fmtFechaDia } from "@/lib/hitos-automaticos";
import {
  desgloseCandidatos, ejemplosCandidatos, estadoExpedienteLabel, fuenteCandidato, HITOS_LOTE, type CandidatoHito,
} from "@/lib/hitos-lote";

const TITULO = "Hitos retroactivos | ADECOMEX";
const DESCRIPCION = "Vista previa, aplicación y reversión del completado retroactivo de fechas del Checklist de Despacho.";

export const Route = createFileRoute("/_authenticated/admin/hitos-retroactivos")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: HitosRetroactivos,
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRIPCION },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRIPCION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Lote = { id: string; creado_en: string; creado_por: string | null; total: number; deshecho_en: string | null; revertidos: number | null; conservados: number | null; usuario?: string };

function HitosRetroactivos() {
  const qc = useQueryClient();
  const [confirmarAplicar, setConfirmarAplicar] = useState(false);
  const [deshacer, setDeshacer] = useState<Lote | null>(null);

  const { data: cands = [], isLoading } = useQuery({
    queryKey: ["hitos-retroactivos-candidatos"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hitos_retroactivos_candidatos");
      if (error) throw error;
      return (data ?? []) as CandidatoHito[];
    },
  });

  const { data: lotes = [] } = useQuery({
    queryKey: ["hitos-lotes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hitos_lotes").select("id, creado_en, creado_por, total, deshecho_en, revertidos, conservados").order("creado_en", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((l) => l.creado_por).filter(Boolean))] as string[];
      const nombres: Record<string, string> = {};
      if (ids.length) for (const p of (await supabase.from("profiles").select("id, nombre").in("id", ids)).data ?? []) nombres[p.id] = p.nombre ?? "";
      return (data ?? []).map((l) => ({ ...l, usuario: l.creado_por ? nombres[l.creado_por] || "—" : "—" })) as Lote[];
    },
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["hitos-retroactivos-candidatos"] });
    qc.invalidateQueries({ queryKey: ["hitos-lotes"] });
    qc.invalidateQueries({ queryKey: ["reminders"] });
    qc.invalidateQueries({ queryKey: ["expediente-hitos"] });
  };

  const aplicar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("aplicar_lote_hitos_retroactivos");
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lote aplicado. Puedes deshacerlo completo desde esta pantalla."); setConfirmarAplicar(false); refrescar(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo aplicar el lote"),
  });

  const revertir = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("deshacer_lote_hitos", { p_lote: id });
      if (error) throw error;
      return data as { revertidos: number; conservados: number };
    },
    onSuccess: (r) => {
      toast.success(`Lote deshecho: ${r.revertidos} fechas retiradas${r.conservados ? `; ${r.conservados} cambiadas después se conservaron` : ""}.`);
      setDeshacer(null); refrescar();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo deshacer el lote"),
  });

  const { estados, filas, total } = desgloseCandidatos(cands);
  const ejemplos = ejemplosCandidatos(cands);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold flex items-center gap-2"><History className="h-4 w-4" />Hitos retroactivos del Checklist</h1>
          <p className="text-[12px] text-muted-foreground">Completa los hitos 1, 2, 4 y 8 vacíos con la fecha de su regla automática. Nunca toca fechas puestas a mano.</p>
        </div>
        <Button onClick={() => setConfirmarAplicar(true)} disabled={!total || aplicar.isPending}>
          {aplicar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}Aplicar lote ({total} hitos)
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[14px]">Lotes aplicados</CardTitle>
          <CardDescription className="text-[12px]">Deshacer retira solo las fechas que siguen como las dejó el lote; si alguien la cambió después, se conserva.</CardDescription></CardHeader>
        <CardContent>
          {lotes.length === 0 ? <p className="text-[12px] text-muted-foreground">Todavía no se ha aplicado ningún lote.</p> : (
            <table className="w-full text-[12px]">
              <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Aplicado</th><th className="text-left">Por</th><th className="text-right">Hitos</th><th className="text-left pl-4">Estado</th><th /></tr></thead>
              <tbody>{lotes.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-1.5">{fmtFechaHora(l.creado_en)}</td><td>{l.usuario}</td><td className="text-right tabular-nums">{l.total}</td>
                  <td className="pl-4">{l.deshecho_en
                    ? <Badge variant="outline">Deshecho {fmtFechaHora(l.deshecho_en)} · {l.revertidos ?? 0} retiradas{l.conservados ? `, ${l.conservados} conservadas` : ""}</Badge>
                    : <Badge>Activo</Badge>}</td>
                  <td className="text-right">{!l.deshecho_en && (
                    <Button size="sm" variant="outline" onClick={() => setDeshacer(l)} disabled={revertir.isPending}><Undo2 className="mr-1 h-3.5 w-3.5" />Deshacer lote</Button>)}</td>
                </tr>))}</tbody>
            </table>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[14px]">Vista previa: por hito y estado del Expediente</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          {isLoading ? <p className="text-[12px] text-muted-foreground">Calculando…</p> : total === 0 ? <p className="text-[12px] text-muted-foreground">No hay hitos vacíos con fecha disponible.</p> : (
            <table className="w-full text-[12px]">
              <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Hito</th>{estados.map((e) => <th key={e} className="px-2 text-right">{estadoExpedienteLabel(e)}</th>)}<th className="px-2 text-right">Total</th></tr></thead>
              <tbody>{filas.map((f) => (
                <tr key={f.hito} className="border-t"><td className="py-1.5">{HITOS_LOTE[f.hito]}</td>{estados.map((e) => <td key={e} className="px-2 text-right tabular-nums">{f.porEstado[e] || ""}</td>)}<td className="px-2 text-right font-medium tabular-nums">{f.total}</td></tr>))}
                <tr className="border-t font-medium"><td className="py-1.5">Total</td>{estados.map((e) => <td key={e} className="px-2 text-right tabular-nums">{cands.filter((c) => c.estado_expediente === e).length}</td>)}<td className="px-2 text-right tabular-nums">{total}</td></tr>
              </tbody>
            </table>)}
        </CardContent>
      </Card>

      {total > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Ejemplos (hasta 10 por hito)</CardTitle></CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Expediente</th><th className="text-left">Hito</th><th className="text-left">Estado</th><th className="text-left">Fecha</th><th className="text-left">De dónde sale</th></tr></thead>
              <tbody>{ejemplos.map((c) => (
                <tr key={c.hito_id} className="border-t">
                  <td className="py-1.5"><Link to="/expedientes/$id" params={{ id: c.expediente_id }} className="expediente-numero font-medium hover:underline">{c.numero}</Link></td>
                  <td>{HITOS_LOTE[c.hito_codigo]}</td><td>{estadoExpedienteLabel(c.estado_expediente)}</td>
                  <td className="tabular-nums">{["documentos", "vuce_carga", "correo_dga", "correo"].includes(c.origen) ? fmtFechaHora(c.evento_fecha) : fmtFechaDia(c.evento_fecha)}</td>
                  <td>{fuenteCandidato(c)}</td>
                </tr>))}</tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmarAplicar} onOpenChange={setConfirmarAplicar}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Aplicar el lote de {total} hitos?</AlertDialogTitle>
            <AlertDialogDescription>Las fechas quedan como «Automático» con la nota «completado retroactivamente». Se registra en Auditoría y puedes deshacerlo completo.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); aplicar.mutate(); }} disabled={aplicar.isPending}>Aplicar lote</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deshacer} onOpenChange={(o) => !o && setDeshacer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Deshacer el lote completo?</AlertDialogTitle>
            <AlertDialogDescription>Se vaciarán las {deshacer?.total ?? 0} fechas que puso el lote, salvo las que alguien haya cambiado después.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deshacer) revertir.mutate(deshacer.id); }} disabled={revertir.isPending}>Deshacer lote</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
