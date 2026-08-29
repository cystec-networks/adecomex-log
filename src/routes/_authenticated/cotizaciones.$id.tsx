import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { CatalogoAutocomplete } from "@/components/catalogo-autocomplete";
import { BadgeVigencia } from "@/components/badge-vigencia";
import { useMyRoles } from "@/lib/auth-hooks";
import { ProductosCard } from "@/components/productos-card";
import { copiarProductos } from "@/lib/copiar-productos";
import { fmtLocalDate } from "@/lib/dates";
import { CalcularEstimadoButton, PreLiquidacionPdfButtonCotizacion } from "@/components/preliquidacion-cotizacion";
import {
  COTIZACION_ESTADOS, COTIZACION_ESTADO_CLASS, cotizacionEstadoLabel, TIPOS_MERCANCIA,
} from "@/lib/estados-cotizacion";

export const Route = createFileRoute("/_authenticated/cotizaciones/$id")({
  component: DetalleCotizacion,
});

function DetalleCotizacion() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "vendedor");

  const { data: c } = useQuery({
    queryKey: ["cotizacion", id],
    queryFn: async () => (await supabase.from("cotizaciones").select("*, clientes(*)").eq("id", id).maybeSingle()).data,
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });
  const { data: perfiles } = useQuery({
    queryKey: ["vendedores-lite"],
    queryFn: async () => {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "vendedor"]);
      const ids = [...new Set((userRoles ?? []).map((r) => r.user_id))];
      if (ids.length === 0) return [];
      return (await supabase.from("profiles").select("id,nombre").in("id", ids).order("nombre")).data ?? [];
    },
  });

  const { data: ordenVinculada } = useQuery({
    queryKey: ["orden-de-cotizacion", id],
    enabled: !!c,
    queryFn: async () => (await supabase.from("ordenes").select("id,numero").eq("cotizacion_id", id).maybeSingle()).data,
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (c && !form) {
      setForm({
        numero: c.numero ?? "",
        estado: c.estado,
        cliente_id: c.cliente_id ?? "",
        vendedor_id: c.vendedor_id ?? "",
        tipo_mercancia: c.tipo_mercancia ?? "",
        origen: c.origen ?? "",
        destino: c.destino ?? "",
        incoterm: c.incoterm ?? "",
        peso_kg: c.peso_kg ?? "",
        volumen_m3: c.volumen_m3 ?? "",
        tarifa_propuesta: c.tarifa_propuesta ?? "",
        moneda: c.moneda ?? "USD",
        fecha_emision: c.fecha_emision ?? "",
        fecha_vigencia: c.fecha_vigencia ?? "",
        notas: c.notas ?? "",
      });
    }
  }, [c]);

  const convertida = !!(c as any)?.orden_id || !!ordenVinculada;
  const readOnly = !canEdit || convertida;

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      for (const k of ["cliente_id", "vendedor_id", "fecha_vigencia", "fecha_emision"]) {
        if (!payload[k]) payload[k] = null;
      }
      for (const k of ["peso_kg", "volumen_m3", "tarifa_propuesta"]) {
        payload[k] = payload[k] === "" || payload[k] == null ? null : Number(payload[k]);
      }
      const { error } = await supabase.from("cotizaciones").update(payload).eq("id", id);
      if (error) {
        if (error.code === "23505") {
          throw new Error("Ese número de cotización ya está en uso — elige otro.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cotización actualizada");
      qc.invalidateQueries({ queryKey: ["cotizacion", id] });
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const convertir = useMutation({
    mutationFn: async () => {
      const { data: orden, error } = await supabase.from("ordenes").insert({
        cotizacion_id: id,
        cliente_id: c!.cliente_id,
        vendedor_id: (c as any).vendedor_id,
        cot_numero: c!.numero,
        cot_tipo_mercancia: (c as any).tipo_mercancia,
        cot_origen: (c as any).origen,
        cot_destino: (c as any).destino,
        cot_incoterm: (c as any).incoterm,
        cot_peso_kg: (c as any).peso_kg,
        cot_volumen_m3: (c as any).volumen_m3,
        cot_tarifa_propuesta: (c as any).tarifa_propuesta,
        cot_moneda: (c as any).moneda,
        cot_fecha_emision: (c as any).fecha_emision,
        cot_fecha_vigencia: (c as any).fecha_vigencia,
        cot_notas: (c as any).notas,
      }).select().single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("cotizaciones")
        .update({ orden_id: orden.id, estado: "aprobada" }).eq("id", id);
      if (e2) throw e2;
      await copiarProductos({
        origenTabla: "cotizacion_productos", origenCol: "cotizacion_id", origenId: id,
        destinoTabla: "orden_productos", destinoCol: "orden_id", destinoId: orden.id,
      });
      return orden;
    },
    onSuccess: (o: any) => {
      toast.success(`Orden ${o.numero} creada`);
      qc.invalidateQueries({ queryKey: ["cotizacion", id] });
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      nav({ to: "/ordenes/$id", params: { id: o.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo convertir"),
  });

  if (!c || !form) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild><Link to="/cotizaciones"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {canEdit ? (
              <Input
                className="font-display text-2xl font-bold h-auto py-0 px-1 w-auto min-w-[8rem] max-w-[16rem] border-transparent hover:border-input focus-visible:border-input bg-transparent"
                value={form.numero}
                onChange={(e) => set("numero", e.target.value)}
              />
            ) : (
              c.numero
            )}
            <Badge className={COTIZACION_ESTADO_CLASS[form.estado] ?? ""}>{cotizacionEstadoLabel(form.estado)}</Badge>
            <BadgeVigencia fecha={form.fecha_vigencia} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Emitida el {fmtLocalDate(c.fecha_emision)}
            {(c as any).clientes?.nombre ? ` · ${(c as any).clientes.nombre}` : ""}
          </p>
        </div>
        {!readOnly && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" />Guardar cambios</Button>
        )}
        {ordenVinculada ? (
          <Button variant="outline" asChild>
            <Link to="/ordenes/$id" params={{ id: ordenVinculada.id }}>
              <PackagePlus className="h-4 w-4 mr-1" />Ver orden {ordenVinculada.numero} ↗
            </Link>
          </Button>
        ) : canEdit && form.estado === "aprobada" ? (
          <Button variant="outline" onClick={() => convertir.mutate()} disabled={convertir.isPending}>
            <PackagePlus className="h-4 w-4 mr-1" />{convertir.isPending ? "Convirtiendo…" : "Convertir a Orden"}
          </Button>
        ) : null}
      </div>

      {convertida && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Esta cotización fue convertida a una Orden y quedó en estado final de <strong>solo lectura</strong>.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Identificación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1.5"><Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COTIZACION_ESTADOS.map((e) => <SelectItem key={e} value={e}>{cotizacionEstadoLabel(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Cliente</Label>
            <Select value={form.cliente_id || undefined} onValueChange={(v) => set("cliente_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
              <SelectContent>{(clientes ?? []).map((cl: any) => <SelectItem key={cl.id} value={cl.id}>{cl.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Vendedor asignado</Label>
            <Select value={form.vendedor_id || undefined} onValueChange={(v) => set("vendedor_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Selecciona vendedor" /></SelectTrigger>
              <SelectContent>{(perfiles ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Datos de la cotización</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5"><Label>Tipo de mercancía</Label>
            <Select value={form.tipo_mercancia || undefined} onValueChange={(v) => set("tipo_mercancia", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
              <SelectContent>{TIPOS_MERCANCIA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Incoterm</Label>
            {readOnly
              ? <Input value={form.incoterm} readOnly />
              : <CatalogoAutocomplete tabla="catalogo_incoterms" value={form.incoterm} onChange={(v) => set("incoterm", v)} />}
          </div>
          <div className="grid gap-1.5"><Label>Origen</Label><Input value={form.origen} readOnly={readOnly} onChange={(e) => set("origen", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Destino</Label><Input value={form.destino} readOnly={readOnly} onChange={(e) => set("destino", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Peso estimado (kg)</Label><Input type="number" step="0.01" value={form.peso_kg ?? ""} readOnly={readOnly} onChange={(e) => set("peso_kg", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Volumen estimado (m³)</Label><Input type="number" step="0.01" value={form.volumen_m3 ?? ""} readOnly={readOnly} onChange={(e) => set("volumen_m3", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Tarifa propuesta</Label><Input type="number" step="0.01" value={form.tarifa_propuesta ?? ""} readOnly={readOnly} onChange={(e) => set("tarifa_propuesta", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Moneda</Label>
            <Select value={form.moneda} onValueChange={(v) => set("moneda", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["USD", "DOP", "EUR"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Fecha de emisión</Label><Input type="date" value={form.fecha_emision ?? ""} readOnly={readOnly} onChange={(e) => set("fecha_emision", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Fecha de vigencia</Label><Input type="date" value={form.fecha_vigencia ?? ""} readOnly={readOnly} onChange={(e) => set("fecha_vigencia", e.target.value)} /></div>
        </CardContent>
      </Card>

      <ProductosCard tabla="cotizacion_productos" parentId={id} readOnly={readOnly} />

      <Card>
        <CardHeader><CardTitle className="text-base">Pre-Liquidación estimada de impuestos</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <CalcularEstimadoButton cotizacionId={id} readOnly={readOnly} />
          <PreLiquidacionPdfButtonCotizacion cotizacionId={id} />
          <p className="text-xs text-muted-foreground w-full">
            Estimación referencial — sujeta a la liquidación oficial de la Dirección General de Aduanas (DGA).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notas / observaciones</CardTitle></CardHeader>
        <CardContent><Textarea rows={4} value={form.notas} readOnly={readOnly} onChange={(e) => set("notas", e.target.value)} /></CardContent>
      </Card>

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" />Guardar cambios</Button>
        </div>
      )}
    </div>
  );
}
