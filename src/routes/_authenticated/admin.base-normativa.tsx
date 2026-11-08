import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, FileText, Pencil, Play, Plus, RotateCcw, Search, Trash2, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TIPOS_NORMATIVA,
  VIGENCIA_NORMATIVA,
  nombreArchivoSeguro,
  type EstadoVigencia,
} from "@/lib/normativa";
import { extraerDocumentoNormativa, vectorizarDocumentoNormativa } from "@/lib/normativa.functions";

type Documento = Database["public"]["Tables"]["normativa_documentos"]["Row"];
type Borrador = Partial<Documento> & { archivo?: File | null };

const BUCKET = "base-normativa";
const MAX_BYTES = 50 * 1024 * 1024;
const TITULO = "Base normativa | ADECOMEX";
const DESCRIPCION =
  "Leyes, reglamentos, resoluciones, circulares y guías que consulta el Asistente ADECOMEX para responder sobre normativa.";

export const Route = createFileRoute("/_authenticated/admin/base-normativa")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: BaseNormativa,
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRIPCION },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRIPCION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CLAVE = ["base-normativa"];

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
const fmtFechaHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-DO", {
        timeZone: "America/Santo_Domingo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—";
const fmtTamano = (b: number | null) =>
  !b ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const VIGENCIA_CLASE: Record<EstadoVigencia, string> = {
  vigente: "border-transparent bg-[var(--success)]/15 text-[var(--success)]",
  derogado: "border-transparent bg-destructive/15 text-destructive",
  no_verificado: "border-transparent bg-[var(--warning)]/25 text-[var(--warning-foreground)]",
};

const PROCESO: Record<
  Documento["procesamiento_estado"],
  { texto: string; variante: "default" | "secondary" | "destructive" | "outline" }
> = {
  pendiente: { texto: "Pendiente", variante: "outline" },
  procesando: { texto: "Procesando", variante: "secondary" },
  listo: { texto: "Listo", variante: "default" },
  error: { texto: "Error", variante: "destructive" },
  escaneado: { texto: "Escaneado · no legible", variante: "destructive" },
};

function BaseNormativa() {
  const qc = useQueryClient();
  const extraer = useServerFn(extraerDocumentoNormativa);
  const vectorizar = useServerFn(vectorizarDocumentoNormativa);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [enCurso, setEnCurso] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [vigencia, setVigencia] = useState("todas");

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: [...CLAVE, "lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("normativa_documentos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Documento[];
    },
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: CLAVE });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return documentos.filter(
      (d) =>
        (vigencia === "todas" || d.estado_vigencia === vigencia) &&
        (!q || `${d.titulo} ${d.tipo} ${d.numero ?? ""} ${d.notas ?? ""}`.toLowerCase().includes(q)),
    );
  }, [documentos, busqueda, vigencia]);

  const listos = documentos.filter((d) => d.procesamiento_estado === "listo").length;

  /** Extrae (si se pide) y vectoriza por lotes hasta terminar, mostrando el avance. */
  async function procesar(id: string, desdeCero: boolean) {
    if (enCurso.has(id)) return;
    setEnCurso((s) => new Set(s).add(id));
    try {
      let r = desdeCero ? await extraer({ data: { documentoId: id } }) : null;
      refrescar();
      if (r && r.estado !== "procesando") {
        (r.estado === "listo" ? toast.success : toast.error)(r.mensaje);
        return;
      }
      for (let vueltas = 0; vueltas < 200; vueltas++) {
        r = await vectorizar({ data: { documentoId: id } });
        refrescar();
        if (r.estado !== "procesando") break;
      }
      if (r?.estado === "listo") toast.success(r.mensaje);
      else if (r) toast.error(r.mensaje);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo procesar el documento");
    } finally {
      setEnCurso((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      refrescar();
    }
  }

  const guardar = useMutation({
    mutationFn: async (b: Borrador) => {
      const titulo = b.titulo?.trim() ?? "";
      const fuente = b.fuente_url?.trim() || null;
      if (!titulo) throw new Error("Escribe el título del documento");
      if (fuente && !/^https?:\/\//i.test(fuente))
        throw new Error("La fuente oficial debe empezar por http:// o https://");
      if (!b.id && !b.archivo) throw new Error("Elige el archivo PDF");
      if (b.archivo) {
        if (!/\.pdf$/i.test(b.archivo.name) && b.archivo.type !== "application/pdf")
          throw new Error("El archivo debe ser un PDF");
        if (b.archivo.size > MAX_BYTES) throw new Error("El PDF supera el máximo de 50 MB");
      }
      const fila = {
        titulo,
        tipo: b.tipo ?? "Otro",
        numero: b.numero?.trim() || null,
        fecha_emision: b.fecha_emision || null,
        estado_vigencia: b.estado_vigencia ?? "no_verificado",
        fuente_url: fuente,
        notas: b.notas?.trim() || null,
      };
      let id = b.id ?? null;
      if (id) {
        const { error } = await supabase.from("normativa_documentos").update(fila).eq("id", id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("normativa_documentos")
          .insert({ ...fila, created_by: u.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      if (!b.archivo) return { id, nuevoArchivo: false };
      const ruta = `${id}/${Date.now()}_${nombreArchivoSeguro(b.archivo.name)}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, b.archivo, { contentType: "application/pdf", upsert: false });
      if (errSubida) {
        if (!b.id) await supabase.from("normativa_documentos").delete().eq("id", id);
        throw new Error("No se pudo subir el PDF. Inténtalo de nuevo.");
      }
      const anterior = b.archivo_path;
      const { error: errRuta } = await supabase
        .from("normativa_documentos")
        .update({
          archivo_path: ruta,
          archivo_nombre: b.archivo.name,
          archivo_bytes: b.archivo.size,
          procesamiento_estado: "pendiente",
          procesamiento_mensaje: null,
        })
        .eq("id", id);
      if (errRuta) throw errRuta;
      if (anterior) await supabase.storage.from(BUCKET).remove([anterior]);
      return { id, nuevoArchivo: true };
    },
    onSuccess: (r) => {
      toast.success(r.nuevoArchivo ? "Documento guardado. Procesando el PDF…" : "Documento guardado");
      setEditando(null);
      refrescar();
      if (r.nuevoArchivo && r.id) void procesar(r.id, true);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const eliminar = useMutation({
    mutationFn: async (d: Documento) => {
      const { error } = await supabase.from("normativa_documentos").delete().eq("id", d.id);
      if (error) throw error;
      if (d.archivo_path) await supabase.storage.from(BUCKET).remove([d.archivo_path]);
    },
    onSuccess: () => {
      toast.success("Documento eliminado de la base normativa");
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo eliminar"),
  });

  async function verPdf(d: Documento) {
    if (!d.archivo_path) return;
    const ventana = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.archivo_path, 300);
    if (error || !data) {
      ventana?.close();
      toast.error("No se pudo abrir el PDF");
      return;
    }
    if (ventana) ventana.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Base normativa</h1>
          <p className="max-w-3xl text-[12px] text-muted-foreground">
            El Asistente ADECOMEX responde sobre normativa usando solo estos documentos y la lista de
            Novedades, citando documento, artículo o página, fecha y vigencia. Marca como «Derogado»
            lo que ya no aplica y deja «No verificado» lo que aún no has confirmado.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setEditando({ tipo: "Ley", estado_vigencia: "no_verificado", archivo: null })}
        >
          <Plus className="h-4 w-4" /> Subir documento
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm">
            Documentos ({documentos.length}) · {listos} disponible(s) para el asistente
          </CardTitle>
          <CardDescription className="text-[12px]">
            Al subir un PDF se extrae su texto, se divide en fragmentos con su página y artículo, y se
            prepara para la búsqueda. Los PDF escaneados sin texto no se pueden consultar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por título, tipo o número…"
                className="h-9 pl-8 text-[13px]"
              />
            </div>
            <Select value={vigencia} onValueChange={setVigencia}>
              <SelectTrigger className="h-9 w-[12rem] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda vigencia</SelectItem>
                {Object.entries(VIGENCIA_NORMATIVA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-[12px] text-muted-foreground">Cargando…</p>
          ) : filtrados.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              {documentos.length
                ? "No hay documentos con esos filtros."
                : "Todavía no hay documentos. Pulsa «Subir documento» para cargar el primero."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-left text-[11px] uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Documento</th>
                    <th className="py-2 pr-3">Emisión</th>
                    <th className="py-2 pr-3">Vigencia</th>
                    <th className="py-2 pr-3">Procesamiento</th>
                    <th className="py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((d) => (
                    <FilaDocumento
                      key={d.id}
                      d={d}
                      corriendo={enCurso.has(d.id)}
                      onEditar={() => setEditando({ ...d, archivo: null })}
                      onProcesar={(desdeCero) => procesar(d.id, desdeCero)}
                      onVer={() => verPdf(d)}
                      onEliminar={() => {
                        if (confirm(`¿Eliminar «${d.titulo}» y su PDF de la base normativa?`))
                          eliminar.mutate(d);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DialogoDocumento
        borrador={editando}
        onCambiar={setEditando}
        onGuardar={() => editando && guardar.mutate(editando)}
        guardando={guardar.isPending}
      />
    </div>
  );
}

function FilaDocumento({
  d,
  corriendo,
  onEditar,
  onProcesar,
  onVer,
  onEliminar,
}: {
  d: Documento;
  corriendo: boolean;
  onEditar: () => void;
  onProcesar: (desdeCero: boolean) => void;
  onVer: () => void;
  onEliminar: () => void;
}) {
  const p = PROCESO[d.procesamiento_estado];
  const pct = d.fragmentos_total ? Math.round((d.fragmentos_listos / d.fragmentos_total) * 100) : 0;
  const vigencia = d.estado_vigencia as EstadoVigencia;
  // Se puede reanudar si quedó a medias (fragmentos guardados pero no todos preparados).
  const reanudable =
    !corriendo &&
    (d.procesamiento_estado === "procesando" || d.procesamiento_estado === "error") &&
    d.fragmentos_total > 0 &&
    d.fragmentos_listos < d.fragmentos_total;
  return (
    <tr className="border-b align-top last:border-0">
      <td className="max-w-[26rem] py-2 pr-3">
        <div className="font-medium text-[13px]">{d.titulo}</div>
        <div className="text-[11px] text-muted-foreground">
          {d.tipo}
          {d.numero ? ` núm. ${d.numero}` : ""}
          {d.archivo_nombre ? ` · ${d.archivo_nombre}` : ""}
          {d.archivo_bytes ? ` (${fmtTamano(d.archivo_bytes)})` : ""}
          {d.paginas ? ` · ${d.paginas} pág.` : ""}
        </div>
        {d.fuente_url && (
          <a
            href={d.fuente_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate text-[11px] text-primary hover:underline"
            title={d.fuente_url}
          >
            Fuente oficial <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )}
        {d.notas && <div className="text-[11px] text-muted-foreground">{d.notas}</div>}
      </td>
      <td className="whitespace-nowrap py-2 pr-3">{fmtFecha(d.fecha_emision)}</td>
      <td className="py-2 pr-3">
        <Badge variant="outline" className={`text-[11px] ${VIGENCIA_CLASE[vigencia] ?? ""}`}>
          {VIGENCIA_NORMATIVA[vigencia] ?? d.estado_vigencia}
        </Badge>
      </td>
      <td className="min-w-[14rem] max-w-[22rem] py-2 pr-3">
        <Badge variant={corriendo ? "secondary" : p.variante} className="text-[11px]">
          {corriendo ? "Procesando…" : p.texto}
        </Badge>
        {(corriendo || d.procesamiento_estado === "procesando") && d.fragmentos_total > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <Progress value={pct} className="h-1.5 flex-1" aria-label="Avance del procesamiento" />
            <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
          </div>
        )}
        {d.procesamiento_mensaje && (
          <div
            className={`mt-1 text-[11px] ${d.procesamiento_estado === "error" || d.procesamiento_estado === "escaneado" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {d.procesamiento_mensaje}
          </div>
        )}
        {d.procesado_at && d.procesamiento_estado === "listo" && (
          <div className="text-[11px] text-muted-foreground">Procesado {fmtFechaHora(d.procesado_at)}</div>
        )}
        {!corriendo && d.procesamiento_estado === "procesando" && !reanudable && (
          <div className="text-[11px] text-muted-foreground">
            Si se interrumpió, pulsa «Reprocesar».
          </div>
        )}
      </td>
      <td className="py-2">
        <div className="flex justify-end gap-1">
          {reanudable && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Reanudar donde se quedó"
              aria-label={`Reanudar ${d.titulo}`}
              onClick={() => onProcesar(false)}
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Reprocesar desde el PDF"
            aria-label={`Reprocesar ${d.titulo}`}
            disabled={corriendo || !d.archivo_path}
            onClick={() => onProcesar(true)}
          >
            <RotateCcw className={`h-4 w-4 ${corriendo ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Ver PDF"
            aria-label={`Ver PDF de ${d.titulo}`}
            disabled={!d.archivo_path}
            onClick={onVer}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Editar datos o reemplazar PDF"
            aria-label={`Editar ${d.titulo}`}
            disabled={corriendo}
            onClick={onEditar}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            title="Eliminar"
            aria-label={`Eliminar ${d.titulo}`}
            disabled={corriendo}
            onClick={onEliminar}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function DialogoDocumento({
  borrador,
  onCambiar,
  onGuardar,
  guardando,
}: {
  borrador: Borrador | null;
  onCambiar: (b: Borrador | null) => void;
  onGuardar: () => void;
  guardando: boolean;
}) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const b = borrador;
  const set = (cambios: Partial<Borrador>) => b && onCambiar({ ...b, ...cambios });
  return (
    <Dialog open={!!b} onOpenChange={(o) => !o && onCambiar(null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{b?.id ? "Editar documento" : "Subir documento"}</DialogTitle>
          <DialogDescription>
            PDF con texto seleccionable (no escaneado). Máximo 50 MB.
          </DialogDescription>
        </DialogHeader>
        {b && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{b.id ? "Reemplazar PDF (opcional)" : "Archivo PDF"}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => archivoRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Elegir PDF
                </Button>
                <span className="min-w-0 truncate text-[12px] text-muted-foreground" title={b.archivo?.name}>
                  {b.archivo?.name ?? (b.archivo_nombre ? `Actual: ${b.archivo_nombre}` : "Ningún archivo elegido")}
                </span>
                <input
                  ref={archivoRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (!f) return;
                    set({
                      archivo: f,
                      titulo: b.titulo?.trim() ? b.titulo : f.name.replace(/\.pdf$/i, ""),
                    });
                  }}
                />
              </div>
              {b.id && b.archivo && (
                <p className="text-[11px] text-muted-foreground">
                  Al guardar se reemplaza el PDF y se vuelve a procesar.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="bn-titulo">Título</Label>
              <Input id="bn-titulo" value={b.titulo ?? ""} onChange={(e) => set({ titulo: e.target.value })} className="text-[13px]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="bn-tipo">Tipo</Label>
                <Select value={b.tipo ?? "Otro"} onValueChange={(v) => set({ tipo: v })}>
                  <SelectTrigger id="bn-tipo" className="text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_NORMATIVA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="bn-numero">Número (si aplica)</Label>
                <Input
                  id="bn-numero"
                  value={b.numero ?? ""}
                  placeholder="Ej. 168-21"
                  onChange={(e) => set({ numero: e.target.value })}
                  className="text-[13px]"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="bn-fecha">Fecha de emisión</Label>
                <Input
                  id="bn-fecha"
                  type="date"
                  value={b.fecha_emision ?? ""}
                  onChange={(e) => set({ fecha_emision: e.target.value || null })}
                  className="text-[13px]"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="bn-estado">Estado</Label>
                <Select
                  value={b.estado_vigencia ?? "no_verificado"}
                  onValueChange={(v) => set({ estado_vigencia: v })}
                >
                  <SelectTrigger id="bn-estado" className="text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VIGENCIA_NORMATIVA).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1 sm:col-span-2">
                <Label htmlFor="bn-fuente">Fuente (URL oficial)</Label>
                <Input
                  id="bn-fuente"
                  value={b.fuente_url ?? ""}
                  placeholder="https://"
                  onChange={(e) => set({ fuente_url: e.target.value })}
                  className="text-[13px]"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bn-notas">Notas</Label>
              <Textarea id="bn-notas" rows={2} value={b.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} className="text-[13px]" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambiar(null)}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
