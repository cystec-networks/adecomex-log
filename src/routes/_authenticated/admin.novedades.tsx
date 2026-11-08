import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Pencil, PlayCircle, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { CATEGORIAS_NOVEDAD, type CategoriaNovedad } from "@/lib/novedades-comercio";
import { revisarNovedadesAhora } from "@/lib/novedades-comercio.functions";

type Fuente = Database["public"]["Tables"]["fuentes_novedades"]["Row"];
type Novedad = Database["public"]["Tables"]["novedades_comercio_exterior"]["Row"];
type EstadoRevision = Database["public"]["Tables"]["novedades_revision_estado"]["Row"];

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
const TIPO_FUENTE: Record<Fuente["tipo"], string> = {
  web: "Página web",
  rss: "RSS",
  manual: "Solo manual",
};

function NovedadesAdmin() {
  const qc = useQueryClient();
  const revisar = useServerFn(revisarNovedadesAhora);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [fuenteEditando, setFuenteEditando] = useState<Partial<Fuente> | null>(null);
  const [novedadEditando, setNovedadEditando] = useState<Partial<Novedad> | null>(null);
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
        (!q || `${n.titulo} ${n.resumen} ${n.fuente_nombre}`.toLowerCase().includes(q)),
    );
  }, [novedades, busqueda, categoria]);

  const refrescar = () => qc.invalidateQueries({ queryKey: CLAVE });
  const fallo = (e: Error) => toast.error(e.message || "No se pudo guardar");

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
      const url = n.url?.trim() ?? "";
      const fuente = fuentes.find((f) => f.id === n.fuente_id);
      const fuente_nombre = (fuente?.nombre ?? n.fuente_nombre ?? "").trim();
      if (!titulo || !resumen) throw new Error("Escribe el título y el resumen");
      if (!/^https?:\/\//i.test(url))
        throw new Error("Indica el enlace original (http:// o https://)");
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
      };
      if (n.id) {
        const { error } = await supabase
          .from("novedades_comercio_exterior")
          .update(fila)
          .eq("id", n.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("novedades_comercio_exterior")
          .insert({ ...fila, origen: "manual", created_by: u.user?.id ?? null });
        if (error) {
          if (error.code === "23505") throw new Error("Ya existe una novedad con ese mismo enlace");
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
            El Asistente ADECOMEX responde sobre novedades usando solo esta lista. Se revisa sola
            cada día a las 7:00 a. m.
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
        <span>Última revisión: {fmtFechaHora(estado?.ultima_ejecucion ?? null)}</span>
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
              Puedes corregir los resúmenes automáticos o cargar novedades manualmente.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNovedadEditando({ categoria: "Aduanas" })}
          >
            <Plus className="h-4 w-4" /> Agregar novedad
          </Button>
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
                        {n.fecha_publicacion
                          ? fmtFecha(n.fecha_publicacion)
                          : `registrada ${fmtFechaHora(n.fecha_captura)}`}
                      </span>
                      {n.origen === "manual" && <span>· manual</span>}
                    </div>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                    >
                      {n.titulo} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
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
