import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FolderPlus, Save } from "lucide-react";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { EmailButton } from "@/components/email-button";
import { SearchEmailButton } from "@/components/search-email-button";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { CatalogoAutocomplete } from "@/components/catalogo-autocomplete";
import { DgaCombobox } from "@/components/dga-combobox";
import { useMyRoles } from "@/lib/auth-hooks";
import { ProductosCard } from "@/components/productos-card";
import { copiarProductos } from "@/lib/copiar-productos";
import { ORDEN_ESTADO_CLASS, ordenEstadoLabel } from "@/lib/estados-orden";

export const Route = createFileRoute("/_authenticated/solicitudes/$id")({
  component: DetalleSolicitud,
});

const ESTADOS = ["recibida", "en_revision", "aprobada", "rechazada", "convertida"];
const PRIORIDADES = ["baja", "media", "alta", "urgente"];

function DetalleSolicitud() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "vendedor" || r === "operaciones");
  
  

  const { data: s } = useQuery({
    queryKey: ["solicitud", id],
    queryFn: async () => (await supabase.from("solicitudes").select("*, clientes(*)").eq("id", id).maybeSingle()).data,
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (s && !form) {
      setForm({
        numero: s.numero ?? "",
        estado: s.estado,
        prioridad: s.prioridad,
        cliente_id: s.cliente_id ?? "",
        contacto: s.contacto ?? "",
        tipo_operacion: s.tipo_operacion ?? "",
        tipo_carga: s.tipo_carga ?? "",
        origen: s.origen ?? "",
        origen_codigo: s.origen_codigo ?? "",
        puerto_llegada: s.puerto_llegada ?? "",
        puerto_llegada_codigo: s.puerto_llegada_codigo ?? "",
        fecha_arribo_est: s.fecha_arribo_est ?? "",
        incoterm: s.incoterm ?? "",
        medio_transporte: s.medio_transporte ?? "",
        bl_awb: s.bl_awb ?? "",
        factura_comercial: s.factura_comercial ?? "",
        observaciones: s.observaciones ?? "",
      });
    }
  }, [s]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.fecha_arribo_est) payload.fecha_arribo_est = null;
      if (!payload.cliente_id) payload.cliente_id = null;
      const { error } = await supabase.from("solicitudes").update(payload).eq("id", id);
      if (error) throw error;
      await supabase.from("auditoria").insert({ entidad: "solicitudes", entidad_id: id, accion: "editada" });
    },
    onSuccess: () => { toast.success("Solicitud actualizada"); qc.invalidateQueries({ queryKey: ["solicitud", id] }); qc.invalidateQueries({ queryKey: ["solicitudes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: expedienteVinculado } = useQuery({
    queryKey: ["expediente-de-solicitud", id],
    queryFn: async () => (await supabase.from("expedientes").select("id,numero").eq("solicitud_id", id).maybeSingle()).data,
    enabled: !!s,
  });

  const { data: ordenesVinculadas } = useQuery({
    queryKey: ["ordenes-de-solicitud", id],
    queryFn: async () =>
      (await supabase
        .from("ordenes")
        .select("id,numero,estado,cot_tipo_mercancia,clientes(nombre)")
        .eq("solicitud_id", id)
        .order("numero")).data ?? [],
  });

  const { data: ordenesLibres } = useQuery({
    queryKey: ["ordenes-libres"],
    queryFn: async () =>
      (await supabase
        .from("ordenes")
        .select("id,numero,clientes(nombre)")
        .is("solicitud_id", null)
        .order("numero")).data ?? [],
  });

  const refreshOrdenes = () => {
    qc.invalidateQueries({ queryKey: ["ordenes-de-solicitud", id] });
    qc.invalidateQueries({ queryKey: ["ordenes-libres"] });
    qc.invalidateQueries({ queryKey: ["ordenes"] });
  };

  const agregarOrden = useMutation({
    mutationFn: async (ordenId: string) => {
      const { data: orden } = await supabase.from("ordenes").select("estado").eq("id", ordenId).maybeSingle();
      const { error } = await supabase.from("ordenes").update({ solicitud_id: id }).eq("id", ordenId);
      if (error) throw error;
      if (orden?.estado === "abierta") {
        await supabase.from("ordenes").update({ estado: "en_transito" }).eq("id", ordenId).eq("estado", "abierta");
      }
      await supabase.from("auditoria").insert({
        entidad: "ordenes",
        entidad_id: ordenId,
        accion: `consolidada:${s?.numero ?? ""}`,
      });
      await copiarProductos({
        origenTabla: "orden_productos", origenCol: "orden_id", origenId: ordenId,
        destinoTabla: "solicitud_productos", destinoCol: "solicitud_id", destinoId: id,
      });
    },
    onSuccess: () => {
      toast.success("Orden agregada a la solicitud");
      refreshOrdenes();
      qc.invalidateQueries({ queryKey: ["solicitud_productos", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const quitarOrden = useMutation({
    mutationFn: async (ordenId: string) => {
      const { error } = await supabase.from("ordenes").update({ solicitud_id: null }).eq("id", ordenId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Orden desvinculada"); refreshOrdenes(); },
    onError: (e: any) => toast.error(e.message),
  });



  if (!s || !form) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild><Link to="/solicitudes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {form.numero || s.numero}
            <Badge className="bg-primary/10 text-primary border-transparent">{form.estado?.replace("_", " ")}</Badge>
            <Badge variant="outline">{form.prioridad}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>Registrada el {new Date(s.created_at).toLocaleString("es-DO")}</span>
            {s.clientes && (
              <>
                <span>·</span>
                <span>{s.clientes.nombre}</span>
                <WhatsAppButton
                  phone={s.clientes.telefono}
                  clientName={s.clientes.nombre}
                  recordType="Solicitud"
                  recordNumber={form.numero || s.numero}
                  variant="icon"
                />
                <EmailButton
                  email={(s.clientes as any).email}
                  clientName={s.clientes.nombre}
                  recordType="Solicitud"
                  recordNumber={form.numero || s.numero}
                  variant="icon"
                />
                <SearchEmailButton
                  recordType="Solicitud"
                  recordNumber={form.numero || s.numero}
                  variant="icon"
                />
              </>
            )}
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" />Guardar cambios</Button>
        {form.estado === "convertida" && expedienteVinculado ? (
          <Button variant="outline" asChild>
            <Link to="/expedientes/$id" params={{ id: expedienteVinculado.id }}>
              <FolderPlus className="h-4 w-4 mr-1" />Ver expediente {expedienteVinculado.numero} ↗
            </Link>
          </Button>
        ) : form.estado !== "convertida" ? (
          <Button variant="outline" asChild>
            <Link to="/expedientes/nuevo" search={{ solicitud: id }}>
              <FolderPlus className="h-4 w-4 mr-1" />Convertir en Expediente
            </Link>
          </Button>
        ) : null}

      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Identificación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1.5"><Label>Número / ID</Label><Input value={form.numero} onChange={(e) => set("numero", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Prioridad</Label>
            <Select value={form.prioridad} onValueChange={(v) => set("prioridad", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Órdenes consolidadas</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {(ordenesVinculadas ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin órdenes vinculadas</p>
          ) : (
            <div className="grid gap-2">
              {(ordenesVinculadas ?? []).map((o: any) => (
                <div key={o.id} className="flex items-center gap-3 flex-wrap rounded-md border p-3">
                  <Link to="/ordenes/$id" params={{ id: o.id }} className="font-medium text-primary underline">
                    {o.numero}
                  </Link>
                  <span className="text-sm text-muted-foreground">{o.clientes?.nombre ?? "Sin cliente"}</span>
                  <span className="text-sm text-muted-foreground">{o.cot_tipo_mercancia ?? "—"}</span>
                  <Badge className={ORDEN_ESTADO_CLASS[o.estado] ?? ""}>{ordenEstadoLabel(o.estado)}</Badge>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive"
                      disabled={quitarOrden.isPending}
                      onClick={() => {
                        if (confirm(`¿Quitar la orden ${o.numero} de esta solicitud?`)) quitarOrden.mutate(o.id);
                      }}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="grid gap-1.5 md:max-w-md">
              <Label>Agregar orden a esta solicitud</Label>
              <Select value="" onValueChange={(v) => agregarOrden.mutate(v)} disabled={agregarOrden.isPending}>
                <SelectTrigger><SelectValue placeholder="Selecciona una orden sin consolidar" /></SelectTrigger>
                <SelectContent>
                  {(ordenesLibres ?? []).length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No hay órdenes disponibles</div>
                  ) : (
                    (ordenesLibres ?? []).map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.numero} · {o.clientes?.nombre ?? "Sin cliente"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5"><Label>Cliente</Label>
              <Select value={form.cliente_id || undefined} onValueChange={(v) => set("cliente_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>{(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Contacto</Label><CatalogoAutocomplete tabla="catalogo_contactos" value={form.contacto} onChange={(v) => set("contacto", v)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Operación</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5"><Label>Tipo de operación</Label><Input value={form.tipo_operacion} onChange={(e) => set("tipo_operacion", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Tipo de carga</Label><CatalogoAutocomplete tabla="catalogo_tipos_carga" value={form.tipo_carga} onChange={(v) => set("tipo_carga", v)} /></div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-2">
              <div className="grid gap-1.5"><Label>Origen</Label>
                <DgaCombobox
                  table="dga_paises"
                  value={form.origen}
                  codigo={form.origen_codigo}
                  onChange={(nombre, codigo) => setForm((f: any) => ({ ...f, origen: nombre, origen_codigo: codigo }))}
                  placeholder="Selecciona país (catálogo DGA)"
                />
                {form.origen && !form.origen_codigo && <span className="text-[11px] text-amber-700">Sin código DGA.</span>}
              </div>
              <div className="grid gap-1.5"><Label>Puerto llegada</Label>
                <DgaCombobox
                  table="dga_puertos"
                  value={form.puerto_llegada}
                  codigo={form.puerto_llegada_codigo}
                  filterCodPais={form.origen_codigo || undefined}
                  onChange={(nombre, codigo) => setForm((f: any) => ({ ...f, puerto_llegada: nombre, puerto_llegada_codigo: codigo }))}
                  placeholder="Buscar puerto (catálogo DGA)"
                />
                {form.puerto_llegada && !form.puerto_llegada_codigo && <span className="text-[11px] text-amber-700">Sin código DGA.</span>}
              </div>
            </div>
            <div className="grid gap-3 grid-cols-2"><div className="grid gap-1.5"><Label>Fecha estimada arribo</Label><Input type="date" value={form.fecha_arribo_est ?? ""} onChange={(e) => set("fecha_arribo_est", e.target.value)} /></div><div className="grid gap-1.5"><Label>Incoterm</Label><CatalogoAutocomplete tabla="catalogo_incoterms" value={form.incoterm} onChange={(v) => set("incoterm", v)} /></div></div>
            <div className="grid gap-1.5"><Label>Medio de transporte</Label><Input value={form.medio_transporte} onChange={(e) => set("medio_transporte", e.target.value)} /></div>
            <div className="grid gap-3 grid-cols-2"><div className="grid gap-1.5"><Label>BL / AWB</Label><Input value={form.bl_awb} onChange={(e) => set("bl_awb", e.target.value)} /></div><div className="grid gap-1.5"><Label>Factura comercial</Label><Input value={form.factura_comercial} onChange={(e) => set("factura_comercial", e.target.value)} /></div></div>
          </CardContent>
        </Card>
      </div>

      <ProductosCard tabla="solicitud_productos" parentId={id} />

      <Card>
        <CardHeader><CardTitle className="text-base">Observaciones</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" />Guardar cambios</Button>
      </div>
    </div>
  );
}
