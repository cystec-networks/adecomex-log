// «Limpiar archivos sin uso»: vista previa de archivos guardados que nada usa, envío a la Papelera
// (30 días, restaurable), borrado definitivo solo del Administrador y lista de archivos que se conservan.
// La base de datos vuelve a comprobar cada archivo antes de enviarlo o borrarlo y deja Auditoría.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";
import { useNombresUsuarios } from "@/components/documento-historial";
import { nombreArchivo } from "@/lib/codigo-siga";
import { formatoTamanoArchivo } from "@/lib/documento-tamano";
import { fmtFechaHora } from "@/lib/documento-versiones";
import { DIAS_RESTAURACION, diasParaRestaurar, puedeRestaurar } from "@/lib/documentos-papelera";
import { enLotes, grupoArchivoSinUso, resumenPorGrupo, totalSeleccion, type ArchivoSinUso } from "@/lib/archivos-sin-uso";

const TITULO = "Limpiar archivos sin uso | ADECOMEX";
const DESCRIPCION = "Vista previa de archivos guardados que ningún documento usa, Papelera de archivos y archivos conservados.";

export const Route = createFileRoute("/_authenticated/admin/archivos-sin-uso")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: ArchivosSinUso,
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

type FilaPapelera = { id: string; storage_path: string; tamano: number | null; motivo: string | null; eliminado_por: string | null; eliminado_en: string; subido_en: string | null };
type FilaConservada = { id: string; storage_path: string; motivo: string | null; creado_en: string };

const tam = (b: number | null | undefined) => formatoTamanoArchivo(b ?? 0) ?? "—";
const mensaje = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));
const SIN_FILAS: ArchivoSinUso[] = [];
const SIN_PAPELERA: FilaPapelera[] = [];
const SIN_CONSERVADOS: FilaConservada[] = [];

function NombreArchivo({ ruta, extra }: { ruta: string; extra?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="break-all text-[12px] font-medium" title={ruta}>{nombreArchivo(ruta) || ruta}</div>
      <div className="text-[11px] text-muted-foreground">{grupoArchivoSinUso(ruta)}{extra ? ` · ${extra}` : ""}</div>
    </div>
  );
}

function ArchivosSinUso() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("vista");
  const sinUso = useQuery({
    queryKey: ["archivos-sin-uso"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("archivos_sin_uso");
      if (error) throw error;
      return (data ?? []) as ArchivoSinUso[];
    },
  });
  const papelera = useQuery({
    queryKey: ["archivos-papelera"],
    queryFn: async () => {
      const { data, error } = await supabase.from("archivos_papelera").select("id, storage_path, tamano, motivo, eliminado_por, eliminado_en, subido_en").order("eliminado_en", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FilaPapelera[];
    },
  });
  const conservados = useQuery({
    queryKey: ["archivos-conservados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("archivos_conservados").select("id, storage_path, motivo, creado_en").order("creado_en", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FilaConservada[];
    },
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["archivos-sin-uso"] });
    qc.invalidateQueries({ queryKey: ["archivos-papelera"] });
    qc.invalidateQueries({ queryKey: ["archivos-conservados"] });
  };
  const nPapelera = papelera.data?.length ?? 0;
  const bytesPapelera = (papelera.data ?? []).reduce((s, f) => s + (f.tamano ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3 md:p-4">
      <div>
        <h1 className="text-base font-semibold">Limpiar archivos sin uso</h1>
        <p className="text-[12px] text-muted-foreground">
          Archivos guardados que ningún documento, factura, permiso, gasto, correo, versión ni Papelera usa. Al enviarlos a la Papelera no se mueven: se pueden restaurar durante {DIAS_RESTAURACION} días y el espacio se libera cuando el Administrador los borra definitivamente. No aparecen los subidos en los últimos 2 días ni los marcados como «Conservar».
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="vista">Vista previa ({sinUso.data?.length ?? "…"})</TabsTrigger>
          <TabsTrigger value="papelera">Papelera de archivos ({nPapelera}{nPapelera ? ` · ${tam(bytesPapelera)}` : ""})</TabsTrigger>
          <TabsTrigger value="conservados">Conservados ({conservados.data?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="vista">
          <VistaPrevia filas={sinUso.data ?? SIN_FILAS} cargando={sinUso.isLoading} error={sinUso.error} onCambio={refrescar} onEnviado={() => setTab("papelera")} />
        </TabsContent>
        <TabsContent value="papelera">
          <PapeleraArchivos filas={papelera.data ?? SIN_PAPELERA} cargando={papelera.isLoading} onCambio={refrescar} />
        </TabsContent>
        <TabsContent value="conservados">
          <Conservados filas={conservados.data ?? SIN_CONSERVADOS} onCambio={refrescar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VistaPrevia({ filas, cargando, error, onCambio, onEnviado }: { filas: ArchivoSinUso[]; cargando: boolean; error: unknown; onCambio: () => void; onEnviado: () => void }) {
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [conservar, setConservar] = useState<ArchivoSinUso | null>(null);
  const [motivoConservar, setMotivoConservar] = useState("");
  const seleccion = useMemo(() => new Set(filas.map((f) => f.storage_path).filter((r) => !desmarcados.has(r))), [filas, desmarcados]);
  const total = totalSeleccion(filas, seleccion);
  const grupos = useMemo(() => resumenPorGrupo(filas), [filas]);
  const totalBytes = filas.reduce((s, f) => s + (f.tamano ?? 0), 0);
  const alternar = (ruta: string) => setDesmarcados((prev) => { const n = new Set(prev); if (n.has(ruta)) n.delete(ruta); else n.add(ruta); return n; });

  const enviar = async () => {
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("archivos_enviar_papelera", { _rutas: [...seleccion], _motivo: motivo.trim() || undefined });
      if (error) throw error;
      const r = data as { enviados: number; bytes: number; omitidos: string[] };
      toast.success(`${r.enviados} archivo(s) enviados a la Papelera (${tam(r.bytes)}).${r.omitidos.length ? ` ${r.omitidos.length} se omitieron porque ya se usan o cambiaron.` : ""}`, { duration: 8000 });
      setConfirmar(false); setMotivo(""); setDesmarcados(new Set());
      onCambio(); onEnviado();
    } catch (e) { toast.error(`No se pudo enviar a la Papelera: ${mensaje(e)}`); } finally { setEnviando(false); }
  };
  const guardarConservar = async () => {
    if (!conservar) return;
    try {
      const { error } = await supabase.rpc("archivo_conservar", { _ruta: conservar.storage_path, _motivo: motivoConservar.trim() || undefined });
      if (error) throw error;
      toast.success("Archivo marcado como «Conservar»: no entrará en la limpieza.");
      setConservar(null); setMotivoConservar(""); onCambio();
    } catch (e) { toast.error(`No se pudo marcar: ${mensaje(e)}`); }
  };

  if (cargando) return <div className="py-6 text-center text-sm text-muted-foreground">Revisando archivos…</div>;
  if (error) return <div className="py-6 text-center text-sm text-destructive">No se pudo revisar: {mensaje(error)}</div>;
  if (!filas.length) return <div className="py-6 text-center text-sm text-muted-foreground">No hay archivos sin uso.</div>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border p-2">
          <div className="text-[11px] text-muted-foreground">Archivos sin uso</div>
          <div className="text-base font-semibold">{filas.length} · {tam(totalBytes)}</div>
        </div>
        {grupos.slice(0, 3).map((g) => (
          <div key={g.grupo} className="rounded-md border p-2">
            <div className="text-[11px] text-muted-foreground">{g.grupo}</div>
            <div className="text-[13px] font-medium">{g.archivos} · {tam(g.bytes)}</div>
          </div>
        ))}
      </div>
      {grupos.length > 3 && (
        <div className="text-[11px] text-muted-foreground">
          {grupos.slice(3).map((g) => `${g.grupo}: ${g.archivos} · ${tam(g.bytes)}`).join(" · ")}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setDesmarcados(new Set())}>Marcar todos</Button>
        <Button size="sm" variant="outline" onClick={() => setDesmarcados(new Set(filas.map((f) => f.storage_path)))}>Desmarcar todos</Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">{total.archivos} seleccionados · {tam(total.bytes)}</span>
          <Button size="sm" variant="destructive" disabled={!total.archivos} onClick={() => setConfirmar(true)}>
            <Trash2 className="mr-1 h-4 w-4" />Enviar a la Papelera
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[44rem] text-[12px]">
          <thead className="border-b bg-muted/20 text-[11px] text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-1.5"></th>
              <th className="py-1.5 text-left">Archivo</th>
              <th className="text-left">Expediente</th>
              <th className="text-right">Tamaño</th>
              <th className="px-2 text-left">Subido</th>
              <th className="px-2 py-1.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.storage_path} className="border-b last:border-0 align-top">
                <td className="px-2 py-1.5"><Checkbox checked={seleccion.has(f.storage_path)} onCheckedChange={() => alternar(f.storage_path)} aria-label={`Seleccionar ${nombreArchivo(f.storage_path)}`} /></td>
                <td className="max-w-[26rem] py-1.5 pr-2"><NombreArchivo ruta={f.storage_path} /></td>
                <td className="whitespace-nowrap py-1.5 pr-2">{f.expediente_numero ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap py-1.5 text-right">{tam(f.tamano)}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{fmtFechaHora(f.subido_en)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <DocumentoPreviewButton path={f.storage_path} variant="ghost" size="sm" label="Ver" />
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => { setConservar(f); setMotivoConservar(""); }}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />Conservar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={confirmar} onOpenChange={(o) => { if (!enviando) setConfirmar(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>¿Enviar {total.archivos} archivo(s) a la Papelera?</DialogTitle>
            <DialogDescription>
              Ocupan {tam(total.bytes)}. Se podrán restaurar durante {DIAS_RESTAURACION} días; el espacio se libera cuando el Administrador los borre definitivamente. Antes de enviarlos se comprueba otra vez que nada los usa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-archivos">Motivo (opcional)</Label>
            <Textarea id="motivo-archivos" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: limpieza de archivos sin uso" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)} disabled={enviando}>Cancelar</Button>
            <Button variant="destructive" onClick={enviar} disabled={enviando}><Trash2 className="mr-1 h-4 w-4" />{enviando ? "Enviando…" : "Enviar a la Papelera"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!conservar} onOpenChange={(o) => { if (!o) setConservar(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conservar archivo</DialogTitle>
            <DialogDescription className="break-all">«{conservar ? nombreArchivo(conservar.storage_path) : ""}» no volverá a aparecer en la limpieza hasta que lo quites de «Conservados».</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-conservar">Motivo (opcional)</Label>
            <Input id="motivo-conservar" value={motivoConservar} onChange={(e) => setMotivoConservar(e.target.value)} placeholder="Ej.: lo revisaré antes de decidir" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConservar(null)}>Cancelar</Button>
            <Button onClick={guardarConservar}><ShieldCheck className="mr-1 h-4 w-4" />Conservar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PapeleraArchivos({ filas, cargando, onCambio }: { filas: FilaPapelera[]; cargando: boolean; onCambio: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [texto, setTexto] = useState("");
  const nombres = useNombresUsuarios(filas.map((f) => f.eliminado_por));
  const elegidas = filas.filter((f) => sel.has(f.id));
  const bytes = elegidas.reduce((s, f) => s + (f.tamano ?? 0), 0);
  const todas = filas.length > 0 && elegidas.length === filas.length;
  const alternar = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const restaurar = async () => {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("archivos_restaurar_papelera", { _ids: elegidas.map((f) => f.id) });
      if (error) throw error;
      toast.success(`${data ?? 0} archivo(s) restaurados.`);
      setSel(new Set()); onCambio();
    } catch (e) { toast.error(`No se pudo restaurar: ${mensaje(e)}`); } finally { setOcupado(false); }
  };
  const purgar = async () => {
    if (texto !== "ELIMINAR") return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("archivos_purgar_papelera", { _ids: elegidas.map((f) => f.id) });
      if (error) throw error;
      const r = data as { rutas: string[]; en_uso: string[]; bytes: number };
      const fallos: string[] = [];
      for (const lote of enLotes(r.rutas)) {
        const { error: se } = await supabase.storage.from("documentos").remove(lote);
        if (se) fallos.push(se.message);
      }
      if (fallos.length) toast.warning(`Algunos archivos no se pudieron borrar y volverán a aparecer en la vista previa: ${fallos[0]}`, { duration: 10000 });
      toast.success(`${r.rutas.length} archivo(s) borrados definitivamente (${tam(r.bytes)}).${r.en_uso.length ? ` ${r.en_uso.length} volvieron a usarse y solo salieron de la Papelera.` : ""}`, { duration: 8000 });
      setSel(new Set()); setBorrar(false); setTexto(""); onCambio();
    } catch (e) { toast.error(`No se pudo borrar: ${mensaje(e)}`); } finally { setOcupado(false); }
  };

  if (cargando) return <div className="py-6 text-center text-sm text-muted-foreground">Cargando…</div>;
  if (!filas.length) return <div className="py-6 text-center text-sm text-muted-foreground">No hay archivos en la Papelera.</div>;
  const vencidas = elegidas.some((f) => !puedeRestaurar(f.eliminado_en));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setSel(todas ? new Set() : new Set(filas.map((f) => f.id)))}>{todas ? "Desmarcar todos" : "Marcar todos"}</Button>
        <span className="text-[12px] text-muted-foreground">{elegidas.length} seleccionados · {tam(bytes)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!elegidas.length || ocupado || vencidas} onClick={restaurar} title={vencidas ? `Hay archivos con más de ${DIAS_RESTAURACION} días` : undefined}>
            <RotateCcw className="mr-1 h-4 w-4" />Restaurar
          </Button>
          <Button size="sm" variant="destructive" disabled={!elegidas.length || ocupado} onClick={() => { setBorrar(true); setTexto(""); }}>
            <Trash2 className="mr-1 h-4 w-4" />Borrar definitivamente
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[44rem] text-[12px]">
          <thead className="border-b bg-muted/20 text-[11px] text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-1.5"></th>
              <th className="py-1.5 text-left">Archivo</th>
              <th className="text-right">Tamaño</th>
              <th className="px-2 text-left">Enviado</th>
              <th className="text-left">Motivo</th>
              <th className="px-2 text-left">Restaurable</th>
              <th className="px-2 py-1.5 text-right">Ver</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const dias = diasParaRestaurar(f.eliminado_en);
              return (
                <tr key={f.id} className="border-b last:border-0 align-top">
                  <td className="px-2 py-1.5"><Checkbox checked={sel.has(f.id)} onCheckedChange={() => alternar(f.id)} aria-label={`Seleccionar ${nombreArchivo(f.storage_path)}`} /></td>
                  <td className="max-w-[24rem] py-1.5 pr-2"><NombreArchivo ruta={f.storage_path} /></td>
                  <td className="whitespace-nowrap py-1.5 text-right">{tam(f.tamano)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <div>{fmtFechaHora(f.eliminado_en)}</div>
                    <div className="text-[11px] text-muted-foreground">{f.eliminado_por ? nombres[f.eliminado_por] ?? "Usuario" : "—"}</div>
                  </td>
                  <td className="max-w-[12rem] whitespace-normal break-words py-1.5 pr-2">{f.motivo || <span className="text-muted-foreground">—</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{dias > 0 ? (dias > 1 ? `${dias} días` : "Último día") : <span className="text-destructive">Vencido</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right"><DocumentoPreviewButton path={f.storage_path} variant="ghost" size="sm" label="Ver" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={borrar} onOpenChange={(o) => { if (!ocupado) setBorrar(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Borrar definitivamente</DialogTitle>
            <DialogDescription>
              Se borrarán {elegidas.length} archivo(s) ({tam(bytes)}). Esta acción es irreversible y queda en Auditoría. Si alguno volvió a usarse, solo sale de la Papelera.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="confirmar-borrado-archivos">Escribe ELIMINAR para confirmar</Label>
            <Input id="confirmar-borrado-archivos" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrar(false)} disabled={ocupado}>Cancelar</Button>
            <Button variant="destructive" onClick={purgar} disabled={texto !== "ELIMINAR" || ocupado}>{ocupado ? "Borrando…" : "Borrar definitivamente"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Conservados({ filas, onCambio }: { filas: FilaConservada[]; onCambio: () => void }) {
  const quitar = async (f: FilaConservada) => {
    try {
      const { error } = await supabase.rpc("archivo_quitar_conservado", { _id: f.id });
      if (error) throw error;
      toast.success("Quitado de «Conservados»: si nada lo usa, volverá a la vista previa.");
      onCambio();
    } catch (e) { toast.error(`No se pudo quitar: ${mensaje(e)}`); }
  };
  if (!filas.length) return <div className="py-6 text-center text-sm text-muted-foreground">No hay archivos marcados para conservar.</div>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[36rem] text-[12px]">
        <thead className="border-b bg-muted/20 text-[11px] text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left">Archivo</th>
            <th className="text-left">Motivo</th>
            <th className="px-2 text-left">Desde</th>
            <th className="px-2 py-1.5 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-b last:border-0 align-top">
              <td className="max-w-[26rem] px-2 py-1.5"><NombreArchivo ruta={f.storage_path} /></td>
              <td className="max-w-[14rem] whitespace-normal break-words py-1.5 pr-2">{f.motivo || <span className="text-muted-foreground">—</span>}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{fmtFechaHora(f.creado_en)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right">
                <DocumentoPreviewButton path={f.storage_path} variant="ghost" size="sm" label="Ver" />
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => quitar(f)}><Archive className="mr-1 h-3.5 w-3.5" />Quitar</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
