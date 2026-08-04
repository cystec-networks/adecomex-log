import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";
import { PrestamosEmpleado } from "@/components/prestamos-empleado";
import { RecibosPagoEmpleado } from "@/components/recibos-pago-empleado";

import { ArrowLeft, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rrhh/empleados/$id")({
  component: EmpleadoDetalle,
});

const TIPO_CONTRATO = [
  { v: "indefinido", l: "Indefinido" },
  { v: "tiempo_determinado", l: "Tiempo determinado" },
  { v: "por_cierta_obra", l: "Por cierta obra o servicio" },
  { v: "entrenamiento", l: "Entrenamiento" },
];

const TIPO_DOC = [
  { v: "cedula", l: "Cédula" },
  { v: "contrato_firmado", l: "Contrato firmado" },
  { v: "inscripcion_tss", l: "Inscripción TSS" },
  { v: "curriculum", l: "Currículum" },
  { v: "referencias", l: "Referencias" },
  { v: "certificado_medico", l: "Certificado médico" },
  { v: "otros", l: "Otros" },
];

function EmpleadoDetalle() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);

  const { data: emp } = useQuery({
    queryKey: ["rrhh-empleado", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("empleados").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => { if (emp && !form) setForm({ ...emp }); }, [emp]);

  const save = useMutation({
    mutationFn: async () => {
      const clean: any = { ...form };
      delete clean.id;
      delete clean.created_at;
      delete clean.updated_at;
      delete clean.created_by;
      delete clean.deleted_at;
      delete clean.deleted_by;
      for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
      if (clean.salario_base != null) clean.salario_base = Number(clean.salario_base);
      const { error } = await (supabase as any).from("empleados").update(clean).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cambios guardados");
      qc.invalidateQueries({ queryKey: ["rrhh-empleado", id] });
      qc.invalidateQueries({ queryKey: ["rrhh-empleados"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!emp || !form) {
    return <div className="p-6">Cargando…</div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/rrhh/empleados"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">{emp.nombre}</h1>
          <div className="text-sm text-muted-foreground flex gap-3">
            <span>{emp.cargo ?? "—"}</span>
            <span>·</span>
            <span>{emp.departamento ?? "—"}</span>
            <Badge variant="outline">{emp.estado}</Badge>
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-1" />{save.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="vacaciones">Vacaciones</TabsTrigger>
          <TabsTrigger value="prestamos">Préstamos</TabsTrigger>
          <TabsTrigger value="recibos">Recibos de Pago</TabsTrigger>
        </TabsList>



        <TabsContent value="info" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Datos personales</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Campo label="Nombre completo *"><Input value={form.nombre ?? ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Campo>
              <Campo label="Cédula"><Input value={form.cedula ?? ""} onChange={(e) => setForm({ ...form, cedula: e.target.value })} /></Campo>
              <Campo label="Fecha nacimiento"><Input type="date" value={form.fecha_nacimiento ?? ""} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} /></Campo>
              <Campo label="Teléfono"><Input value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Campo>
              <Campo label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
              <Campo label="Dirección"><Input value={form.direccion ?? ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></Campo>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Datos laborales</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <Campo label="Cargo"><Input value={form.cargo ?? ""} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></Campo>
              <Campo label="Departamento"><Input value={form.departamento ?? ""} onChange={(e) => setForm({ ...form, departamento: e.target.value })} /></Campo>
              <Campo label="Tipo contrato">
                <Select value={form.tipo_contrato ?? "indefinido"} onValueChange={(v) => setForm({ ...form, tipo_contrato: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPO_CONTRATO.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </Campo>
              <Campo label="Fecha ingreso *"><Input type="date" value={form.fecha_ingreso ?? ""} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} /></Campo>
              <Campo label="Fecha baja"><Input type="date" value={form.fecha_baja ?? ""} onChange={(e) => setForm({ ...form, fecha_baja: e.target.value })} /></Campo>
              <Campo label="Estado">
                <Select value={form.estado ?? "activo"} onValueChange={(v) => setForm({ ...form, estado: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                    <SelectItem value="baja">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
              {form.fecha_baja && (
                <div className="col-span-3">
                  <Campo label="Motivo de baja"><Input value={form.motivo_baja ?? ""} onChange={(e) => setForm({ ...form, motivo_baja: e.target.value })} /></Campo>
                </div>
              )}
              <Campo label="Salario base"><Input type="number" step="0.01" value={form.salario_base ?? ""} onChange={(e) => setForm({ ...form, salario_base: e.target.value })} /></Campo>
              <Campo label="Moneda"><Input value={form.moneda ?? "DOP"} onChange={(e) => setForm({ ...form, moneda: e.target.value.toUpperCase() })} /></Campo>
              <div />
              <Campo label="Número TSS"><Input value={form.numero_tss ?? ""} onChange={(e) => setForm({ ...form, numero_tss: e.target.value })} /></Campo>
              <Campo label="AFP"><Input value={form.afp ?? ""} onChange={(e) => setForm({ ...form, afp: e.target.value })} /></Campo>
              <Campo label="ARS"><Input value={form.ars ?? ""} onChange={(e) => setForm({ ...form, ars: e.target.value })} /></Campo>
              <div className="col-span-3">
                <Campo label="Notas"><Textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Campo>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos" className="mt-4">
          <DocumentosTab empleadoId={id} />
        </TabsContent>

        <TabsContent value="vacaciones" className="mt-4">
          <VacacionesTab empleadoId={id} fechaIngreso={emp.fecha_ingreso} />
        </TabsContent>

        <TabsContent value="prestamos" className="mt-4">
          <PrestamosEmpleado empleadoId={id} />
        </TabsContent>
      </Tabs>

    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function DocumentosTab({ empleadoId }: { empleadoId: string }) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState("cedula");
  const [descripcion, setDescripcion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: docs } = useQuery({
    queryKey: ["rrhh-docs", empleadoId],
    queryFn: async () =>
      ((await (supabase as any).from("empleado_documentos").select("*").eq("empleado_id", empleadoId).order("fecha_subida", { ascending: false })).data ?? []) as any[],
  });

  const upload = async () => {
    if (!file) { toast.error("Selecciona un archivo"); return; }
    setUploading(true);
    try {
      const path = `empleados/${empleadoId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documentos").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("empleado_documentos").insert({
        empleado_id: empleadoId, tipo, notas: descripcion || null, storage_path: path, created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Documento subido");
      setFile(null); setDescripcion("");
      qc.invalidateQueries({ queryKey: ["rrhh-docs", empleadoId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setUploading(false); }
  };

  const del = useMutation({
    mutationFn: async (d: any) => {
      await supabase.storage.from("documentos").remove([d.storage_path]);
      const { error } = await (supabase as any).from("empleado_documentos").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento eliminado");
      qc.invalidateQueries({ queryKey: ["rrhh-docs", empleadoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Documentos del empleado</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3 items-end">
          <div className="grid gap-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPO_DOC.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 col-span-2">
            <Label className="text-xs">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Archivo</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <Button onClick={upload} disabled={uploading || !file}>
          <Upload className="h-4 w-4 mr-1" />{uploading ? "Subiendo…" : "Subir documento"}
        </Button>

        <div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Descripción</th>
                <th className="text-left p-2">Fecha</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(docs ?? []).map((d: any) => (
                <tr key={d.id} className="border-t">
                  <td className="p-2">{TIPO_DOC.find((t) => t.v === d.tipo)?.l ?? d.tipo}</td>
                  <td className="p-2">{d.notas ?? "—"}</td>
                  <td className="p-2">{new Date(d.fecha_subida).toLocaleDateString()}</td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      <DocumentoPreviewButton path={d.storage_path} />
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(d)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(docs ?? []).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sin documentos.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function VacacionesTab({ empleadoId, fechaIngreso }: { empleadoId: string; fechaIngreso: string | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({
    fecha_inicio: "", fecha_fin: "", dias_tomados: "", notas: "",
  });

  const { data: acumulado } = useQuery({
    queryKey: ["rrhh-vac-acum", empleadoId, fechaIngreso],
    enabled: !!fechaIngreso,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("calcular_vacaciones_acumuladas", { _fecha_ingreso: fechaIngreso });
      if (error) throw error;
      return data as number;
    },
  });

  const { data: registros } = useQuery({
    queryKey: ["rrhh-vac", empleadoId],
    queryFn: async () =>
      ((await (supabase as any).from("empleado_vacaciones").select("*").eq("empleado_id", empleadoId).order("fecha_inicio", { ascending: false })).data ?? []) as any[],
  });

  const tomadas = (registros ?? []).reduce((s: number, r: any) => s + Number(r.dias_tomados ?? 0), 0);
  const disponibles = (acumulado ?? 0) - tomadas;

  const add = useMutation({
    mutationFn: async () => {
      if (!form.fecha_inicio || !form.fecha_fin || !form.dias_tomados) throw new Error("Completa fechas y días");
      const { error } = await (supabase as any).from("empleado_vacaciones").insert({
        empleado_id: empleadoId,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        dias_tomados: Number(form.dias_tomados),
        notas: form.notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vacación registrada");
      setForm({ fecha_inicio: "", fecha_fin: "", dias_tomados: "", notas: "" });
      qc.invalidateQueries({ queryKey: ["rrhh-vac", empleadoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("empleado_vacaciones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro eliminado");
      qc.invalidateQueries({ queryKey: ["rrhh-vac", empleadoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Acumuladas (Ley 16-92)</div><div className="text-2xl font-bold">{acumulado ?? 0}</div><div className="text-xs">días</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Tomadas</div><div className="text-2xl font-bold">{tomadas}</div><div className="text-xs">días</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Disponibles</div><div className={`text-2xl font-bold ${disponibles < 0 ? "text-destructive" : "text-emerald-600"}`}>{disponibles}</div><div className="text-xs">días</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Registrar período de vacaciones</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-3 items-end">
          <Campo label="Desde"><Input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></Campo>
          <Campo label="Hasta"><Input type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></Campo>
          <Campo label="Días tomados"><Input type="number" value={form.dias_tomados} onChange={(e) => setForm({ ...form, dias_tomados: e.target.value })} /></Campo>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>{add.isPending ? "Guardando…" : "Registrar"}</Button>
          <div className="col-span-4">
            <Campo label="Notas"><Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Campo>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Desde</th>
                <th className="text-left p-2">Hasta</th>
                <th className="text-left p-2">Días</th>
                <th className="text-left p-2">Notas</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(registros ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.fecha_inicio}</td>
                  <td className="p-2">{r.fecha_fin}</td>
                  <td className="p-2">{r.dias_tomados}</td>
                  <td className="p-2">{r.notas ?? "—"}</td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(registros ?? []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin registros.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
