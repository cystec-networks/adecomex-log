import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Mail, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { camposFaltantes } from "@/lib/correo-solicitud";
import { fmtLocalDate } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/expedientes/correo")({
  head: () => ({ meta: [
    { title: "Solicitudes recibidas por correo | ADECOMEX" },
    { name: "description", content: "Borradores de expediente creados desde correos de clientes, pendientes de confirmar." },
    { property: "og:title", content: "Solicitudes recibidas por correo | ADECOMEX" },
    { property: "og:description", content: "Borradores de expediente creados desde correos de clientes, pendientes de confirmar." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BandejaCorreo,
});

function BandejaCorreo() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["solicitudes-correo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("solicitudes_correo").select("*")
        .eq("estado", "pendiente").order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((s) => s.cliente_id).filter(Boolean))] as string[];
      const { data: cl } = ids.length ? await supabase.from("clientes").select("id,nombre").in("id", ids) : { data: [] as any[] };
      const nom = new Map((cl ?? []).map((c: any) => [c.id, c.nombre]));
      return (data ?? []).map((s) => ({ ...s, clientes: s.cliente_id ? { nombre: nom.get(s.cliente_id) } : null })) as any[];
    },
  });
  const descartar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("solicitudes_correo").update({ estado: "descartada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Solicitud descartada"); qc.invalidateQueries({ queryKey: ["solicitudes-correo"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-3 md:p-4 space-y-3 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" asChild><Link to="/expedientes"><ArrowLeft className="h-4 w-4 mr-1" />Expedientes</Link></Button>
        <h1 className="font-display text-lg font-bold flex items-center gap-2"><Mail className="h-4 w-4" />Solicitudes recibidas por correo</h1>
        <Badge variant="secondary">{data.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">Borradores pendientes de confirmar. No cuentan en reportes, Costos, Finanzas ni dashboards hasta «Confirmar y activar».</p>
      <Card>
        <CardContent className="p-0 overflow-auto">
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Cargando…</p> : data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No hay solicitudes pendientes.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr><th className="px-2 py-1.5">Recibido</th><th className="px-2">Remitente / Cliente</th><th className="px-2">BL/AWB</th><th className="px-2">ETA</th><th className="px-2">Producto</th><th className="px-2">Cantidad</th><th className="px-2">Falta</th><th className="px-2 text-right">Acciones</th></tr>
              </thead>
              <tbody>
                {data.map((s) => {
                  const falta = camposFaltantes(s);
                  return (
                    <Fragment key={s.id}>
                      <tr className="border-t align-top">
                        <td className="px-2 py-1.5 whitespace-nowrap">{new Date(s.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}</td>
                        <td className="px-2 py-1.5">
                          <div>{s.clientes?.nombre ?? s.cliente_nombre ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">{s.remitente_correo ?? s.remitente}</div>
                          {s.asunto && <button className="text-[11px] text-primary underline" onClick={() => setAbierto(abierto === s.id ? null : s.id)}>{s.asunto}</button>}
                        </td>
                        <td className="px-2 py-1.5 font-mono">{s.bl_awb ?? "—"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{s.eta ? fmtLocalDate(s.eta) : "—"}</td>
                        <td className="px-2 py-1.5">{s.producto ?? "—"}</td>
                        <td className="px-2 py-1.5">{s.cantidad ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          {falta.length === 0 ? <Badge variant="outline" className="text-[11px]">Completo</Badge> :
                            <div className="flex flex-wrap gap-1">{falta.map((f) => <Badge key={f} className="bg-warning/15 text-warning-foreground border-warning/40 text-[11px]" variant="outline">{f}</Badge>)}</div>}
                          {(s.advertencias ?? []).map((a: string) => <div key={a} className="mt-1 text-[11px] text-warning-foreground">⚠ {a}</div>)}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          <Button size="sm" className="h-7 px-2 mr-1" asChild>
                            <Link to="/expedientes/$id" params={{ id: "nuevo" }} search={{ nuevo: "", solicitud: "", correo: s.id }}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirmar y activar</Link>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Descartar" onClick={() => descartar.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                      {abierto === s.id && (
                        <tr key={`${s.id}-txt`} className="bg-muted/20"><td colSpan={8} className="px-3 py-2">
                          <div className="text-[11px] text-muted-foreground mb-1">Mensaje procesado</div>
                          <pre className="whitespace-pre-wrap text-[12px]">{s.mensaje_aislado}</pre>
                          <details className="mt-2"><summary className="text-[11px] cursor-pointer text-muted-foreground">Correo completo</summary><pre className="whitespace-pre-wrap text-[11px] mt-1">{s.cuerpo}</pre></details>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
