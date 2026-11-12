import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Eye, FilePlus2, ListChecks, Loader2, Paperclip, Replace, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DESCARTE_BREVE, type CategoriaDescarte } from "@/lib/correo-expediente";
import {
  DIAS_ADJUNTOS_DESCARTADOS, DIAS_REGISTRO_DESCARTADOS, RESULTADO_CORREO, conflictosPendientes, correoAtascado, diasRestantes, prioridadDescarte, registroCorreos,
  type CorreoRecibido,
} from "@/lib/correos-recibidos";
import { SimularLimpieza } from "@/components/correos/simular-limpieza";
import { crearSolicitudDesdeCorreo, procesarColaCorreosAhora, quitarCorreosDelRegistro, resolverConflictoCorreo } from "@/lib/correos-recibidos.functions";
import { textoCola } from "@/lib/correos-cola";

const FILTROS = [
  { id: "principal", etiqueta: "Errores + Creadas + Adjuntadas" },
  { id: "error", etiqueta: "Errores" },
  { id: "en_cola", etiqueta: "En cola (IA)" },
  { id: "creada", etiqueta: "Creadas" },
  { id: "adjuntada", etiqueta: "Adjuntadas a Expediente" },
  { id: "descartada", etiqueta: "Descartadas" },
] as const;

const TONO: Record<string, string> = {
  ok: "bg-[var(--success)]/15 text-[var(--success)] border-transparent",
  info: "bg-[var(--info)]/15 text-[var(--info)] border-transparent",
  aviso: "bg-[var(--warning)]/25 text-[var(--warning-foreground)] border-transparent",
  error: "bg-destructive/15 text-destructive border-transparent",
};

const GRUPO_DESCARTE = ["Con PDF (remitente no ignorado)", "Sin PDF", "Remitentes ignorados"] as const;

const fechaHora = (s: string) => new Date(s).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });
const dias = (n: number) => (n === 0 ? "hoy" : `en ${n} día${n === 1 ? "" : "s"}`);

function Retencion({ c }: { c: CorreoRecibido }) {
  const respaldo = Array.isArray(c.adjuntos_respaldo) ? c.adjuntos_respaldo.length : 0;
  const linea = diasRestantes(c.descartado_en, DIAS_REGISTRO_DESCARTADOS);
  const adj = diasRestantes(c.descartado_en, DIAS_ADJUNTOS_DESCARTADOS);
  if (linea == null) return null;
  return (
    <div className="text-[11px] text-muted-foreground flex items-start gap-1">
      <Clock className="h-3 w-3 mt-0.5 shrink-0" />
      <span>
        {c.adjuntos_borrados_en ? "Adjuntos borrados. " : respaldo > 0 && adj != null ? `Adjuntos se borran ${dias(adj)}. ` : ""}
        Se quita del registro {dias(linea)}.
      </span>
    </div>
  );
}

/** Auditoría: cada correo entregado por el script con su resultado, para comprobar que ninguno se pierde. */
export function RegistroCorreos({ filtroInicial }: { filtroInicial?: string }) {
  const [filtro, setFiltro] = useState<string>(FILTROS.some((f) => f.id === filtroInicial) ? filtroInicial! : "principal");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  useEffect(() => { if (filtroInicial) document.getElementById("registro-correos")?.scrollIntoView({ block: "start" }); }, [filtroInicial]);
  useEffect(() => { setSeleccion(new Set()); }, [filtro]);
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["registro-correos", filtro], queryFn: () => registroCorreos(supabase, filtro), refetchInterval: 60_000 });
  const qc = useQueryClient();
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["registro-correos"] });
    qc.invalidateQueries({ queryKey: ["solicitudes-correo"] });
    qc.invalidateQueries({ queryKey: ["correos-pendientes-kpi"] });
    qc.invalidateQueries({ queryKey: ["alertas-correo"] });
  };
  const crear = useServerFn(crearSolicitudDesdeCorreo);
  const quitar = useServerFn(quitarCorreosDelRegistro);
  const resolver = useServerFn(resolverConflictoCorreo);
  const procesarCola = useServerFn(procesarColaCorreosAhora);
  const { data: enCola = 0 } = useQuery({
    queryKey: ["registro-correos", "cola"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase.from("correos_recibidos").select("id", { count: "exact", head: true }).not("en_cola_desde", "is", null).in("resultado", ["en_cola", "procesando"]);
      return count ?? 0;
    },
  });
  const atenderCola = useMutation({
    mutationFn: () => procesarCola(),
    onSuccess: (r) => {
      if (r.ocupado) toast.info("La cola ya se está procesando; espera unos minutos.");
      else if (r.procesados === 0 && r.pausa) toast.warning(r.pausa === "creditos_ia" ? "Los créditos de IA siguen agotados; los correos siguen en cola." : "El límite diario de IA sigue alcanzado; los correos siguen en cola.");
      else toast.success(`${r.procesados} correo${r.procesados === 1 ? "" : "s"} procesado${r.procesados === 1 ? "" : "s"}${r.pendientes ? `; quedan ${r.pendientes} en cola` : ""}.`);
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo procesar la cola"),
  });
  const crearSolicitud = useMutation({
    mutationFn: (registroId: string) => crear({ data: { registroId } }),
    onSuccess: (r) => {
      if (r.resultado === "adjuntada") toast.success(`El correo corresponde al Expediente ${r.expediente_numero}; sus documentos se adjuntaron allí.`);
      else toast.success(r.resultado === "actualizada" ? "Se actualizó la solicitud pendiente de este remitente." : "Solicitud creada. Revísala en la bandeja de solicitudes.");
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear la solicitud"),
  });
  const quitarSeleccion = useMutation({
    mutationFn: (ids: string[]) => quitar({ data: { ids } }),
    onSuccess: (r) => { toast.success(`${r.quitados} correo${r.quitados === 1 ? "" : "s"} quitado${r.quitados === 1 ? "" : "s"} del registro.`); setSeleccion(new Set()); refrescar(); },
    onError: (e: Error) => toast.error(e.message || "No se pudo quitar del registro"),
  });
  const decidir = useMutation({
    mutationFn: (v: { registroId: string; ruta: string; accion: "reemplazar" | "descartar" }) => resolver({ data: v }),
    onSuccess: (r) => { toast.success(r.accion === "reemplazar" ? "Documento reemplazado en el Expediente." : "Archivo descartado; el Expediente no cambió."); refrescar(); },
    onError: (e: Error) => toast.error(e.message || "No se pudo aplicar la decisión"),
  });
  const verPdf = async (ruta: string) => {
    const { data: u, error } = await supabase.storage.from("documentos").createSignedUrl(ruta, 600);
    if (error || !u?.signedUrl) { toast.error("No se pudo abrir el archivo"); return; }
    window.open(u.signedUrl, "_blank", "noopener,noreferrer");
  };

  const ids = useMemo(() => data.map((c) => c.id), [data]);
  const todos = ids.length > 0 && ids.every((i) => seleccion.has(i));
  const alternar = (id: string) => setSeleccion((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className="space-y-2" id="registro-correos">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[14px] font-bold flex items-center gap-2"><ListChecks className="h-4 w-4" />Registro de correos recibidos</h2>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <Button key={f.id} size="sm" variant={filtro === f.id ? "default" : "outline"} className="h-7 px-2 text-[12px]" onClick={() => setFiltro(f.id)}>{f.etiqueta}</Button>
          ))}
        </div>
        <SimularLimpieza />
        {enCola > 0 && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" disabled={atenderCola.isPending} onClick={() => atenderCola.mutate()}
            title="Procesa ahora los correos en cola, en orden de llegada (por ejemplo, después de subir el límite de IA)">
            {atenderCola.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
            Procesar cola ahora ({enCola})
          </Button>
        )}
        {seleccion.size > 0 && (
          <Button size="sm" variant="destructive" className="h-7 px-2 text-[12px] ml-auto" disabled={quitarSeleccion.isPending} onClick={() => setConfirmarQuitar(true)}>
            {quitarSeleccion.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Quitar del registro ({seleccion.size})
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Últimos 200 correos que el buzón entregó a la plataforma. Solo crean solicitud los correos con documentos de importación en PDF que no corresponden a un Expediente. Un correo con error se reintenta automáticamente. Si la IA está detenida (límite diario o créditos agotados), el correo y sus PDF quedan «En cola» y se procesan solos en orden de llegada.
        {filtro === "descartada" && ` Si un correo descartado sí era un embarque, usa «Crear solicitud». Los adjuntos guardados se borran a los ${DIAS_ADJUNTOS_DESCARTADOS} días y la línea a los ${DIAS_REGISTRO_DESCARTADOS}.`}
      </p>
      <Card>
        <CardContent className="p-0 overflow-auto">
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Cargando…</p> : isError ? <p className="p-6 text-sm text-destructive">No se pudo cargar el registro.</p> : data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">Sin correos registrados con este filtro.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="pl-2 py-1.5 w-6"><Checkbox aria-label="Seleccionar todos" checked={todos} onCheckedChange={(v) => setSeleccion(v ? new Set(ids) : new Set())} /></th>
                  <th className="px-2 py-1.5">Último intento</th><th className="px-2">Remitente / Asunto</th><th className="px-2">Resultado</th><th className="px-2">Motivo</th><th className="px-2 text-center">Intentos</th><th className="px-2">Destino</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c, i) => {
                  const atascado = correoAtascado(c);
                  const r = atascado ? { etiqueta: "Interrumpido", tono: "error" as const } : c.resultado === "en_cola" ? { etiqueta: textoCola(c.cola_causa).replace(/^en cola/, "En cola"), tono: "aviso" as const } : RESULTADO_CORREO[c.resultado] ?? { etiqueta: c.resultado, tono: "aviso" as const };
                  const breve = !!c.descarte_categoria && DESCARTE_BREVE.includes(c.descarte_categoria as CategoriaDescarte);
                  const recuperable = !c.adjuntos_borrados_en && !breve && (c.resultado === "descartada" || (c.resultado === "error" && !atascado && (c.cuerpo || c.asunto)));
                  const pendientes = conflictosPendientes(c.conflictos);
                  const grupoDe = (f: CorreoRecibido) => (f as { prioridad?: 0 | 1 | 2 }).prioridad ?? prioridadDescarte(f);
                  const grupo = filtro === "descartada" ? grupoDe(c) : null;
                  const nuevoGrupo = grupo != null && (i === 0 || grupoDe(data[i - 1]) !== grupo);
                  return [
                    nuevoGrupo ? (
                      <tr key={`g-${grupo}`} className="border-t bg-muted/20"><td colSpan={7} className="px-2 py-1 text-[11px] font-medium text-muted-foreground">{GRUPO_DESCARTE[grupo!]}</td></tr>
                    ) : null,
                    <tr key={c.id} className="border-t align-top">
                      <td className="pl-2 py-1.5"><Checkbox aria-label="Seleccionar correo" checked={seleccion.has(c.id)} onCheckedChange={() => alternar(c.id)} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fechaHora(c.ultimo_intento_at)}</td>
                      <td className="px-2 py-1.5 min-w-0 max-w-[420px]">
                        <div className="text-[11px] text-muted-foreground truncate" title={c.remitente}>{c.remitente_correo ?? c.remitente}</div>
                        <div className="break-words">{c.asunto || "(sin asunto)"}</div>
                        {(c.advertencias ?? []).filter((a) => !a.startsWith("La casilla «")).slice(0, 3).map((a) => <div key={a} className="text-[11px] text-warning-foreground">⚠ {a}</div>)}
                      </td>
                      <td className="px-2 py-1.5"><Badge className={`text-[11px] whitespace-nowrap ${TONO[r.tono]}`}>{r.etiqueta}</Badge></td>
                      <td className="px-2 py-1.5 max-w-[360px] break-words space-y-1">
                        <div>{atascado ? "El proceso se interrumpió sin terminar; se reintentará." : c.motivo ?? "—"}</div>
                        {c.resultado === "descartada" && <Retencion c={c} />}
                        {pendientes.map((p) => (
                          <div key={p.storage_path} className="rounded-md border border-warning/40 bg-warning/10 p-1.5 space-y-1">
                            <div className="text-[11px]">La casilla <b>{p.tipo}</b> ya tiene un archivo. Llegó <span className="break-all">{p.nombre}</span>:</div>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => verPdf(p.storage_path)}><Eye className="h-3.5 w-3.5" />Ver</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" disabled={decidir.isPending} onClick={() => decidir.mutate({ registroId: c.id, ruta: p.storage_path, accion: "reemplazar" })}><Replace className="h-3.5 w-3.5" />Reemplazar</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={decidir.isPending} onClick={() => decidir.mutate({ registroId: c.id, ruta: p.storage_path, accion: "descartar" })}><X className="h-3.5 w-3.5" />Descartar</Button>
                            </div>
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-1.5 text-center">{c.intentos}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {c.expediente_id && c.resultado === "adjuntada" ? <Link to="/expedientes/$id" params={{ id: c.expediente_id }} search={{ ficha: "docs" }} className="text-primary hover:underline expediente-numero">{c.expediente_numero}</Link>
                          : c.solicitud_id && c.resultado !== "descartada" ? <span className="text-muted-foreground">Solicitud por correo</span>
                          : c.resultado === "en_cola" ? (
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" />{Array.isArray(c.adjuntos_respaldo) ? c.adjuntos_respaldo.length : 0} PDF guardado{Array.isArray(c.adjuntos_respaldo) && c.adjuntos_respaldo.length === 1 ? "" : "s"}</div>
                          )
                          : recuperable ? (
                            <div className="space-y-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" disabled={crearSolicitud.isPending}
                                onClick={() => crearSolicitud.mutate(c.id)} title={c.solicitud_id ? "Restaurar la solicitud descartada en la bandeja" : "Crear la solicitud con el texto y los PDF guardados de este correo"}>
                                {crearSolicitud.isPending && crearSolicitud.variables === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                                Crear solicitud
                              </Button>
                              {Array.isArray(c.adjuntos_respaldo) && c.adjuntos_respaldo.length > 0 && (
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" />{c.adjuntos_respaldo.length} adjunto{c.adjuntos_respaldo.length === 1 ? "" : "s"} guardado{c.adjuntos_respaldo.length === 1 ? "" : "s"}</div>
                              )}
                            </div>
                          ) : "—"}
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={confirmarQuitar} onOpenChange={setConfirmarQuitar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar {seleccion.size} correo{seleccion.size === 1 ? "" : "s"} del registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran las líneas seleccionadas y sus adjuntos guardados en el registro. Las solicitudes y los documentos ya agregados a Expedientes no cambian.
              Si Gmail vuelve a enviar uno de estos correos, se procesará como nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => quitarSeleccion.mutate([...seleccion])}>Quitar del registro</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
