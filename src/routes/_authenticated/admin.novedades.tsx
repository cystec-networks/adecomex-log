import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, History, Link2, Pencil, PlayCircle, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIAS_NOVEDAD,
  CRITERIO_RELEVANCIA_VERSION,
  IMPACTOS_NOVEDAD,
  RELEVANCIAS_NOVEDAD,
  SECTORES_NOVEDAD,
  normalizarSectores,
  normalizarUrlNovedad,
  patronIntentos,
  textoFechaNovedad,
  type CategoriaNovedad,
  type PatronIntentos,
} from "@/lib/novedades-comercio";
import {
  clasificarNovedadesSinClasificar,
  comprobarDocumentoNovedad,
  revisarNovedadesAhora,
  verificarEnlacesNovedad,
} from "@/lib/novedades-comercio.functions";
import { EnlaceNovedad } from "@/components/novedades/enlace-novedad";

/** Mensaje claro cuando la novedad ya existe (mismo enlace o mismo documento). */
function mensajeDuplicado(detalle: string): string {
  return /documento_clave/.test(detalle)
    ? "Ya existe una novedad con el mismo documento y el mismo contenido"
    : "Ya existe una novedad con ese mismo enlace";
}

type Fuente = Database["public"]["Tables"]["fuentes_novedades"]["Row"];
type Novedad = Database["public"]["Tables"]["novedades_comercio_exterior"]["Row"];
type EstadoRevision = Database["public"]["Tables"]["novedades_revision_estado"]["Row"];
type Intento = Database["public"]["Tables"]["fuentes_novedades_intentos"]["Row"];

const TITULO = "Novedades de comercio exterior | ADECOMEX";
const DESCRIPCION =
  "Fuentes oficiales y novedades de aduanas y comercio exterior que consulta el Asistente ADECOMEX.";

export const Route = createFileRoute("/_authenticated/admin/novedades")({
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
  component: NovedadesAdmin,
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

const CLAVE = ["novedades-comercio"];

const fmtFechaHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-DO", {
        timeZone: "America/Santo_Domingo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—";

const ESTADO_FUENTE: Record<
  Fuente["ultimo_estado"],
  { texto: string; variante: "default" | "secondary" | "destructive" | "outline" }
> = {
  sin_revisar: { texto: "Sin revisar", variante: "outline" },
  ok: { texto: "Leída", variante: "default" },
  sin_novedades: { texto: "Leída · sin nuevas", variante: "secondary" },
  error: { texto: "Error", variante: "destructive" },
  no_legible: { texto: "No se puede leer", variante: "destructive" },
};
const PATRON: Record<PatronIntentos, { texto: string; clase: string }> = {
  sin_datos: { texto: "Sin intentos registrados", clase: "text-muted-foreground" },
  estable: { texto: "Lectura estable", clase: "text-muted-foreground" },
  intermitente: { texto: "Falla de forma intermitente", clase: "text-destructive" },
  siempre_falla: { texto: "Falla siempre", clase: "text-destructive" },
};
const ESTADO_INTENTO: Record<string, string> = {
  ok: "Leída · con nuevas",
  sin_novedades: "Leída · sin nuevas",
  error: "Error",
  no_legible: "No se pudo leer",
};
/** Intentos mostrados como puntos junto a cada fuente. */
const PUNTOS_HISTORIAL = 10;

const TIPO_FUENTE: Record<Fuente["tipo"], string> = {
  web: "Página web",
  rss: "RSS",
  manual: "Solo manual",
};

function NovedadesAdmin() {
  const qc = useQueryClient();
  const revisar = useServerFn(revisarNovedadesAhora);
  const clasificar = useServerFn(clasificarNovedadesSinClasificar);
  const verificar = useServerFn(verificarEnlacesNovedad);
  const comprobarDocumento = useServerFn(comprobarDocumentoNovedad);
  const [verificandoEnlaces, setVerificandoEnlaces] = useState(false);
  const [clasificando, setClasificando] = useState(false);
  const [relevancia, setRelevancia] = useState<string>("todas");
  const [revisando, setRevisando] = useState<string | null>(null);
  const [fuenteEditando, setFuenteEditando] = useState<Partial<Fuente> | null>(null);
  const [novedadEditando, setNovedadEditando] = useState<Partial<Novedad> | null>(null);
  const [historialDe, setHistorialDe] = useState<Fuente | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");

  const { data: fuentes = [] } = useQuery({
    queryKey: [...CLAVE, "fuentes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fuentes_novedades").select("*").order("nombre");
      if (error) throw error;
      return data as Fuente[];
    },
  });
  const { data: estado } = useQuery({
    queryKey: [...CLAVE, "estado"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("novedades_revision_estado")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as EstadoRevision | null;
    },
  });
  const { data: intentos = [] } = useQuery({
    queryKey: [...CLAVE, "intentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuentes_novedades_intentos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Intento[];
    },
  });
  const intentosPorFuente = useMemo(() => {
    const m = new Map<string, Intento[]>();
    for (const i of intentos) {
      const lista = m.get(i.fuente_id) ?? [];
      lista.push(i);
      m.set(i.fuente_id, lista);
    }
    return m;
  }, [intentos]);
  const modoUltima = (estado?.ultimo_resultado as { modo?: string } | null)?.modo;

  const { data: novedades = [], isLoading } = useQuery({
    queryKey: [...CLAVE, "lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("novedades_comercio_exterior")
        .select("*")
        .order("fecha_publicacion", { ascending: false, nullsFirst: false })
        .order("fecha_captura", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Novedad[];
    },
  });

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return novedades.filter(
      (n) =>
        (categoria === "todas" || n.categoria === categoria) &&
        (relevancia === "todas" ||
          (relevancia === "sin" ? !n.relevancia : n.relevancia === relevancia)) &&
        (!q || `${n.titulo} ${n.resumen} ${n.fuente_nombre}`.toLowerCase().includes(q)),
    );
  }, [novedades, busqueda, categoria, relevancia]);
  // Sin clasificar o clasificadas con un criterio anterior, y nunca corregidas a mano.
  const sinClasificar = novedades.filter(
    (n) => !n.clasificacion_manual && (n.clasificacion_criterio ?? 0) < CRITERIO_RELEVANCIA_VERSION,
  ).length;

  /** Clasifica/reevalúa por lotes hasta terminar (o hasta el primer fallo) y resume los cambios. */
  async function clasificarPendientes() {
    setClasificando(true);
    try {
      let total = 0;
      const cambios: Record<string, number> = {};
      for (let vuelta = 0; vuelta < 20; vuelta++) {
        const r = await clasificar();
        refrescar();
        if (!r.ok) {
          toast.error(total ? `${r.mensaje} Se alcanzaron a reevaluar ${total}.` : r.mensaje);
          return;
        }
        total += r.clasificadas;
        for (const [k, v] of Object.entries(r.cambios)) cambios[k] = (cambios[k] ?? 0) + v;
        if (!r.restantes || r.clasificadas === 0) break;
      }
      const resumen = Object.entries(cambios)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      toast.success(
        `${total} novedad(es) evaluada(s) con el criterio actual.${resumen ? ` Cambios de relevancia — ${resumen}.` : " Sin cambios de relevancia."}`,
        { duration: 10_000 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo clasificar");
    } finally {
      setClasificando(false);
      refrescar();
    }
  }

  const refrescar = () => qc.invalidateQueries({ queryKey: CLAVE });
  const fallo = (e: Error) => toast.error(e.message || "No se pudo guardar");
  const enlacesCaidos = novedades.filter((n) => n.enlace_estado === "no_disponible").length;
  async function verificarEnlaces() {
    setVerificandoEnlaces(true);
    try {
      const r = await verificar({ data: { ids: novedades.map((n) => n.id) } });
      const caidos = r.filter((x) => x.estado === "no_disponible").length;
      if (caidos) toast.warning(`${caidos} enlace(s) no disponible(s) de ${r.length} comprobados`);
      else toast.success(`Los ${r.length} enlaces responden`);
      refrescar();
    } catch {
      toast.error("No se pudieron comprobar los enlaces");
    } finally {
      setVerificandoEnlaces(false);
    }
  }

  async function ejecutarRevision(fuenteId: string | null) {
    setRevisando(fuenteId ?? "todas");
    try {
      const r = await revisar({ data: { fuenteId } });
      if (!r.ok) toast.warning(r.mensaje);
      else {
        const problemas = r.fuentes.filter(
          (f) => f.estado === "error" || f.estado === "no_legible",
        ).length;
        toast.success(
          `${r.nuevas} novedad(es) nueva(s) en ${r.fuentes.length} fuente(s)` +
            (problemas ? ` · ${problemas} con problemas de lectura` : "") +
            (r.detenida ? ` · Detenida: ${r.detenida}` : ""),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revisar");
    } finally {
      setRevisando(null);
      refrescar();
    }
  }

  const reanudar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("novedades_revision_estado")
        .update({ estado: "activo", pausa_tipo: null, motivo_pausa: null })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revisión automática reanudada");
      refrescar();
    },
    onError: fallo,
  });

  const cambiarActiva = useMutation({
    mutationFn: async ({ id, activa }: { id: string; activa: boolean }) => {
      const { error } = await supabase.from("fuentes_novedades").update({ activa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refrescar,
    onError: fallo,
  });

  const guardarFuente = useMutation({
    mutationFn: async (f: Partial<Fuente>) => {
      const nombre = f.nombre?.trim() ?? "";
      const url = f.url?.trim() ?? "";
      if (!nombre) throw new Error("Escribe el nombre de la fuente");
      if (!/^https?:\/\//i.test(url))
        throw new Error("La dirección debe empezar por http:// o https://");
      const fila = {
        nombre,
        url,
        tipo: f.tipo ?? "web",
        activa: f.activa ?? true,
        notas: f.notas?.trim() || null,
      };
      const { error } = f.id
        ? await supabase.from("fuentes_novedades").update(fila).eq("id", f.id)
        : await supabase.from("fuentes_novedades").insert(fila);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fuente guardada");
      setFuenteEditando(null);
      refrescar();
    },
    onError: fallo,
  });

  const eliminarFuente = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fuentes_novedades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fuente eliminada (sus novedades se conservan)");
      refrescar();
    },
    onError: fallo,
  });

  const guardarNovedad = useMutation({
    mutationFn: async (n: Partial<Novedad>) => {
      const titulo = n.titulo?.trim() ?? "";
      const resumen = n.resumen?.trim() ?? "";
      const url = normalizarUrlNovedad(n.url);
      const fuente = fuentes.find((f) => f.id === n.fuente_id);
      const fuente_nombre = (fuente?.nombre ?? n.fuente_nombre ?? "").trim();
      if (!titulo || !resumen) throw new Error("Escribe el título y el resumen");
      if (!url) throw new Error("Indica el enlace original completo (http:// o https://)");
      if (!fuente_nombre) throw new Error("Indica la fuente");
      if (!n.categoria) throw new Error("Elige la categoría");
      const fila = {
        titulo,
        resumen,
        url,
        fuente_nombre,
        fuente_id: n.fuente_id ?? null,
        categoria: n.categoria,
        fecha_publicacion: n.fecha_publicacion || null,
        impacto: n.impacto ?? null,
        sectores: n.relevancia || n.impacto ? normalizarSectores(n.sectores) : (n.sectores ?? []),
        relevancia: n.relevancia ?? null,
      };
      // Enlace nuevo o cambiado: se vuelve a comprobar tras guardar.
      const original0 = n.id ? novedades.find((x) => x.id === n.id) : undefined;
      const enlaceCambiado = !original0 || original0.url !== url;
      const reinicioEnlace = enlaceCambiado
        ? { enlace_estado: null, enlace_codigo_http: null, enlace_es_pdf: null, enlace_mensaje: null, enlace_verificado_at: null }
        : {};
      // Mismo nombre de documento que otra novedad: solo es la misma si
      // coinciden tamaño y contenido; con contenido distinto se guarda.
      let huellaDocumento = {};
      if (enlaceCambiado) {
        const r = await comprobarDocumento({ data: { url, excluirId: n.id ?? null } });
        if (r.duplicado)
          throw new Error(
            r.duplicado.motivo === "mismo_contenido"
              ? `Ya existe una novedad con el mismo documento y el mismo contenido: «${r.duplicado.titulo}»`
              : `Ya existe una novedad con un documento del mismo nombre («${r.duplicado.titulo}») y no se pudo descargar el archivo para comparar su contenido. Inténtalo más tarde.`,
          );
        huellaDocumento = { documento_bytes: r.huella?.bytes ?? null, documento_sha256: r.huella?.sha256 ?? null };
      }
      // Si el administrador cambia la clasificación, queda como corrección manual
      // y la reevaluación con IA ya no la toca.
      const original = n.id ? novedades.find((x) => x.id === n.id) : undefined;
      const mismaClasificacion =
        !!original &&
        original.impacto === fila.impacto &&
        original.relevancia === fila.relevancia &&
        [...(original.sectores ?? [])].sort().join("|") === [...fila.sectores].sort().join("|");
      const clasificacion_manual = original
        ? original.clasificacion_manual || !mismaClasificacion
        : !!fila.relevancia;
      if (n.id) {
        const { error } = await supabase
          .from("novedades_comercio_exterior")
          .update({ ...fila, ...reinicioEnlace, ...huellaDocumento })
          .eq("id", n.id);
        if (error) {
          if (error.code === "23505") throw new Error(mensajeDuplicado(error.message));
          throw error;
        }
        if (enlaceCambiado) void verificar({ data: { ids: [n.id] } }).then(refrescar).catch(() => undefined);
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { data: creada, error } = await supabase
          .from("novedades_comercio_exterior")
          .insert({ ...fila, ...huellaDocumento, origen: "manual", created_by: u.user?.id ?? null })
          .select("id")
          .maybeSingle();
        if (creada?.id) void verificar({ data: { ids: [creada.id] } }).then(refrescar).catch(() => undefined);
        if (error) {
          if (error.code === "23505") throw new Error(mensajeDuplicado(error.message));
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Novedad guardada");
      setNovedadEditando(null);
      refrescar();
    },
    onError: fallo,
  });

  const eliminarNovedad = useMutation({
    mutationFn: async (n: Novedad) => {
      const { error } = await supabase.from("novedades_comercio_exterior").delete().eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Novedad eliminada");
      refrescar();
    },
    onError: fallo,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Novedades de comercio exterior</h1>
          <p className="text-[12px] text-muted-foreground">
            El Asistente ADECOMEX responde sobre novedades usando solo esta lista. La revisión
            automática corre en el servidor cada día a las 7:00 a. m., aunque nadie tenga la
            plataforma abierta.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => ejecutarRevision(null)}
          disabled={!!revisando || estado?.estado === "pausado"}
        >
          <RefreshCw className={`h-4 w-4 ${revisando === "todas" ? "animate-spin" : ""}`} />
          {revisando === "todas" ? "Revisando…" : "Revisar fuentes ahora"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span>
          Última revisión: {fmtFechaHora(estado?.ultima_ejecucion ?? null)}
          {modoUltima === "cron" ? " (automática)" : modoUltima === "manual" ? " (manual)" : ""}
        </span>
        {estado?.estado === "pausado" && (
          <span className="flex flex-wrap items-center gap-2 text-destructive">
            Revisión automática pausada: {estado.motivo_pausa}
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => reanudar.mutate()}
              disabled={reanudar.isPending}
            >
              Reanudar
            </Button>
          </span>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-sm">Fuentes</CardTitle>
            <CardDescription className="text-[12px]">
              Las seis primeras son sugerencias: verifica cada dirección con «Probar». Si una fuente
              no se puede leer, márcala como «Solo manual» y carga sus novedades abajo.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFuenteEditando({ tipo: "web", activa: true })}
          >
            <Plus className="h-4 w-4" /> Agregar fuente
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-left text-[11px] uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Fuente</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Activa</th>
                <th className="py-2 pr-3">Última lectura</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.map((f) => {
                const e = ESTADO_FUENTE[f.ultimo_estado];
                return (
                  <tr key={f.id} className="border-b align-top last:border-0">
                    <td className="max-w-[22rem] py-2 pr-3">
                      <div className="font-medium">{f.nombre}</div>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-primary hover:underline"
                        title={f.url}
                      >
                        {f.url}
                      </a>
                      {f.notas && (
                        <div className="text-[11px] text-muted-foreground">{f.notas}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{TIPO_FUENTE[f.tipo]}</td>
                    <td className="py-2 pr-3">
                      <Switch
                        checked={f.activa}
                        onCheckedChange={(v) => cambiarActiva.mutate({ id: f.id, activa: v })}
                        aria-label={`Activar ${f.nombre}`}
                      />
                    </td>
                    <td className="max-w-[20rem] py-2 pr-3">
                      <Badge variant={e.variante} className="text-[11px]">
                        {e.texto}
                      </Badge>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtFechaHora(f.ultima_revision)}
                      </div>
                      {f.ultimo_mensaje && <div className="text-[11px]">{f.ultimo_mensaje}</div>}
                      <HistorialResumen
                        intentos={intentosPorFuente.get(f.id) ?? []}
                        onVer={() => setHistorialDe(f)}
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        {f.tipo !== "manual" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Probar esta fuente ahora"
                            aria-label={`Probar ${f.nombre}`}
                            disabled={!!revisando || estado?.estado === "pausado"}
                            onClick={() => ejecutarRevision(f.id)}
                          >
                            <PlayCircle
                              className={`h-4 w-4 ${revisando === f.id ? "animate-pulse" : ""}`}
                            />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Editar"
                          aria-label={`Editar ${f.nombre}`}
                          onClick={() => setFuenteEditando(f)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          title="Eliminar"
                          aria-label={`Eliminar ${f.nombre}`}
                          onClick={() => {
                            if (confirm(`¿Eliminar la fuente «${f.nombre}»?`))
                              eliminarFuente.mutate(f.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-sm">Novedades registradas ({novedades.length})</CardTitle>
            <CardDescription className="text-[12px]">
              Puedes corregir los resúmenes, el impacto, los sectores y la relevancia, o cargar
              novedades manualmente. Las de relevancia Alta y Media de los últimos 7 días aparecen
              en el Panel de operaciones.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {sinClasificar > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={clasificarPendientes}
                disabled={clasificando}
                title="La IA asigna impacto, sectores y relevancia con el criterio actual a las novedades sin clasificar o evaluadas con un criterio anterior. No cambia las que corregiste a mano."
              >
                <Sparkles className={`h-4 w-4 ${clasificando ? "animate-pulse" : ""}`} />
                {clasificando ? "Evaluando…" : `Reevaluar relevancia (${sinClasificar})`}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={verificarEnlaces}
              disabled={verificandoEnlaces || novedades.length === 0}
              title="Comprueba ahora que los enlaces de las novedades respondan en el sitio oficial. La revisión diaria también lo hace."
            >
              <Link2 className={`h-4 w-4 ${verificandoEnlaces ? "animate-pulse" : ""}`} />
              {verificandoEnlaces
                ? "Comprobando…"
                : `Verificar enlaces${enlacesCaidos > 0 ? ` (${enlacesCaidos} sin respuesta)` : ""}`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setNovedadEditando({
                  categoria: "Aduanas",
                  impacto: "Otro",
                  sectores: ["General"],
                  relevancia: "Media",
                })
              }
            >
              <Plus className="h-4 w-4" /> Agregar novedad
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="h-9 pl-8 text-[13px]"
              />
            </div>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="h-9 w-[14rem] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las categorías</SelectItem>
                {CATEGORIAS_NOVEDAD.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={relevancia} onValueChange={setRelevancia}>
              <SelectTrigger className="h-9 w-[12rem] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda relevancia</SelectItem>
                {RELEVANCIAS_NOVEDAD.map((r) => (
                  <SelectItem key={r} value={r}>
                    Relevancia {r.toLowerCase()}
                  </SelectItem>
                ))}
                <SelectItem value="sin">Sin clasificar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isLoading ? (
            <p className="text-[12px] text-muted-foreground">Cargando…</p>
          ) : filtradas.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              No hay novedades
              {novedades.length
                ? " con esos filtros"
                : " todavía. Pulsa «Revisar fuentes ahora» o agrega una manualmente"}
              .
            </p>
          ) : (
            <ul className="divide-y">
              {filtradas.map((n) => (
                <li key={n.id} className="flex gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[11px]">
                        {n.categoria}
                      </Badge>
                      <span>{n.fuente_nombre}</span>
                      <span>
                        ·{" "}
                        {mayuscula(textoFechaNovedad(n.fecha_publicacion, n.fecha_captura))}
                      </span>
                      {n.origen === "manual" && <span>· manual</span>}
                      {n.clasificacion_manual && <span>· clasificación corregida a mano</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
                      {n.relevancia ? (
                        <Badge
                          className={`text-[11px] ${RELEVANCIA_CLASE[n.relevancia] ?? ""}`}
                          variant="outline"
                        >
                          Relevancia {n.relevancia.toLowerCase()}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          Sin clasificar
                        </Badge>
                      )}
                      {n.impacto && (
                        <Badge variant="outline" className="text-[11px]">
                          Impacto: {n.impacto}
                        </Badge>
                      )}
                      {n.enlace_estado === "no_disponible" && (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 text-[11px] text-destructive"
                          title={`${n.enlace_mensaje ?? "El sitio oficial no respondió"}${n.enlace_verificado_at ? ` · comprobado ${fmtFechaHora(n.enlace_verificado_at)}` : ""}`}
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" /> Enlace no disponible
                        </Badge>
                      )}
                      {n.sectores.map((sec) => (
                        <Badge key={sec} variant="outline" className="text-[11px] font-normal">
                          {sec}
                        </Badge>
                      ))}
                    </div>
                    <EnlaceNovedad novedad={n} />
                    <p className="text-[12px] text-muted-foreground">{n.resumen}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Editar"
                      aria-label="Editar novedad"
                      onClick={() => setNovedadEditando(n)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      title="Eliminar"
                      aria-label="Eliminar novedad"
                      onClick={() => {
                        if (confirm("¿Eliminar esta novedad?")) eliminarNovedad.mutate(n);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!historialDe} onOpenChange={(o) => !o && setHistorialDe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial de lectura</DialogTitle>
            <DialogDescription>{historialDe?.nombre}</DialogDescription>
          </DialogHeader>
          {historialDe && (
            <HistorialDetalle intentos={intentosPorFuente.get(historialDe.id) ?? []} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistorialDe(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fuenteEditando} onOpenChange={(o) => !o && setFuenteEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fuenteEditando?.id ? "Editar fuente" : "Agregar fuente"}</DialogTitle>
            <DialogDescription>
              Página de noticias o avisos, o canal RSS de la institución.
            </DialogDescription>
          </DialogHeader>
          {fuenteEditando && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  value={fuenteEditando.nombre ?? ""}
                  onChange={(e) => setFuenteEditando({ ...fuenteEditando, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Dirección (página o RSS)</Label>
                <Input
                  value={fuenteEditando.url ?? ""}
                  placeholder="https://"
                  onChange={(e) => setFuenteEditando({ ...fuenteEditando, url: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select
                    value={fuenteEditando.tipo ?? "web"}
                    onValueChange={(v) =>
                      setFuenteEditando({ ...fuenteEditando, tipo: v as Fuente["tipo"] })
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web">Página web</SelectItem>
                      <SelectItem value="rss">RSS</SelectItem>
                      <SelectItem value="manual">Solo manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-[13px]">
                  <Switch
                    checked={fuenteEditando.activa ?? true}
                    onCheckedChange={(v) => setFuenteEditando({ ...fuenteEditando, activa: v })}
                  />
                  Activa
                </label>
              </div>
              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea
                  rows={2}
                  value={fuenteEditando.notas ?? ""}
                  onChange={(e) => setFuenteEditando({ ...fuenteEditando, notas: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFuenteEditando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => fuenteEditando && guardarFuente.mutate(fuenteEditando)}
              disabled={guardarFuente.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!novedadEditando} onOpenChange={(o) => !o && setNovedadEditando(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{novedadEditando?.id ? "Editar novedad" : "Agregar novedad"}</DialogTitle>
            <DialogDescription>
              El asistente citará la fuente, la fecha y el enlace que indiques aquí.
            </DialogDescription>
          </DialogHeader>
          {novedadEditando && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Título</Label>
                <Input
                  value={novedadEditando.titulo ?? ""}
                  onChange={(e) =>
                    setNovedadEditando({ ...novedadEditando, titulo: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Resumen</Label>
                <Textarea
                  rows={3}
                  value={novedadEditando.resumen ?? ""}
                  onChange={(e) =>
                    setNovedadEditando({ ...novedadEditando, resumen: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Enlace original</Label>
                <Input
                  value={novedadEditando.url ?? ""}
                  placeholder="https://"
                  onChange={(e) => setNovedadEditando({ ...novedadEditando, url: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="min-w-0 space-y-1">
                  <Label>Fuente</Label>
                  <Select
                    value={novedadEditando.fuente_id ?? ""}
                    onValueChange={(v) =>
                      setNovedadEditando({
                        ...novedadEditando,
                        fuente_id: v,
                        fuente_nombre: fuentes.find((f) => f.id === v)?.nombre ?? "",
                      })
                    }
                  >
                    <SelectTrigger title={novedadEditando.fuente_nombre ?? ""}>
                      <SelectValue placeholder={novedadEditando.fuente_nombre || "Elegir"} />
                    </SelectTrigger>
                    <SelectContent>
                      {fuentes.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1">
                  <Label>Categoría</Label>
                  <Select
                    value={novedadEditando.categoria ?? ""}
                    onValueChange={(v) =>
                      setNovedadEditando({ ...novedadEditando, categoria: v as CategoriaNovedad })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS_NOVEDAD.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1">
                  <Label>Fecha de publicación</Label>
                  <Input
                    type="date"
                    value={novedadEditando.fecha_publicacion ?? ""}
                    onChange={(e) =>
                      setNovedadEditando({
                        ...novedadEditando,
                        fecha_publicacion: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1">
                  <Label>Impacto</Label>
                  <Select
                    value={novedadEditando.impacto ?? ""}
                    onValueChange={(v) => setNovedadEditando({ ...novedadEditando, impacto: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin clasificar" />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPACTOS_NOVEDAD.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1">
                  <Label>Relevancia</Label>
                  <Select
                    value={novedadEditando.relevancia ?? ""}
                    onValueChange={(v) => setNovedadEditando({ ...novedadEditando, relevancia: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin clasificar" />
                    </SelectTrigger>
                    <SelectContent>
                      {RELEVANCIAS_NOVEDAD.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Sectores afectados</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {SECTORES_NOVEDAD.map((sec) => {
                    const actuales = novedadEditando.sectores ?? [];
                    return (
                      <label key={sec} className="flex items-center gap-1.5 text-[13px]">
                        <Checkbox
                          checked={actuales.includes(sec)}
                          onCheckedChange={(v) =>
                            setNovedadEditando({
                              ...novedadEditando,
                              sectores: v
                                ? [...actuales, sec]
                                : actuales.filter((x) => x !== sec),
                            })
                          }
                        />
                        {sec}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovedadEditando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => novedadEditando && guardarNovedad.mutate(novedadEditando)}
              disabled={guardarNovedad.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const RELEVANCIA_CLASE: Record<string, string> = {
  Alta: "border-transparent bg-destructive/15 text-destructive",
  Media: "border-transparent bg-[var(--warning)]/25 text-[var(--warning-foreground)]",
  Baja: "text-muted-foreground",
};

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function HistorialResumen({ intentos, onVer }: { intentos: Intento[]; onVer: () => void }) {
  const r = patronIntentos(intentos);
  const p = PATRON[r.patron];
  // Más antiguo a la izquierda, más reciente a la derecha.
  const recientes = intentos.slice(0, PUNTOS_HISTORIAL).reverse();
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      {recientes.length > 0 && (
        <span className="flex items-center gap-0.5" aria-hidden>
          {recientes.map((i) => (
            <span
              key={i.id}
              title={`${fmtFechaHora(i.created_at)} · ${i.exito ? "Éxito" : "Fallo"}`}
              className={`h-2 w-2 rounded-full ${i.exito ? "bg-primary" : "bg-destructive"}`}
            />
          ))}
        </span>
      )}
      <span className={p.clase}>
        {p.texto}
        {r.total > 0 && ` · ${r.fallos} fallo(s) en ${r.total} intento(s)`}
      </span>
      {r.total > 0 && (
        <button
          type="button"
          onClick={onVer}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <History className="h-3 w-3" /> Ver historial
        </button>
      )}
    </div>
  );
}

function HistorialDetalle({ intentos }: { intentos: Intento[] }) {
  const r = patronIntentos(intentos);
  return (
    <div className="space-y-2">
      <p className={`text-[12px] ${PATRON[r.patron].clase}`}>
        {PATRON[r.patron].texto}: {r.total - r.fallos} con éxito y {r.fallos} fallido(s) de{" "}
        {r.total} intento(s) registrados.
      </p>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-background text-left text-[11px] uppercase text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Revisión</th>
              <th className="py-2 pr-3">Resultado</th>
              <th className="py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {intentos.map((i) => (
              <tr key={i.id} className="border-b align-top last:border-0">
                <td className="py-2 pr-3 whitespace-nowrap">{fmtFechaHora(i.created_at)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {i.modo === "cron" ? "Automática" : "Manual"}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  <Badge variant={i.exito ? "secondary" : "destructive"} className="text-[11px]">
                    {i.exito ? "Éxito" : "Fallo"}
                  </Badge>
                  <div className="text-[11px] text-muted-foreground">
                    {ESTADO_INTENTO[i.estado] ?? i.estado}
                    {i.codigo_http ? ` · código ${i.codigo_http}` : ""}
                  </div>
                </td>
                <td className="py-2 text-[11px]">{i.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
