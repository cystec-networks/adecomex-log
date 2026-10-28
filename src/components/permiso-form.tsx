import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { extraerPermisoVuce } from "@/lib/permiso-vuce.functions";
import { aplicarDetalleVuce, avisosVerificacionVuce, documentoDelPermisoVuce } from "@/lib/permiso-vuce";
import { useBorradorExpediente } from "@/components/expediente-guardado";
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
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";

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
  { v: "pendiente_pago", l: "Pendiente de Pago" },
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
  ordenId?: string; // preselect
  embedded?: boolean;
  onSaved?: () => void;
};

export function PermisoForm({ mode, id, expedienteId, ordenId, embedded = false, onSaved }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const leerVuce = useServerFn(extraerPermisoVuce);
  const detalleVuceInput = useRef<HTMLInputElement>(null);
  const transporteVuce = useRef<string | null>(null);

  const { data: existing } = useQuery({
    enabled: mode === "edit" && !!id,
    queryKey: ["permiso", id],
    queryFn: async () => {
      if (!id) return null;
      return (await supabase.from("permisos").select("*, clientes(nombre), expedientes(numero,cliente_id), ordenes(numero,cliente_id)").eq("id", id).maybeSingle()).data;
    },
  });

  const { data: ordenes } = useQuery({
    queryKey: ["ordenes-lite"],
    queryFn: async () => (await supabase.from("ordenes").select("id,numero,cliente_id,clientes(nombre)").order("numero", { ascending: false }).limit(500)).data ?? [],
  });

  const { data: expedientes } = useQuery({
    queryKey: ["expedientes-lite"],
    queryFn: async () => (await supabase.from("expedientes").select("id,numero,cliente_id,clientes(nombre)").is("eliminado_en", null).order("numero", { ascending: false }).limit(500)).data ?? [],
  });

  const [form, setForm] = useState({
    numero: "",
    numero_resolucion: "",
    codigo_siga: null as string | null,
    expediente_id: expedienteId ?? "",
    orden_id: ordenId ?? "",
    cliente_id: "",
    tipo: "",
    institucion_emisora: "",
    estado: "solicitado",
    estado_vuce: null as string | null,
    fecha_aprobacion: "",
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
        codigo_siga: (existing as any).codigo_siga ?? null,
        expediente_id: existing.expediente_id ?? "",
        orden_id: (existing as any).orden_id ?? "",
        cliente_id: existing.cliente_id ?? "",
        tipo: existing.tipo ?? "",
        institucion_emisora: existing.institucion_emisora ?? "",
        estado: existing.estado ?? "solicitado",
        estado_vuce: existing.estado_vuce ?? null,
        fecha_aprobacion: (existing as any).fecha_aprobacion ?? "",
        fecha_solicitud: existing.fecha_solicitud ?? "",
        fecha_emision: existing.fecha_emision ?? "",
        fecha_vencimiento: existing.fecha_vencimiento ?? "",
        documento_url: existing.documento_url ?? "",
        observaciones: existing.observaciones ?? "",
      });
      setLoaded(true);
    }
  }, [existing, mode, loaded]);

  // Autocompletar cliente cuando cambie expediente u orden
  useEffect(() => {
    if (form.expediente_id) {
      const exp = (expedientes ?? []).find((e: any) => e.id === form.expediente_id);
      if (exp && exp.cliente_id && !form.cliente_id) {
        setForm((f) => ({ ...f, cliente_id: exp.cliente_id as string }));
      }
      return;
    }
    if (form.orden_id) {
      const ord = (ordenes ?? []).find((e: any) => e.id === form.orden_id);
      if (ord && ord.cliente_id && !form.cliente_id) {
        setForm((f) => ({ ...f, cliente_id: ord.cliente_id as string }));
      }
    }
  }, [form.expediente_id, form.orden_id, expedientes, ordenes]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const [uploading, setUploading] = useState(false);
  const uploadFile = async (file: File) => {
    if (uploading || save.isPending) return;
    const { validarNombreSiga, prefijosAceptados } = await import("@/lib/codigo-siga");
    const v = validarNombreSiga(file.name, prefijosAceptados("Permiso VUCE previo"));
    if (!v.ok) { toast.error(v.error, { duration: 8000 }); return; }
    if (v.advertencia) toast.warning(v.advertencia, { duration: 8000 });
    setUploading(true);
    try {
      const path = `permisos/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("documentos").upload(path, file, { upsert: false });
      if (error) throw error;
      set("documento_url", path);
      toast.success("Documento subido");
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        if (file.size > 15 * 1024 * 1024) {
          toast.warning("PDF guardado. La lectura VUCE admite hasta 15 MB; completa los datos manualmente.");
        } else {
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            const datos = await leerVuce({ data: { filename: file.name, base64: btoa(binary) } });
            if (datos) {
              setForm((f) => aplicarDetalleVuce(f, datos));
              transporteVuce.current = datos.verificacion?.transporte ?? null;
              if (datos.verificacion && form.expediente_id) {
                const { data: exp } = await supabase.from("expedientes").select("bl_awb,puerto_arribo,clientes(nombre,rnc)").eq("id", form.expediente_id).maybeSingle();
                const cli = (exp as any)?.clientes;
                for (const aviso of avisosVerificacionVuce(datos, { bl_awb: exp?.bl_awb, puerto_arribo: exp?.puerto_arribo, cliente: cli?.nombre, rnc: cli?.rnc }))
                  toast.warning(aviso, { duration: 10000 });
              }
              toast.success("Datos del permiso VUCE completados; revisa y guarda los cambios.");
              if (datos.estado === "aprobado" && !datos.fecha_aprobacion) toast.warning("No se encontró una fecha válida de aprobación final en el historial.");
            } else toast.warning("PDF guardado; no se reconoció Detalle Solicitud VUCE. Los datos actuales se conservan.");
          } catch {
            toast.warning("PDF guardado; no se pudieron leer los datos VUCE. Puedes completarlos manualmente.");
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Error al subir");
    } finally { setUploading(false); }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (uploading) throw new Error("Espera a que termine la lectura del documento.");
      const payload: any = { ...form };
      ["expediente_id","orden_id","cliente_id","tipo","fecha_solicitud","fecha_emision","fecha_vencimiento","fecha_aprobacion","documento_url","numero_resolucion","institucion_emisora","observaciones","numero"]
        .forEach((k) => { if (payload[k] === "") payload[k] = null; });
      if (payload.documento_url && payload.expediente_id && !payload.codigo_siga) {
        const { siguienteCodigoSiga } = await import("@/lib/codigo-siga");
        payload.codigo_siga = await siguienteCodigoSiga(payload.expediente_id, "PER");
      }
      const vincularDocumento = async () => {
        if (!payload.documento_url || !payload.expediente_id) return;
        const { data: docs, error: readError } = await supabase.from("documentos")
          .select("id,storage_path,codigo_siga,fecha_recepcion")
          .eq("expediente_id", payload.expediente_id).eq("tipo", "Permiso VUCE previo");
        if (readError) throw readError;
        const documento = documentoDelPermisoVuce(docs ?? [], payload.documento_url,
          existing?.documento_url ?? null, payload.codigo_siga);
        const datos = {
          expediente_id: payload.expediente_id, tipo: "Permiso VUCE previo",
          storage_path: payload.documento_url, codigo_siga: payload.codigo_siga,
          estado: "recibido" as const,
          fecha_recepcion: documento?.fecha_recepcion ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" }),
          fecha_vencimiento: payload.fecha_vencimiento,
        };
        const { error } = documento
          ? await supabase.from("documentos").update(datos).eq("id", documento.id)
          : await supabase.from("documentos").insert(datos);
        // Fill the expediente's own permit number / transport only when blank; never overwrite captured data.
        const { data: exp } = await supabase.from("expedientes").select("numero_vuce,medio_transporte").eq("id", payload.expediente_id).maybeSingle();
        const cambios: { numero_vuce?: string; medio_transporte?: string } = {};
        if (exp && !exp.numero_vuce?.trim() && payload.numero) cambios.numero_vuce = payload.numero;
        if (exp && !exp.medio_transporte?.trim() && transporteVuce.current) cambios.medio_transporte = transporteVuce.current.replace(/^mar[ií]timo$/i, "Marítimo").replace(/^a[ée]reo$/i, "Aéreo");
        if (Object.keys(cambios).length) {
          await supabase.from("expedientes").update(cambios).eq("id", payload.expediente_id);
          await qc.invalidateQueries({ queryKey: ["expediente", payload.expediente_id] });
        }
        if (error) throw new Error(`Permiso guardado, pero no se pudo vincular el PDF en Documentos: ${error.message}. Vuelve a guardar para reintentar.`);
        await qc.invalidateQueries({ queryKey: ["documentos", payload.expediente_id] });
      };
      if (mode === "new") {
        if (payload.numero == null) throw new Error("Escribe el N° de Permiso VUCE (se captura manualmente).");
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id ?? null;
        const { data, error } = await supabase.from("permisos").insert(payload).select().single();
        if (error) throw error;
        // A linking failure must not encourage creating a duplicate permit; edit the saved row to retry.
        try { await vincularDocumento(); } catch (e) {
          toast.warning(e instanceof Error ? e.message : "Permiso guardado; no se pudo vincular el PDF en Documentos.");
        }
        return data;
      } else {
        if (!id) throw new Error("Falta el permiso que se desea actualizar.");
        const { data, error } = await supabase.from("permisos").update(payload).eq("id", id).select().single();
        if (error) throw error;
        await vincularDocumento();
        return data;
      }
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["permisos"] });
      qc.invalidateQueries({ queryKey: ["permiso", id] });
      qc.invalidateQueries({ queryKey: ["permisos-por-expediente"] });
      qc.invalidateQueries({ queryKey: ["permisos-por-orden"] });
      toast.success(mode === "new" ? `Permiso VUCE ${row.numero} creado` : "Permiso VUCE actualizado");
      if (embedded) { onSaved?.(); return; }
      if (mode === "new") {
        if (expedienteId) nav({ to: "/expedientes/$id", params: { id: expedienteId } });
        else if (ordenId) nav({ to: "/ordenes/$id", params: { id: ordenId } });
        else nav({ to: "/permisos" });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  useBorradorExpediente(form, embedded && loaded, save.isPending || uploading, () => save.mutateAsync(), save.isSuccess ? save.submittedAt : undefined);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {!embedded && <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link
            to={expedienteId ? "/expedientes/$id" : ordenId ? "/ordenes/$id" : "/permisos"}
            params={expedienteId ? { id: expedienteId } : ordenId ? { id: ordenId } : undefined as any}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />Volver
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">
            {mode === "new" ? "Nuevo Permiso VUCE" : `Permiso VUCE ${form.numero}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "new" ? "Registra un permiso VUCE gubernamental vinculado a un expediente." : "Edita los datos del permiso VUCE."}
          </p>
        </div>
        <Button variant="outline" onClick={() => nav({ to: "/permisos" })}>
          <X className="h-4 w-4 mr-1" />Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
          <Check className="h-4 w-4 mr-1" />{save.isPending ? "Guardando…" : mode === "new" ? "Crear permiso VUCE" : "Guardar cambios"}
        </Button>
      </div>}

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Vinculación</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-3 md:[grid-template-columns:repeat(3,minmax(0,1fr))]">
          <div className="grid min-w-0 gap-1.5">
            <Label>Expediente vinculado</Label>
            <Select value={form.expediente_id || undefined} onValueChange={(v) => set("expediente_id", v)}>
              <SelectTrigger className="min-w-0 overflow-hidden [&>span]:min-w-0 [&>span]:truncate"><SelectValue placeholder="Selecciona expediente" /></SelectTrigger>
              <SelectContent>
                {(expedientes ?? []).map((e: any) => (
                   <SelectItem key={e.id} value={e.id}><span className="expediente-numero">{e.numero}</span> · {e.clientes?.nombre ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label>Orden de Compra vinculada</Label>
            <Select value={form.orden_id || undefined} onValueChange={(v) => set("orden_id", v)}>
              <SelectTrigger className="min-w-0 overflow-hidden [&>span]:min-w-0 [&>span]:truncate"><SelectValue placeholder="Selecciona orden (opcional)" /></SelectTrigger>
              <SelectContent>
                {(ordenes ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.numero} · {e.clientes?.nombre ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label>Cliente (auto)</Label>
            <div className="h-9 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis px-3 rounded-md border bg-muted/40 flex items-center text-sm">
              {(() => {
                const exp = (expedientes ?? []).find((e: any) => e.id === form.expediente_id);
                const ord = (ordenes ?? []).find((e: any) => e.id === form.orden_id);
                return exp?.clientes?.nombre ?? ord?.clientes?.nombre ?? existing?.clientes?.nombre ?? <span className="text-muted-foreground">— (elige expediente u orden)</span>;
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Datos del Permiso VUCE</CardTitle>
          <input
            ref={detalleVuceInput}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Detalle Solicitud VUCE PDF"
            className="hidden"
            disabled={uploading || save.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadFile(file);
            }}
          />
          <Button variant="outline" size="sm" disabled={uploading || save.isPending}
            onClick={() => detalleVuceInput.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? "Leyendo Detalle VUCE…" : "Subir Detalle VUCE (PDF)"}
          </Button>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>N° Permiso VUCE *</Label>
            <Input
              value={form.numero}
              onChange={(e) => set("numero", e.target.value)}
              placeholder={mode === "new" ? "Ej. TRM-0926-2505112" : ""}
            />
          </div>
          <div className="grid gap-1.5"><Label>N° Resolución</Label><Input value={form.numero_resolucion} onChange={(e) => set("numero_resolucion", e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Tipo de Permiso VUCE</Label>
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
            <Select
              value={form.estado_vuce ? `vuce:${form.estado_vuce}` : form.estado}
              onValueChange={(v) => {
                set("estado", v);
                set("estado_vuce", null);
                if (v === "aprobado" && !form.fecha_aprobacion) {
                  set("fecha_aprobacion", new Date().toISOString().slice(0, 10));
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {form.estado_vuce && <SelectItem value={`vuce:${form.estado_vuce}`}>{form.estado_vuce}</SelectItem>}
                {PERMISO_ESTADOS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Fecha de Aprobación</Label>
            <Input
              type="date"
              value={form.fecha_aprobacion}
              disabled={form.estado !== "aprobado"}
              onChange={(e) => set("fecha_aprobacion", e.target.value)}
            />
            {form.estado !== "aprobado" && (
              <p className="text-[10px] text-muted-foreground">Se habilita cuando el estado sea Aprobado.</p>
            )}
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
              <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading || save.isPending} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploadFile(file); }} />
              <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border bg-background hover:bg-muted cursor-pointer text-sm">
                <Upload className="h-4 w-4" /> {uploading ? "Subiendo / leyendo…" : form.documento_url ? "Reemplazar PDF/imagen" : "Subir PDF/imagen"}
              </span>
            </label>
            {form.documento_url && (
              <>
                <DocumentoPreviewButton
                  path={form.documento_url}
                  variant="outline"
                  size="sm"
                  icon={<FileText className="h-4 w-4 mr-1" />}
                  label="Ver documento"
                />
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
        <Button variant="outline" onClick={() => embedded ? onSaved?.() : nav({ to: "/permisos" })}>Cancelar</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
          <Check className="h-4 w-4 mr-1" />{save.isPending ? "Guardando…" : mode === "new" ? "Crear permiso" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
