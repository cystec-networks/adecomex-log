import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Save, Ship } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TerceroExtranjeroPicker } from "@/components/terceros-extranjeros";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/logistica/nueva")({
  head: () => ({ meta: [
    { title: "Nueva Operación Logística | ADECOMEX" },
    { name: "description", content: "Registro de una nueva operación de carga internacional." },
    { property: "og:title", content: "Nueva Operación Logística | ADECOMEX" },
    { property: "og:description", content: "Registro de una nueva operación de carga internacional." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: NuevaOperacion,
});

const EMPTY = {
  cliente_id: "", cotizacion_id: "", orden_id: "", expediente_id: "", tipo: "maritimo", responsable_id: "",
  proveedor_logistico: "", proveedor_logistico_tid: "", proveedor_email: "", proveedor_telefono: "", observaciones: "",
  producto: "", origen: "", destino: "", puerto_destino: "", buque: "", peso_bruto_kg: "", volumen_m3: "", incoterm: "",
};

function NuevaOperacion() {
  const nav = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY, value: string) => setForm((p) => ({ ...p, [key]: value }));
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes-activos-logistica"], queryFn: async () => {
    const { data, error } = await supabase.from("clientes").select("id,nombre").eq("activo", true).order("nombre"); if (error) throw error; return data ?? [];
  }});
  const { data: responsables = [] } = useQuery({ queryKey: ["encargados-logistica"], queryFn: async () => {
    const { data, error } = await supabase.rpc("listar_encargados_logistica"); if (error) throw error; return data ?? [];
  }});
  const { data: vinculos } = useQuery({ queryKey: ["vinculos-nueva-logistica", form.cliente_id], queryFn: async () => {
    const [c, o, e] = await Promise.all([
      supabase.from("cotizaciones").select("id,numero").is("eliminado_en", null).order("created_at", { ascending: false }).limit(100),
      supabase.from("ordenes").select("id,numero").is("eliminado_en", null).order("created_at", { ascending: false }).limit(100),
      supabase.from("expedientes").select("id,numero").is("eliminado_en", null).order("created_at", { ascending: false }).limit(100),
    ]); return { cotizaciones: c.data ?? [], ordenes: o.data ?? [], expedientes: e.data ?? [] };
  }});
  // Precarga de los datos de la carga desde la Cotización u Orden vinculada:
  // no volver a digitar lo que ya se capturó en el flujo comercial. Todo queda editable.
  const prefill = async (fuente: "cotizacion" | "orden", registroId: string) => {
    try {
      if (fuente === "cotizacion") {
        const [{ data: cot }, { data: prods }] = await Promise.all([
          supabase.from("cotizaciones").select("origen,destino,incoterm,peso_kg,volumen_m3").eq("id", registroId).maybeSingle(),
          supabase.from("cotizacion_productos").select("detalle_producto").eq("cotizacion_id", registroId).limit(1),
        ]);
        if (!cot) return;
        setForm((p) => ({
          ...p,
          producto: p.producto || (prods?.[0]?.detalle_producto ?? ""),
          origen: p.origen || (cot.origen ?? ""), destino: p.destino || (cot.destino ?? ""),
          incoterm: p.incoterm || (cot.incoterm ?? ""),
          peso_bruto_kg: p.peso_bruto_kg || (cot.peso_kg != null ? String(cot.peso_kg) : ""),
          volumen_m3: p.volumen_m3 || (cot.volumen_m3 != null ? String(cot.volumen_m3) : ""),
        }));
      } else {
        const [{ data: ord }, { data: prods }] = await Promise.all([
          supabase.from("ordenes").select("cot_origen,cot_destino,cot_incoterm,cot_peso_kg,cot_volumen_m3").eq("id", registroId).maybeSingle(),
          supabase.from("orden_productos").select("detalle_producto").eq("orden_id", registroId).limit(1),
        ]);
        if (!ord) return;
        setForm((p) => ({
          ...p,
          producto: p.producto || (prods?.[0]?.detalle_producto ?? ""),
          origen: p.origen || (ord.cot_origen ?? ""), destino: p.destino || (ord.cot_destino ?? ""),
          incoterm: p.incoterm || (ord.cot_incoterm ?? ""),
          peso_bruto_kg: p.peso_bruto_kg || (ord.cot_peso_kg != null ? String(ord.cot_peso_kg) : ""),
          volumen_m3: p.volumen_m3 || (ord.cot_volumen_m3 != null ? String(ord.cot_volumen_m3) : ""),
        }));
      }
      toast.info("Datos de la carga precargados — puedes ajustarlos.");
    } catch { /* la precarga es opcional */ }
  };

  const createMut = useMutation({ mutationFn: async () => {
    if (!form.cliente_id) throw new Error("Selecciona un cliente.");
    const num = (v: string) => (v === "" ? null : Number(v));
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("operaciones_logistica").insert({
      numero: "", cliente_id: form.cliente_id, tipo: form.tipo, responsable_id: form.responsable_id || null,
      cotizacion_id: form.cotizacion_id || null, orden_id: form.orden_id || null, expediente_id: form.expediente_id || null,
      proveedor_logistico: form.proveedor_logistico || null, proveedor_logistico_tid: form.proveedor_logistico_tid || null,
      proveedor_email: form.proveedor_email || null, proveedor_telefono: form.proveedor_telefono || null,
      producto: form.producto || null, origen: form.origen || null, destino: form.destino || null,
      puerto_destino: form.puerto_destino || null, buque: form.buque || null, incoterm: form.incoterm || null,
      peso_bruto_kg: num(form.peso_bruto_kg), volumen_m3: num(form.volumen_m3),
      observaciones: form.observaciones || null, creado_por: user.user?.id ?? null,
    }).select("id").single();
    if (error) throw error;
    await supabase.from("auditoria").insert({ entidad: "operaciones_logistica", entidad_id: data.id, accion: "creado", usuario_id: user.user?.id ?? null });
    return data;
  }, onSuccess: (data) => { toast.success("Operación creada"); nav({ to: "/logistica/$id", params: { id: data.id }, search: { nuevo: "1" } }); }, onError: (e: any) => toast.error(e.message) });

  const LinkSelect = ({ label, field, rows }: { label: string; field: "cotizacion_id" | "orden_id" | "expediente_id"; rows: { id: string; numero: string | null }[] }) => <div className="space-y-1.5"><Label>{label}</Label><Select value={form[field] || "none"} onValueChange={(v) => set(field, v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger><SelectContent><SelectItem value="none">Sin vincular</SelectItem>{rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.numero ?? "Sin número"}</SelectItem>)}</SelectContent></Select></div>;
  return <div className="p-6 max-w-5xl mx-auto space-y-6 bg-success/10 min-h-full">
    <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => history.back()}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="font-display text-2xl font-bold">Nueva Operación Logística</h1><p className="text-sm text-muted-foreground">Registra la carga desde su punto de origen.</p></div></div>
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Ship className="h-4 w-4" />Datos iniciales</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-4">
      <div className="space-y-1.5"><Label>Cliente *</Label><Select value={form.cliente_id} onValueChange={(v) => set("cliente_id", v)}><SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger><SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Tipo de transporte</Label><Select value={form.tipo} onValueChange={(v) => set("tipo", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maritimo">Marítimo</SelectItem><SelectItem value="aereo">Aéreo</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Responsable</Label><Select value={form.responsable_id || "none"} onValueChange={(v) => set("responsable_id", v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent><SelectItem value="none">Sin asignar</SelectItem>{responsables.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><TerceroExtranjeroPicker label="Proveedor logístico" onSelect={(t) => setForm((p) => ({ ...p, proveedor_logistico: t.nombre, proveedor_logistico_tid: t.tid ?? "" }))} /><Input value={form.proveedor_logistico} onChange={(e) => set("proveedor_logistico", e.target.value)} placeholder="Nombre del proveedor" /></div>
      <LinkSelect label="Cotización de Compras (opcional)" field="cotizacion_id" rows={vinculos?.cotizaciones ?? []} /><LinkSelect label="Orden de Compras (opcional)" field="orden_id" rows={vinculos?.ordenes ?? []} /><LinkSelect label="Expediente (opcional)" field="expediente_id" rows={vinculos?.expedientes ?? []} />
      <div className="space-y-1.5"><Label>TID del proveedor</Label><Input value={form.proveedor_logistico_tid} onChange={(e) => set("proveedor_logistico_tid", e.target.value)} /></div>
      <div className="md:col-span-2 space-y-1.5"><Label>Observaciones</Label><Textarea value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={4} /></div>
    </CardContent></Card>
    <div className="sticky bottom-4 flex justify-end"><Button size="lg" className="shadow-lg" disabled={createMut.isPending} onClick={() => createMut.mutate()}><Save className="h-4 w-4 mr-2" />{createMut.isPending ? "Creando…" : "Crear operación"}</Button></div>
  </div>;
}