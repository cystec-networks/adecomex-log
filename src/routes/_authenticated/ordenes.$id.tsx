import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDEN_ESTADOS, ORDEN_ESTADO_CLASS, ordenEstadoLabel } from "@/lib/estados-orden";
import { ArrowLeft, Save, FolderPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { useMyRoles } from "@/lib/auth-hooks";
import { ProductosCard } from "@/components/productos-card";

export const Route = createFileRoute("/_authenticated/ordenes/$id")({
  component: DetalleOrden,
});

function ReadOnlyField({ label, value }: { label: string; value: any }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value === null || value === undefined || value === "" ? "—" : String(value)}</span>
    </div>
  );
}

function DetalleOrden() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "vendedor");

  const { data: o } = useQuery({
    queryKey: ["orden", id],
    queryFn: async () =>
      (await supabase.from("ordenes").select("*, clientes(nombre), solicitudes(id,numero)").eq("id", id).maybeSingle())
        .data,
  });

  const solicitudVinculada = (o as any)?.solicitudes ?? null;



  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (o && !form) setForm({ estado: o.estado ?? "abierta", notas: o.notas ?? "" });
  }, [o]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ordenes").update(form).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden actualizada");
      qc.invalidateQueries({ queryKey: ["orden", id] });
      qc.invalidateQueries({ queryKey: ["ordenes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!o || !form) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  const money = (v: any, m: any) =>
    v == null ? "—" : `${m ?? "USD"} ${Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild><Link to="/ordenes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {o.numero}
            <Badge className={ORDEN_ESTADO_CLASS[form.estado] ?? ""}>{ordenEstadoLabel(form.estado)}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {(o as any).clientes?.nombre ?? "Sin cliente"} · creada el {fmtLocalDate(o.created_at?.slice(0, 10))}
          </p>
        </div>
        {solicitudVinculada ? (
          <Button variant="outline" asChild>
            <Link to="/solicitudes/$id" params={{ id: solicitudVinculada.id }}>
              <FolderPlus className="h-4 w-4 mr-1" />Ver Solicitud {solicitudVinculada.numero} ↗
            </Link>
          </Button>
        ) : canEdit ? (
          o.estado === "en_transito" ? (
            <Button variant="outline" asChild>
              <Link to="/solicitudes/nueva" search={{ orden: id }}>
                <FolderPlus className="h-4 w-4 mr-1" />Convertir en Solicitud
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled
              title="Cambia el estado a 'En Tránsito' para poder convertir en Solicitud"
            >
              <FolderPlus className="h-4 w-4 mr-1" />Convertir en Solicitud
            </Button>
          )
        ) : null}

        {canEdit && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" />Guardar cambios</Button>
        )}
      </div>

      {o.cotizacion_id || o.cot_numero ? (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center justify-between">
              <span>Datos de la Cotización Original</span>
              {o.cotizacion_id && (
                <Link to="/cotizaciones/$id" params={{ id: o.cotizacion_id }} className="text-xs font-normal text-primary underline">
                  {o.cot_numero} ↗
                </Link>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Referencia conservada al momento de la conversión (solo lectura).</p>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="N° Cotización" value={o.cot_numero} />
            <ReadOnlyField label="Cliente" value={(o as any).clientes?.nombre} />
            <ReadOnlyField label="Tipo de mercancía" value={o.cot_tipo_mercancia} />
            <ReadOnlyField label="Origen" value={o.cot_origen} />
            <ReadOnlyField label="Destino" value={o.cot_destino} />
            <ReadOnlyField label="Incoterm" value={o.cot_incoterm} />
            <ReadOnlyField label="Peso estimado (kg)" value={o.cot_peso_kg} />
            <ReadOnlyField label="Volumen estimado (m³)" value={o.cot_volumen_m3} />
            <ReadOnlyField label="Tarifa propuesta" value={money(o.cot_tarifa_propuesta, o.cot_moneda)} />
            <ReadOnlyField label="Fecha de emisión" value={fmtLocalDate(o.cot_fecha_emision)} />
            <ReadOnlyField label="Fecha de vigencia" value={fmtLocalDate(o.cot_fecha_vigencia)} />
            <ReadOnlyField label="Notas de la cotización" value={o.cot_notas} />
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Datos de la Orden</CardTitle>
            <p className="text-xs text-muted-foreground">Orden directa: no proviene de una cotización.</p>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Cliente" value={(o as any).clientes?.nombre} />
            {o.cot_tipo_mercancia && <ReadOnlyField label="Tipo de mercancía" value={o.cot_tipo_mercancia} />}
            {o.cot_origen && <ReadOnlyField label="Origen" value={o.cot_origen} />}
            {o.cot_destino && <ReadOnlyField label="Destino" value={o.cot_destino} />}
            {o.cot_incoterm && <ReadOnlyField label="Incoterm" value={o.cot_incoterm} />}
            {o.cot_peso_kg != null && <ReadOnlyField label="Peso estimado (kg)" value={o.cot_peso_kg} />}
            {o.cot_volumen_m3 != null && <ReadOnlyField label="Volumen estimado (m³)" value={o.cot_volumen_m3} />}
            {o.cot_tarifa_propuesta != null && (
              <ReadOnlyField label="Tarifa propuesta" value={money(o.cot_tarifa_propuesta, o.cot_moneda)} />
            )}
          </CardContent>
        </Card>
      )}

      <ProductosCard tabla="orden_productos" parentId={id} readOnly={!canEdit} />

      <Card>
        <CardHeader><CardTitle className="text-base">Orden</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 md:max-w-xs"><Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ORDEN_ESTADOS.map((e) => <SelectItem key={e} value={e}>{ordenEstadoLabel(e)}</SelectItem>)}</SelectContent>
            </Select>
            {!solicitudVinculada && o.estado !== "en_transito" && (
              <span className="text-[11px] text-amber-700">
                Cambia el estado a "En Tránsito" para poder abrir la Solicitud.
              </span>
            )}
          </div>
          <div className="grid gap-1.5"><Label>Notas</Label>
            <Textarea rows={4} value={form.notas} readOnly={!canEdit} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
