import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DgaCombobox } from "@/components/dga-combobox";

const searchSchema = z.object({ solicitud: z.string().optional(), orden: z.string().optional() });

export const Route = createFileRoute("/_authenticated/expedientes/nuevo")({
  validateSearch: searchSchema,
  component: NuevoExpediente,
});

const PUERTOS_ARRIBO = ["Puerto Multimodal Caucedo", "Puerto de Haina Oriental", "Puerto de Haina Occidental", "Puerto de Río Haina", "Puerto de Boca Chica", "Puerto de Manzanillo", "Puerto Plata", "AILA (Las Américas)", "AIC (Cibao)", "AIP (Punta Cana)", "Aeropuerto La Isabela"];

function NuevoExpediente() {
  const { solicitud: solicitudId, orden: ordenId } = useSearch({ from: Route.id });
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: sol, isLoading } = useQuery({
    queryKey: ["solicitud-convert", solicitudId],
    queryFn: async () => solicitudId
      ? (await supabase.from("solicitudes").select("*, clientes(id,nombre)").eq("id", solicitudId).maybeSingle()).data
      : null,
    enabled: !!solicitudId,
  });

  const { data: ord, isLoading: loadingOrden } = useQuery({
    queryKey: ["orden-convert", ordenId],
    queryFn: async () => ordenId
      ? (await supabase.from("ordenes").select("*, clientes(id,nombre), cotizaciones(id,numero)").eq("id", ordenId).maybeSingle()).data
      : null,
    enabled: !!ordenId,
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const [form, setForm] = useState({
    cliente_id: "",
    bl_awb: "",
    factura_comercial: "",
    puerto_arribo: "",
    puerto_arribo_codigo: "",
    fecha_compromiso: "",
    sla_dias: 5,
    observaciones: "",
    // datos originales (read-only, se guardan al crear)
    tipo_operacion: "",
    tipo_carga: "",
    pais_origen: "",
    pais_origen_codigo: "",
    incoterm: "",
    medio_transporte: "",
    contacto_solicitud: "",
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (sol && !loaded) {
      setForm((f) => ({
        ...f,
        cliente_id: sol.cliente_id ?? "",
        puerto_arribo: sol.puerto_llegada ?? "",
        puerto_arribo_codigo: (sol as any).puerto_llegada_codigo ?? "",
        fecha_compromiso: sol.fecha_arribo_est ?? "",
        observaciones: sol.observaciones ?? "",
        tipo_operacion: sol.tipo_operacion ?? "",
        tipo_carga: sol.tipo_carga ?? "",
        pais_origen: sol.origen ?? "",
        pais_origen_codigo: (sol as any).origen_codigo ?? "",
        incoterm: sol.incoterm ?? "",
        medio_transporte: sol.medio_transporte ?? "",
        contacto_solicitud: sol.contacto ?? "",
        bl_awb: sol.bl_awb ?? "",
        factura_comercial: sol.factura_comercial ?? "",
      }));
      setLoaded(true);
    }
  }, [sol, loaded]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const confirmar = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.fecha_compromiso) payload.fecha_compromiso = null;
      if (!payload.cliente_id) payload.cliente_id = null;
      if (solicitudId) payload.solicitud_id = solicitudId;
      const { data, error } = await supabase.from("expedientes").insert(payload).select().single();
      if (error) throw error;
      if (solicitudId) {
        await supabase.from("solicitudes").update({ estado: "convertida" }).eq("id", solicitudId);
        await supabase.from("auditoria").insert({ entidad: "solicitudes", entidad_id: solicitudId, accion: `convertida:${data.numero}` });
      }
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: data.id, accion: "creado" });
      return data;
    },
    onSuccess: (exp) => {
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      toast.success(`Expediente ${exp.numero} creado`);
      nav({ to: "/expedientes/$id", params: { id: exp.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (solicitudId && isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando solicitud…</div>;


  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to={sol ? "/solicitudes/$id" : "/expedientes"} params={sol ? { id: sol.id } : undefined as any}>
            <ArrowLeft className="h-4 w-4 mr-1" />Volver
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {sol ? "Convertir Solicitud en Expediente" : "Nuevo Expediente"}
            {sol && <Badge variant="outline">← {sol.numero}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sol ? "Revisa los datos precargados y confirma. El número del expediente se genera automáticamente." : "Completa los datos del nuevo expediente."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            nav({ to: sol ? "/solicitudes/$id" : "/expedientes", params: sol ? { id: sol.id } : (undefined as any) })
          }
        >
          <X className="h-4 w-4 mr-1" />Cancelar
        </Button>
        <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
          <Check className="h-4 w-4 mr-1" />{confirmar.isPending ? "Creando…" : "Confirmar conversión"}
        </Button>
      </div>



      {sol && (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center justify-between">
              <span>Datos de la Solicitud Original</span>
              <Link to="/solicitudes/$id" params={{ id: sol.id }} className="text-xs font-normal text-primary underline">
                {sol.numero} ↗
              </Link>
            </CardTitle>
            <p className="text-xs text-muted-foreground">Se conservan en el expediente como referencia (solo lectura).</p>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnly label="Tipo de operación" value={form.tipo_operacion} />
            <ReadOnly label="Tipo de carga" value={form.tipo_carga} />
            <ReadOnly label="Origen" value={form.pais_origen} />
            <ReadOnly label="Incoterm" value={form.incoterm} />
            <ReadOnly label="Medio de transporte" value={form.medio_transporte} />
            <ReadOnly label="Contacto" value={form.contacto_solicitud} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Información general</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>Cliente</Label>
            <Select value={form.cliente_id || undefined} onValueChange={(v) => set("cliente_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
              <SelectContent>
                {(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>BL / AWB / Guía</Label><Input value={form.bl_awb} onChange={(e) => set("bl_awb", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Factura comercial</Label><Input value={form.factura_comercial} onChange={(e) => set("factura_comercial", e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Puerto de arribo</Label>
            <DgaCombobox
              table="dga_puertos"
              value={form.puerto_arribo}
              codigo={form.puerto_arribo_codigo}
              onChange={(nombre, codigo) => setForm((f) => ({ ...f, puerto_arribo: nombre, puerto_arribo_codigo: codigo }))}
              placeholder="Buscar puerto (catálogo DGA)"
            />
            {form.puerto_arribo && !form.puerto_arribo_codigo && (
              <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el puerto del catálogo para el XML.</span>
            )}
          </div>
          <div className="grid gap-1.5"><Label>ETA / Fecha de llegada</Label><Input type="date" value={form.fecha_compromiso ?? ""} onChange={(e) => set("fecha_compromiso", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>SLA (días)</Label><Input type="number" value={form.sla_dias} onChange={(e) => set("sla_dias", Number(e.target.value))} /></div>
          <div className="grid gap-1.5 md:col-span-2 lg:col-span-3">
            <Label>Observaciones</Label>
            <Textarea rows={4} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Campos exclusivos del expediente</CardTitle>
          <p className="text-xs text-muted-foreground">Declaración DUA, Nº de despacho, Nº de permiso, Solicitud de permiso (VUCE), Etapa, mercancía, etc. se completan luego, desde el detalle del expediente.</p>
        </CardHeader>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() =>
          nav({ to: sol ? "/solicitudes/$id" : "/expedientes", params: sol ? { id: sol.id } : undefined as any })
        }>
          Cancelar
        </Button>

        <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
          <Check className="h-4 w-4 mr-1" />{confirmar.isPending ? "Creando…" : "Confirmar conversión"}
        </Button>
      </div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="h-9 px-3 rounded-md border bg-background/50 flex items-center text-sm">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
