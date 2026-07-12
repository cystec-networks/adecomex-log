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
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/solicitudes/$id")({
  component: DetalleSolicitud,
});

const ESTADOS = ["recibida", "en_revision", "aprobada", "rechazada", "convertida"];
const PRIORIDADES = ["baja", "media", "alta", "urgente"];

function DetalleSolicitud() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  

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
        puerto_llegada: s.puerto_llegada ?? "",
        fecha_arribo_est: s.fecha_arribo_est ?? "",
        incoterm: s.incoterm ?? "",
        medio_transporte: s.medio_transporte ?? "",
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
            <div className="grid gap-1.5"><Label>Contacto</Label><Input value={form.contacto} onChange={(e) => set("contacto", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Operación</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5"><Label>Tipo de operación</Label><Input value={form.tipo_operacion} onChange={(e) => set("tipo_operacion", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Tipo de carga</Label><Input value={form.tipo_carga} onChange={(e) => set("tipo_carga", e.target.value)} /></div>
            <div className="grid gap-1.5 grid-cols-2 md:grid-cols-2"><div className="grid gap-1.5"><Label>Origen</Label><Input value={form.origen} onChange={(e) => set("origen", e.target.value)} /></div><div className="grid gap-1.5"><Label>Puerto llegada</Label><Input value={form.puerto_llegada} onChange={(e) => set("puerto_llegada", e.target.value)} /></div></div>
            <div className="grid gap-1.5 grid-cols-2"><div className="grid gap-1.5"><Label>Fecha estimada arribo</Label><Input type="date" value={form.fecha_arribo_est ?? ""} onChange={(e) => set("fecha_arribo_est", e.target.value)} /></div><div className="grid gap-1.5"><Label>Incoterm</Label><Input value={form.incoterm} onChange={(e) => set("incoterm", e.target.value)} /></div></div>
            <div className="grid gap-1.5"><Label>Medio de transporte</Label><Input value={form.medio_transporte} onChange={(e) => set("medio_transporte", e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

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
