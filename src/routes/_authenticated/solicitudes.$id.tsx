import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/solicitudes/$id")({
  component: DetalleSolicitud,
});

function DetalleSolicitud() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: s } = useQuery({
    queryKey: ["solicitud", id],
    queryFn: async () => (await supabase.from("solicitudes").select("*, clientes(*)").eq("id", id).maybeSingle()).data,
  });

  const updateEstado = useMutation({
    mutationFn: async (estado: string) => {
      const { error } = await supabase.from("solicitudes").update({ estado: estado as any }).eq("id", id);
      if (error) throw error;
      await supabase.from("auditoria").insert({ entidad: "solicitudes", entidad_id: id, accion: `cambio_estado:${estado}` });
    },
    onSuccess: () => { toast.success("Estado actualizado"); qc.invalidateQueries({ queryKey: ["solicitud", id] }); },
  });

  const crearExpediente = useMutation({
    mutationFn: async () => {
      if (!s) throw new Error("No hay solicitud");
      const { data, error } = await supabase.from("expedientes").insert({
        solicitud_id: s.id,
        cliente_id: s.cliente_id,
        responsable_id: s.responsable_id,
      }).select().single();
      if (error) throw error;
      await supabase.from("solicitudes").update({ estado: "convertida" }).eq("id", s.id);
      return data;
    },
    onSuccess: (exp) => {
      toast.success(`Expediente ${exp.numero} creado`);
      nav({ to: "/expedientes/$id", params: { id: exp.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!s) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/solicitudes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            {s.numero}
            <Badge className="bg-primary/10 text-primary border-transparent">{s.estado?.replace("_", " ")}</Badge>
            <Badge variant="outline">{s.prioridad}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">Registrada el {new Date(s.created_at).toLocaleString("es-DO")}</p>
        </div>
        <Select value={s.estado} onValueChange={(v) => updateEstado.mutate(v)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["recibida","en_revision","aprobada","rechazada","convertida"].map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        {s.estado !== "convertida" && (
          <Button onClick={() => crearExpediente.mutate()} disabled={crearExpediente.isPending}>
            <FolderPlus className="h-4 w-4 mr-1" />Crear expediente
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <Field label="Razón social" value={s.clientes?.nombre} />
            <Field label="RNC" value={s.clientes?.rnc} />
            <Field label="Contacto" value={s.contacto ?? s.clientes?.contacto} />
            <Field label="Email" value={s.clientes?.email} />
            <Field label="Teléfono" value={s.clientes?.telefono} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Operación</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <Field label="Tipo de operación" value={s.tipo_operacion} />
            <Field label="Tipo de carga" value={s.tipo_carga} />
            <Field label="Origen" value={s.origen} />
            <Field label="Puerto de llegada" value={s.puerto_llegada} />
            <Field label="Fecha estimada arribo" value={s.fecha_arribo_est ? new Date(s.fecha_arribo_est).toLocaleDateString("es-DO") : null} />
            <Field label="Incoterm" value={s.incoterm} />
            <Field label="Medio de transporte" value={s.medio_transporte} />
          </CardContent>
        </Card>
      </div>

      {s.observaciones && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observaciones</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{s.observaciones}</CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-40 shrink-0">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}
