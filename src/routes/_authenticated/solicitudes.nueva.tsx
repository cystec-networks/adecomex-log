import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CatalogoAutocomplete } from "@/components/catalogo-autocomplete";

export const Route = createFileRoute("/_authenticated/solicitudes/nueva")({
  component: NuevaSolicitud,
});

function NuevaSolicitud() {
  const nav = useNavigate();
  const [form, setForm] = useState<any>({
    cliente_id: "", contacto: "", tipo_operacion: "Importación", tipo_carga: "",
    origen: "", puerto_llegada: "", fecha_arribo_est: "", incoterm: "", medio_transporte: "Marítimo",
    prioridad: "media", observaciones: "", bl_awb: "", factura_comercial: "",
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      if (!payload.cliente_id) delete payload.cliente_id;
      if (!payload.fecha_arribo_est) delete payload.fecha_arribo_est;
      const { data, error } = await supabase.from("solicitudes").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      toast.success(`Solicitud ${s.numero} creada`);
      nav({ to: "/solicitudes/$id", params: { id: s.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/solicitudes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div>
          <h1 className="font-display text-2xl font-bold">Nueva solicitud</h1>
          <p className="text-sm text-muted-foreground">Formulario rápido de captura.</p>
        </div>
      </div>

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
              <CatalogoAutocomplete tabla="catalogo_paises" value={form.origen} onChange={(v) => setForm({ ...form, origen: v })} placeholder="Escribe o selecciona…" />
            </div>
            <div className="grid gap-1.5"><Label>Puerto / Aeropuerto de llegada</Label>
              <Select value={form.puerto_llegada} onValueChange={(v) => setForm({ ...form, puerto_llegada: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {["Puerto de Haina","Puerto de Caucedo","Puerto Multimodal Caucedo","Puerto de Río Haina","Puerto de Puerto Plata","Puerto de Manzanillo","Puerto de Boca Chica","AILA (Las Américas)","Aeropuerto del Cibao (STI)","Aeropuerto de Punta Cana","Aeropuerto de Puerto Plata","Frontera Jimaní","Frontera Dajabón"].map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div className="grid gap-1.5 md:col-span-2"><Label>Observaciones</Label><Textarea rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild><Link to="/solicitudes">Cancelar</Link></Button>
          <Button type="submit" disabled={create.isPending}>Registrar solicitud</Button>
        </div>
      </form>
    </div>
  );
}
