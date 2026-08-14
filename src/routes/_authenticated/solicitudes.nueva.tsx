import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CatalogoAutocomplete } from "@/components/catalogo-autocomplete";
import { DgaCombobox } from "@/components/dga-combobox";
import { ProductosCard } from "@/components/productos-card";


const searchSchema = z.object({ orden: z.string().optional() });

export const Route = createFileRoute("/_authenticated/solicitudes/nueva")({
  validateSearch: searchSchema,
  component: NuevaSolicitud,
});

function ReadOnly({ label, value }: { label: string; value?: any }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value === null || value === undefined || value === "" ? "—" : String(value)}</span>
    </div>
  );
}

function NuevaSolicitud() {
  const nav = useNavigate();
  const { orden: ordenId } = useSearch({ from: Route.id });
  const [form, setForm] = useState<any>({
    cliente_id: "", contacto: "", tipo_operacion: "Importación", tipo_carga: "",
    origen: "", origen_codigo: "", puerto_llegada: "", puerto_llegada_codigo: "",
    fecha_arribo_est: "", incoterm: "", medio_transporte: "Marítimo",
    prioridad: "media", observaciones: "", bl_awb: "", factura_comercial: "",
  });
  const [productos, setProductos] = useState<any[]>([]);

  const { data: clientes } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const { data: ord, isLoading: loadingOrden } = useQuery({
    queryKey: ["orden-solicitud", ordenId],
    enabled: !!ordenId,
    queryFn: async () => ordenId
      ? (await supabase.from("ordenes").select("*, clientes(id,nombre)").eq("id", ordenId).maybeSingle()).data
      : null,
  });

  const { data: productosOrden, isLoading: loadingProductosOrden } = useQuery({
    queryKey: ["orden-productos", ordenId],
    enabled: !!ordenId,
    queryFn: async () => ordenId
      ? (await supabase.from("orden_productos").select("*").eq("orden_id", ordenId).is("deleted_at", null).order("item_no")).data ?? []
      : [],
  });


  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (ord && !loadingProductosOrden && !loaded) {
      setForm((f: any) => ({
        ...f,
        cliente_id: (ord as any).cliente_id ?? "",
        tipo_carga: (ord as any).cot_tipo_mercancia ?? "",
        origen: (ord as any).cot_origen ?? "",
        incoterm: (ord as any).cot_incoterm ?? "",
        observaciones: (ord as any).notas ?? "",
        puerto_llegada: (ord as any).cot_destino ?? "",
      }));
      const precargados = (productosOrden ?? []).map((p: any, i: number) => ({
        id: crypto.randomUUID(),
        item_no: i + 1,
        codigo_arancelario: p.codigo_arancelario,
        detalle_producto: p.detalle_producto,
        unidad_medida: p.unidad_medida,
        unidad_codigo: p.unidad_codigo,
        cantidad: p.cantidad,
        peso: p.peso,
        valor_fob: p.valor_fob,
        product_code: p.product_code,
        cod_marca: p.cod_marca,
        marca: p.marca,
        cod_modelo: p.cod_modelo,
        modelo: p.modelo,
        especificaciones: p.especificaciones,
        pct_gravamen: p.pct_gravamen,
        aplica_isc: p.aplica_isc,
        pct_isc: p.pct_isc,
        pct_itbis: p.pct_itbis,
      }));
      setProductos(precargados);
      setLoaded(true);
    }
  }, [ord, productosOrden, loadingProductosOrden, loaded]);


  const create = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      if (!payload.cliente_id) delete payload.cliente_id;
      if (!payload.fecha_arribo_est) delete payload.fecha_arribo_est;
      const { data, error } = await supabase.from("solicitudes").insert(payload).select().single();
      if (error) throw error;
      if (productos.length > 0) {
        const filas = productos.map(({ id, ...p }: any, i: number) => ({
          ...p, solicitud_id: data.id, item_no: i + 1,
        }));
        const { error: eProd } = await (supabase.from("solicitud_productos") as any).insert(filas);
        if (eProd) throw eProd;
      }
      if (ordenId) {
        await supabase.from("ordenes").update({ solicitud_id: data.id }).eq("id", ordenId);
        await supabase.from("auditoria").insert({ entidad: "ordenes", entidad_id: ordenId, accion: `solicitud:${data.numero}` });
      }
      return data;
    },
    onSuccess: (s) => {
      toast.success(`Solicitud ${s.numero} creada`);
      nav({ to: "/solicitudes/$id", params: { id: s.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });


  if (ordenId && loadingOrden) return <div className="p-8 text-center text-muted-foreground">Cargando orden…</div>;

  const volver = () =>
    ord ? nav({ to: "/ordenes/$id", params: { id: ord.id } }) : nav({ to: "/solicitudes" });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={volver}><ArrowLeft className="h-4 w-4 mr-1" />Volver</Button>
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {ord ? "Convertir Orden en Solicitud" : "Nueva solicitud"}
            {ord && <Badge variant="outline">← {ord.numero}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ord ? "Revisa los datos y productos precargados de la Orden y confirma la conversión." : "Formulario rápido de captura."}
          </p>
        </div>
      </div>

      {ord && (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center justify-between">
              <span>Datos de la Orden Original</span>
              <Link to="/ordenes/$id" params={{ id: ord.id }} className="text-xs font-normal text-primary underline">
                {ord.numero} ↗
              </Link>
            </CardTitle>
            <p className="text-xs text-muted-foreground">Referencia de la Orden y su Cotización (solo lectura).</p>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnly label="N° de Orden" value={ord.numero} />
            <ReadOnly label="N° de Cotización" value={(ord as any).cot_numero} />
            <ReadOnly label="Cliente" value={(ord as any).clientes?.nombre} />
            <ReadOnly label="Tipo de mercancía" value={(ord as any).cot_tipo_mercancia} />
            <ReadOnly label="Origen" value={(ord as any).cot_origen} />
            <ReadOnly label="Incoterm" value={(ord as any).cot_incoterm} />
          </CardContent>
        </Card>
      )}

      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del cliente</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Cliente</Label>
              <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente…" /></SelectTrigger>
                <SelectContent>
                  {(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Contacto</Label><CatalogoAutocomplete tabla="catalogo_contactos" value={form.contacto} onChange={(v) => setForm({ ...form, contacto: v })} /></div>
            <div className="grid gap-1.5">
              <Label>Prioridad</Label>
              <Select value={form.prioridad} onValueChange={(v) => setForm({ ...form, prioridad: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Datos de la operación</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5"><Label>Tipo de operación</Label>
              <Select value={form.tipo_operacion} onValueChange={(v) => setForm({ ...form, tipo_operacion: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {["Importación","Exportación","Otros"].map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Tipo de carga</Label>
              <CatalogoAutocomplete tabla="catalogo_tipos_carga" value={form.tipo_carga} onChange={(v) => setForm({ ...form, tipo_carga: v })} placeholder="Escribe o selecciona…" />
            </div>
            <div className="grid gap-1.5"><Label>Origen</Label>
              <DgaCombobox
                table="dga_paises"
                value={form.origen}
                codigo={form.origen_codigo}
                onChange={(nombre, codigo) => setForm({ ...form, origen: nombre, origen_codigo: codigo })}
                placeholder="Selecciona país (catálogo DGA)"
              />
              {form.origen && !form.origen_codigo && (
                <span className="text-[11px] text-amber-700">Sin código DGA.</span>
              )}
            </div>
            <div className="grid gap-1.5"><Label>Puerto / Aeropuerto de llegada</Label>
              <DgaCombobox
                table="dga_puertos"
                value={form.puerto_llegada}
                codigo={form.puerto_llegada_codigo}
                filterCodPais={form.origen_codigo || undefined}
                onChange={(nombre, codigo) => setForm({ ...form, puerto_llegada: nombre, puerto_llegada_codigo: codigo })}
                placeholder="Buscar puerto (catálogo DGA)"
              />
              {form.puerto_llegada && !form.puerto_llegada_codigo && (
                <span className="text-[11px] text-amber-700">Sin código DGA.</span>
              )}
            </div>
            <div className="grid gap-1.5"><Label>Fecha estimada de arribo</Label><Input type="date" value={form.fecha_arribo_est} onChange={(e) => setForm({ ...form, fecha_arribo_est: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Incoterm</Label>
              <CatalogoAutocomplete tabla="catalogo_incoterms" value={form.incoterm} onChange={(v) => setForm({ ...form, incoterm: v })} placeholder="Escribe o selecciona…" />
            </div>
            <div className="grid gap-1.5"><Label>Medio de transporte</Label>
              <Select value={form.medio_transporte} onValueChange={(v) => setForm({ ...form, medio_transporte: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Marítimo","Aéreo","Terrestre","Multimodal"].map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>BL / AWB</Label><Input value={form.bl_awb} onChange={(e) => setForm({ ...form, bl_awb: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Factura comercial</Label><Input value={form.factura_comercial} onChange={(e) => setForm({ ...form, factura_comercial: e.target.value })} /></div>
            <div className="grid gap-1.5 md:col-span-2"><Label>Observaciones</Label><Textarea rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
          </CardContent>
        </Card>

        <ProductosCard tabla="solicitud_productos" items={productos} onItemsChange={setProductos} />



        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={volver}>Cancelar</Button>
          <Button type="submit" disabled={create.isPending}>Registrar solicitud</Button>
        </div>
      </form>
    </div>
  );
}
