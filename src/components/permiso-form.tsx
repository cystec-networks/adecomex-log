import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";

export const PERMISO_TIPOS = [
  { v: "sanitario", l: "Sanitario" },
  { v: "fitosanitario", l: "Fitosanitario" },
  { v: "zoosanitario", l: "Zoosanitario" },
  { v: "indocal", l: "INDOCAL" },
  { v: "ambiental", l: "Ambiental" },
  { v: "agricola", l: "Agrícola" },
  { v: "ministerio_salud", l: "Ministerio de Salud" },
  { v: "otro", l: "Otro" },
];
export const PERMISO_ESTADOS = [
  { v: "solicitado", l: "Solicitado" },
  { v: "en_tramite", l: "En trámite" },
  { v: "aprobado", l: "Aprobado" },
  { v: "rechazado", l: "Rechazado" },
  { v: "vencido", l: "Vencido" },
];
export const INSTITUCIONES = [
  "Ministerio de Salud Pública",
  "Ministerio de Agricultura",
  "Ministerio de Medio Ambiente",
  "INDOCAL",
  "DIGEMAPS",
  "DIGEMEV",
  "Ganadería",
  "Otra",
];

type Props = {
  mode: "new" | "edit";
  id?: string;
  expedienteId?: string; // preselect
};

export function PermisoForm({ mode, id, expedienteId }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: existing } = useQuery({
    enabled: mode === "edit" && !!id,
    queryKey: ["permiso", id],
    queryFn: async () => (await supabase.from("permisos").select("*, clientes(nombre), expedientes(numero,cliente_id)").eq("id", id!).maybeSingle()).data,
  });

  const { data: expedientes } = useQuery({
    queryKey: ["expedientes-lite"],
    queryFn: async () => (await supabase.from("expedientes").select("id,numero,cliente_id,clientes(nombre)").is("eliminado_en", null).order("numero", { ascending: false }).limit(500)).data ?? [],
  });

  const [form, setForm] = useState({
    numero: "",
    numero_resolucion: "",
    expediente_id: expedienteId ?? "",
    cliente_id: "",
    tipo: "",
    institucion_emisora: "",
    estado: "solicitado",
    fecha_solicitud: "",
    fecha_emision: "",
    fecha_vencimiento: "",
    documento_url: "",
    observaciones: "",
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mode === "edit" && existing && !loaded) {
      setForm({
        numero: existing.numero ?? "",
        numero_resolucion: existing.numero_resolucion ?? "",
        expediente_id: existing.expediente_id ?? "",
        cliente_id: existing.cliente_id ?? "",
        tipo: existing.tipo ?? "",
        institucion_emisora: existing.institucion_emisora ?? "",
        estado: existing.estado ?? "solicitado",
        fecha_solicitud: existing.fecha_solicitud ?? "",
        fecha_emision: existing.fecha_emision ?? "",
        fecha_vencimiento: existing.fecha_vencimiento ?? "",
        documento_url: existing.documento_url ?? "",
        observaciones: existing.observaciones ?? "",
      });
      setLoaded(true);
    }
  }, [existing, mode, loaded]);

  // Autocompletar cliente cuando cambie expediente
  useEffect(() => {
    if (!form.expediente_id) return;
    const exp = (expedientes ?? []).find((e: any) => e.id === form.expediente_id);
    if (exp && exp.cliente_id && !form.cliente_id) {
      setForm((f) => ({ ...f, cliente_id: exp.cliente_id as string }));
    }
  }, [form.expediente_id, expedientes]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const [uploading, setUploading] = useState(false);
  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const path = `permisos/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("documentos").upload(path, file, { upsert: false });
      if (error) throw error;
      set("documento_url", path);
      toast.success("Documento subido");
    } catch (e: any) {
      toast.error(e.message ?? "Error al subir");
    } finally { setUploading(false); }
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      ["expediente_id","cliente_id","tipo","fecha_solicitud","fecha_emision","fecha_vencimiento","documento_url","numero_resolucion","institucion_emisora","observaciones"]
        .forEach((k) => { if (payload[k] === "") payload[k] = null; });
      if (mode === "new") {
        delete payload.numero; // auto-generated
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id ?? null;
        const { data, error } = await supabase.from("permisos").insert(payload).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("permisos").update(payload).eq("id", id!).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["permisos"] });
      qc.invalidateQueries({ queryKey: ["permiso", id] });
      qc.invalidateQueries({ queryKey: ["permisos-por-expediente"] });
      toast.success(mode === "new" ? `Permiso ${row.numero} creado` : "Permiso actualizado");
      if (mode === "new") {
        if (expedienteId) nav({ to: "/expedientes/$id", params: { id: expedienteId } });
        else nav({ to: "/permisos" });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!form.documento_url) { setSignedUrl(null); return; }
    supabase.storage.from("documentos").createSignedUrl(form.documento_url, 3600).then(({ data }) => setSignedUrl(data?.signedUrl ?? null));
  }, [form.documento_url]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to={expedienteId ? "/expedientes/$id" : "/permisos"} params={expedienteId ? { id: expedienteId } : undefined as any}>
            <ArrowLeft className="h-4 w-4 mr-1" />Volver
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">
            {mode === "new" ? "Nuevo Permiso" : `Permiso ${form.numero}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "new" ? "Registra un permiso gubernamental vinculado a un expediente." : "Edita los datos del permiso."}
          </p>
        </div>
        <Button variant="outline" onClick={() => nav({ to: "/permisos" })}>
          <X className="h-4 w-4 mr-1" />Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Check className="h-4 w-4 mr-1" />{save.isPending ? "Guardando…" : mode === "new" ? "Crear permiso" : "Guardar cambios"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Vinculación</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Expediente vinculado</Label>
            <Select value={form.expediente_id || undefined} onValueChange={(v) => set("expediente_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona expediente" /></SelectTrigger>
              <SelectContent>
                {(expedientes ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.numero} · {e.clientes?.nombre ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Cliente (auto)</Label>
            <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center text-sm">
              {(() => {
                const exp = (expedientes ?? []).find((e: any) => e.id === form.expediente_id);
                return exp?.clientes?.nombre ?? existing?.clientes?.nombre ?? <span className="text-muted-foreground">— (elige expediente)</span>;
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Datos del Permiso</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mode === "edit" && (
            <div className="grid gap-1.5"><Label>N° Permiso</Label><Input value={form.numero} disabled /></div>
          )}
          <div className="grid gap-1.5"><Label>N° Resolución</Label><Input value={form.numero_resolucion} onChange={(e) => set("numero_resolucion", e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Tipo de Permiso</Label>
            <Select value={form.tipo || undefined} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
              <SelectContent>{PERMISO_TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Institución Emisora</Label>
            <Select value={form.institucion_emisora || undefined} onValueChange={(v) => set("institucion_emisora", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona institución" /></SelectTrigger>
              <SelectContent>
                {INSTITUCIONES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                {form.institucion_emisora && !INSTITUCIONES.includes(form.institucion_emisora) && (
                  <SelectItem value={form.institucion_emisora}>{form.institucion_emisora}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PERMISO_ESTADOS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Fechas</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-3">
          <div className="grid gap-1.5"><Label>Fecha de Solicitud</Label><Input type="date" value={form.fecha_solicitud} onChange={(e) => set("fecha_solicitud", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Fecha de Emisión</Label><Input type="date" value={form.fecha_emision} onChange={(e) => set("fecha_emision", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Fecha de Vencimiento</Label><Input type="date" value={form.fecha_vencimiento} onChange={(e) => set("fecha_vencimiento", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Documento adjunto</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex">
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
              <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border bg-background hover:bg-muted cursor-pointer text-sm">
                <Upload className="h-4 w-4" /> {uploading ? "Subiendo…" : "Subir PDF/imagen"}
              </span>
            </label>
            {form.documento_url && (
              <>
                <a href={signedUrl ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline">
                  <FileText className="h-4 w-4" /> Ver documento
                </a>
                <Button variant="ghost" size="sm" onClick={() => set("documento_url", "")}>Quitar</Button>
              </>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>Observaciones</Label>
            <Textarea rows={4} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/permisos" })}>Cancelar</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Check className="h-4 w-4 mr-1" />{save.isPending ? "Guardando…" : mode === "new" ? "Crear permiso" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
