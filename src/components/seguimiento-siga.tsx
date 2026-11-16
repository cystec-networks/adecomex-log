// UI del Seguimiento SIGA: vista previa antes de guardar, avisos del encabezado, bloque «Datos SIGA»
// en Información General e historial de procesos en Seguimientos.
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiquidacionDga } from "@/components/liquidacion-dga-context";
import { leerSeguimientoSigaDocumento } from "@/lib/seguimiento-siga.functions";
import { aplicarSeguimientoSiga, evaluarSeguimientoSiga, lecturaParaGuardar, type EvaluacionSiga } from "@/lib/seguimiento-siga-evaluar";
import {
  CAMPOS_SIGA, ETIQUETA_AUTO_SIGA, LABEL_CAMPO_SIGA, PROCESOS_SIGA, TIPO_SEGUIMIENTO_SIGA, blParaEmparejar, descripcionInformativaSiga, diferenciasAlertaSiga, esAutomaticoSiga,
  esLecturaSigaFallida, type LecturaSigaFallida, type LecturaSigaGuardada, type SeguimientoSiga,
} from "@/lib/seguimiento-siga";
import { cn } from "@/lib/utils";

export type LecturaSigaPendiente = { documentoId: string; archivo: string | null; datos: SeguimientoSiga; metodo: "texto" | "ia" };

const fmtFechaSiga = (v: string | null | undefined) => {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${y}${v.length > 10 ? ` ${v.slice(11, 16)}` : ""}`;
};
const fmtValor = (campo: string, v: unknown) => {
  if (v == null || v === "") return "—";
  if (campo === "fecha_llegada_real") return fmtFechaSiga(String(v));
  if (campo === "siga_fecha_llegada") return new Date(String(v)).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });
  if (typeof v === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return String(v);
};

export function EtiquetaAutoSiga({ exp, campo, valor }: { exp: Record<string, unknown> | null | undefined; campo: string; valor?: unknown }) {
  if (!esAutomaticoSiga(exp, campo, valor)) return null;
  const reg = ((exp?.siga_auto ?? {}) as Record<string, { fecha?: string; origen?: string }>)[campo];
  const cuando = reg?.fecha ? new Date(reg.fecha).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" }) : "";
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
      title={`Completado desde el Seguimiento SIGA${reg?.origen === "correo" ? " (correo automático)" : ""}${cuando ? ` el ${cuando}` : ""}. Si lo cambias a mano, la etiqueta desaparece.`}>
      <Bot className="h-3 w-3" />{ETIQUETA_AUTO_SIGA}
    </span>
  );
}

const IconoCheck = ({ estado }: { estado: "coincide" | "no_coincide" | "sin_dato" }) =>
  estado === "coincide" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : estado === "no_coincide" ? <XCircle className="h-4 w-4 shrink-0 text-destructive" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />;

/**
 * Vista previa (simulación) antes de guardar: qué se completa, qué se conserva y qué procesos entran
 * al historial. Si BL hijo, cliente o puerto no coinciden, no aplica nada y solo registra el aviso.
 */
export function RevisionSeguimientoSiga({ expedienteId, lectura, onClose }: { expedienteId: string; lectura: LecturaSigaPendiente | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editor = useLiquidacionDga();
  const [ev, setEv] = useState<EvaluacionSiga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setEv(null); setError(null);
    if (!lectura) return;
    let vivo = true;
    // El formulario visible manda: un valor escrito y aún no guardado cuenta como lleno.
    const visible = editor?.current?.leer() ?? null;
    evaluarSeguimientoSiga(supabase, expedienteId, lectura.datos, visible)
      .then((r) => vivo && setEv(r)).catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, [lectura, expedienteId, editor]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    qc.invalidateQueries({ queryKey: ["expedientes"] });
    qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
    qc.invalidateQueries({ queryKey: ["seguimiento-siga", expedienteId] });
    qc.invalidateQueries({ queryKey: ["siga-procesos", expedienteId] });
    qc.invalidateQueries({ queryKey: ["auditoria", expedienteId] });
  };

  const aplicar = async () => {
    if (!lectura || !ev) return;
    setGuardando(true);
    try {
      const r = await aplicarSeguimientoSiga(supabase, { expedienteId, documentoId: lectura.documentoId, datos: lectura.datos, metodo: lectura.metodo, evaluacion: ev, origen: "manual", archivo: lectura.archivo });
      if (ev.validacion.ok) {
        // Solo lo que la base completó llega al formulario: los borradores del usuario se conservan.
        const aplicados = Object.fromEntries(r.completados.filter((k) => k in ev.decision.cambios).map((k) => [k, String(ev.decision.cambios[k])]));
        if (Object.keys(aplicados).length) editor?.current?.aplicar(aplicados as never);
        toast.success(r.completados.length || r.procesos_nuevos || r.procesos_actualizados || r.hitos.length
          ? `Seguimiento SIGA aplicado: ${r.completados.length} campo(s) completado(s), ${r.procesos_nuevos} proceso(s) nuevo(s)${r.procesos_actualizados ? `, ${r.procesos_actualizados} actualizado(s)` : ""}${r.hitos.length ? ", fecha de despacho completo en el Checklist" : ""}.`
          : "Seguimiento SIGA guardado; no había campos vacíos que completar.");
        if (ev.decision.diferencias.length) toast.warning(`${ev.decision.diferencias.length} diferencia(s) con SIGA; se conservaron los datos del Expediente.`, { duration: 10000 });
      } else toast.warning("Seguimiento SIGA registrado sin aplicar datos: no corresponde a este Expediente.", { duration: 10000 });
      refrescar(); onClose();
    } catch (e) {
      toast.error(`No se pudo aplicar el Seguimiento SIGA: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGuardando(false); }
  };

  const dejarPendiente = async () => {
    if (lectura && ev) {
      const pendiente: LecturaSigaGuardada = { ...lecturaParaGuardar(lectura.datos, lectura.metodo, ev, lectura.archivo), estado: "pendiente" };
      await supabase.from("documentos").update({ lectura_siga: pendiente as never }).eq("id", lectura.documentoId);
      refrescar();
    }
    onClose();
  };

  const cambios = ev ? Object.entries(ev.decision.cambios).filter(([k]) => k !== "area_aduanera_codigo") : [];
  const ok = !!ev?.validacion.ok;
  return (
    <Dialog open={!!lectura} onOpenChange={(o) => { if (!o && !guardando) void (ok ? dejarPendiente() : aplicar()); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Seguimiento SIGA · vista previa</DialogTitle>
          <DialogDescription>
            Nada se guarda en el Expediente hasta que presiones «Aplicar». Solo se completan campos vacíos; la Naviera, la descripción y el estado no se tocan.
            {lectura && <> Lectura: {lectura.metodo === "texto" ? "reglas fijas sobre el texto del PDF" : "respaldo con IA (modelo económico)"}.</>}
          </DialogDescription>
        </DialogHeader>
        {!ev && !error && <div className="text-sm text-muted-foreground">Comparando con el Expediente…</div>}
        {error && <div className="text-sm text-destructive">{error}</div>}
        {ev && lectura && (
          <div className="space-y-4 text-[13px]">
            <div className="grid gap-1.5 rounded-md border p-3">
              <div className="font-semibold">Emparejamiento</div>
              {(() => {
                const emp = blParaEmparejar(lectura.datos);
                return (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><IconoCheck estado={ev.validacion.bl} />
                    {emp.fuente === "simple" ? "BL (Tipo de BL Simple, sin BL hijo):" : "Doc.Embarque Hijo:"} <span className="font-medium break-all">{emp.bl ?? "—"}</span>
                    <span className="basis-full pl-6 text-[11px] text-muted-foreground">{emp.fuente === "simple" ? "Se empareja con el BL del documento porque SIGA indica Tipo de BL Simple." : "El BL madre de un consolidado no se usa para emparejar."}{lectura.datos.tipo_bl ? ` Tipo de BL: ${lectura.datos.tipo_bl}.` : ""}</span>
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><IconoCheck estado={ev.validacion.cliente} />Cliente: <span className="font-medium">{[lectura.datos.consignatario, lectura.datos.consignatario_rnc].filter(Boolean).join(" · ") || "—"}</span></div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><IconoCheck estado={ev.validacion.puerto} />Puerto de desembarque: <span className="font-medium">{lectura.datos.puerto_desembarque ?? "—"}</span>{lectura.datos.puerto_descarga && <span className="basis-full pl-6 text-[11px] text-muted-foreground">Puerto de descarga {lectura.datos.puerto_descarga}: solo referencia, no se usa para validar.</span>}</div>
              {ev.validacion.errores.map((e) => <div key={e} className="text-destructive">{e}</div>)}
              {ev.validacion.avisos.map((e) => <div key={e} className="text-muted-foreground text-[12px]">{e}</div>)}
            </div>
            {ok && (
              <>
                <div>
                  <div className="font-semibold mb-1">Se completará ({cambios.length})</div>
                  {cambios.length === 0 ? <div className="text-muted-foreground">No hay campos vacíos que completar.</div> : (
                    <table className="w-full text-[12px]"><tbody>
                      {cambios.map(([k, v]) => (
                        <tr key={k} className="border-b last:border-0"><td className="py-1 pr-2 text-muted-foreground">{LABEL_CAMPO_SIGA[k] ?? k}</td><td className="py-1 font-medium break-all">{k === "area_aduanera" ? `${v} (${ev.decision.cambios.area_aduanera_codigo})` : fmtValor(k, v)}</td></tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
                {ev.decision.diferencias.length > 0 && (
                  <div>
                    <div className="font-semibold mb-1 text-destructive">Diferencias: se conserva el dato del Expediente ({ev.decision.diferencias.length})</div>
                    <table className="w-full text-[12px]"><thead><tr className="text-left text-muted-foreground"><th className="font-normal">Campo</th><th className="font-normal">Expediente</th><th className="font-normal">SIGA</th></tr></thead><tbody>
                      {ev.decision.diferencias.map((d) => (
                        <tr key={d.campo} className="border-b last:border-0 align-top"><td className="py-1 pr-2">{d.label}</td><td className="py-1 pr-2 break-words">{d.expediente}</td><td className="py-1 break-words font-medium">{d.siga}</td></tr>
                      ))}
                    </tbody></table>
                  </div>
                )}
                {ev.decision.coincidentes.length > 0 && <div className="text-muted-foreground text-[12px]">Ya coinciden (sin cambios): {ev.decision.coincidentes.map((k) => LABEL_CAMPO_SIGA[k] ?? k).join(", ")}.</div>}
                {ev.decision.informativos.length > 0 && (
                  <div className="rounded-md bg-muted/40 p-2 text-[12px] text-muted-foreground">
                    <div className="mb-0.5 font-medium">Solo informativo (no se guarda)</div>
                    {ev.decision.informativos.map((i) => (
                      <div key={i.campo} className="break-words">{i.label}: {i.siga}{i.campo === "descripcion_mercancia" ? " · puede estar en otro idioma; la descripción del Expediente no cambia" : i.campo === "siga_bandera" ? " · poco confiable en SIGA, no se completa" : i.campo === "puerto_descarga" ? " · puerto de referencia, no es el del Expediente" : ""}</div>
                    ))}
                  </div>
                )}
                {lectura.datos.despacho_fecha && (
                  <div>
                    <div className="font-semibold mb-1">Despacho completo</div>
                    <div className="text-[12px]">Fecha de proceso en SIGA: <span className="font-medium">{fmtFechaSiga(lectura.datos.despacho_fecha)}</span>{lectura.datos.numero_despacho ? ` · ${lectura.datos.numero_despacho}` : ""}</div>
                    {ev.hitosDespacho.length === 0
                      ? <div className="text-[12px] text-muted-foreground">El Checklist de este Expediente no tiene un hito de levante o despacho completo; la fecha queda en el historial de procesos.</div>
                      : ev.hitosDespacho.map((h) => (
                        <div key={h.codigo} className="text-[12px]">Checklist «{h.nombre}»: {h.resultado === "se_completara" ? <span className="text-primary">se completará con etiqueta Automático</span> : h.resultado === "manual" ? "tiene fecha manual; se conserva" : h.resultado === "no_aplica" ? "marcado No aplica; no se toca" : "ya tiene fecha; se conserva"}</div>
                      ))}
                  </div>
                )}
                <div>
                  <div className="font-semibold mb-1">Procesos SIGA para Seguimientos</div>
                  {lectura.datos.procesos.length === 0 ? <div className="text-muted-foreground">El reporte no trae procesos legibles.</div> : (
                    <ul className="space-y-0.5 text-[12px]">
                      {lectura.datos.procesos.map((p) => {
                        const nuevo = ev.procesosNuevos.includes(p);
                        const actualizado = ev.procesosActualizados.includes(p);
                        return (
                          <li key={`${p.proceso}${p.numero_solicitud}${p.fecha}`}>
                            {PROCESOS_SIGA[p.proceso]}{p.doc_embarque ? ` (${p.doc_embarque})` : ""} · {p.numero_solicitud ?? "sin número"}
                            {p.fecha_creacion ? ` · Creado ${fmtFechaSiga(p.fecha_creacion)}` : ""} · Procesado {fmtFechaSiga(p.fecha)}
                            {p.estado ? ` · ${p.estado}` : ""}{p.localizacion ? ` · ${p.localizacion}` : ""}{" "}
                            <span className={nuevo || actualizado ? "text-primary" : "text-muted-foreground"}>{nuevo ? "(nuevo)" : actualizado ? "(se actualiza estado/fechas)" : "(ya registrado)"}</span>
                            {p.numero_completado && <div className="pl-3 text-[11px] text-muted-foreground">Número cortado en SIGA, completado con el No. de Control de Carga (principio y final coinciden).</div>}
                            {p.numero_truncado && <div className="pl-3 text-[11px] text-destructive">Número cortado en SIGA: no coincide con el No. de Control de Carga; se guarda cortado. Verifícalo en SIGA.</div>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {ev.decision.sugerirEstado && <div className="rounded-md border border-primary/30 bg-primary/5 p-2">SIGA registra llegada real. Después de aplicar podrás confirmar el paso a «Manifestado»; el estado no cambia solo.</div>}
              </>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          {ok ? (
            <>
              <Button variant="outline" onClick={dejarPendiente} disabled={guardando}>Ahora no</Button>
              <Button onClick={aplicar} disabled={guardando || !ev}>{guardando ? "Aplicando…" : "Aplicar"}</Button>
            </>
          ) : (
            <Button onClick={aplicar} disabled={guardando || !ev}>{guardando ? "Registrando…" : "Entendido, no aplicar"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const bytesABase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Lectura compartida por la subida manual y «Leer ahora» (texto primero; IA solo de respaldo). */
export function useLeerSeguimientoSiga() {
  const leer = useServerFn(leerSeguimientoSigaDocumento);
  return async (file: Blob, nombre: string) => {
    if (file.size > 15 * 1024 * 1024) throw new Error("supera 15 MB para lectura automática");
    return leer({ data: { filename: nombre, base64: bytesABase64(new Uint8Array(await file.arrayBuffer())) } });
  };
}

type DocSiga = { id: string; storage_path: string | null; lectura_siga?: unknown };

/** Guarda el motivo de una lectura fallida para mostrarlo bajo el documento (nunca en silencio). */
export async function guardarLecturaSigaFallida(documentoId: string, archivo: string | null, motivo: string, origen = "manual") {
  const fallida: LecturaSigaFallida = { estado: "sin_lectura", motivo, archivo, procesado_en: new Date().toISOString(), origen };
  await supabase.from("documentos").update({ lectura_siga: fallida as never }).eq("id", documentoId);
}

/** «Leer ahora» compartido (encabezado y fila del documento): lee y abre la vista previa sin guardar nada en el Expediente. */
export function useLeerAhoraSiga(expedienteId: string) {
  const qc = useQueryClient();
  const leer = useLeerSeguimientoSiga();
  const [revision, setRevision] = useState<LecturaSigaPendiente | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const leerAhora = async (doc: DocSiga) => {
    if (!doc.storage_path) return;
    setLeyendo(true);
    try {
      const { data: blob, error } = await supabase.storage.from("documentos").download(doc.storage_path);
      if (error || !blob) throw new Error(`No se pudo leer el PDF: ${error?.message ?? "descarga fallida"}`);
      const r = await leer(blob, doc.storage_path.split("/").pop() ?? "seguimiento.pdf");
      if (!r.datos) {
        const motivo = r.motivo ?? "No se encontró el BL (Doc.Embarque) en el reporte.";
        await guardarLecturaSigaFallida(doc.id, doc.storage_path, motivo);
        toast.warning(`Seguimiento SIGA sin leer: ${motivo}`, { duration: 10000 });
        return;
      }
      setRevision({ documentoId: doc.id, archivo: doc.storage_path, datos: r.datos, metodo: r.metodo });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      await guardarLecturaSigaFallida(doc.id, doc.storage_path, motivo.startsWith("No se pudo") ? motivo : `No se pudo leer el PDF: ${motivo}`).catch(() => undefined);
      toast.error(`Lectura no disponible: ${motivo}`);
    } finally {
      setLeyendo(false);
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      qc.invalidateQueries({ queryKey: ["seguimiento-siga", expedienteId] });
    }
  };
  const revisar = (doc: DocSiga, l: LecturaSigaGuardada) => setRevision({ documentoId: doc.id, archivo: doc.storage_path, datos: l.datos, metodo: l.metodo });
  const dialogo = <RevisionSeguimientoSiga expedienteId={expedienteId} lectura={revision} onClose={() => setRevision(null)} />;
  return { leerAhora, revisar, leyendo, dialogo };
}

/** Estado de la lectura bajo el archivo del documento: resultado, motivo si no se pudo y «Leer ahora». */
export function LecturaSigaDocumento({ expedienteId, doc }: { expedienteId: string; doc: DocSiga }) {
  const { leerAhora, revisar, leyendo, dialogo } = useLeerAhoraSiga(expedienteId);
  if (!doc.storage_path) return null;
  const l = doc.lectura_siga as LecturaSigaGuardada | LecturaSigaFallida | null | undefined;
  const vigente = !!l && (l.archivo === undefined || l.archivo === doc.storage_path);
  const boton = <Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={() => leerAhora(doc)} disabled={leyendo}>{leyendo ? "Leyendo…" : "Leer ahora"}</Button>;
  let linea: ReactNode;
  if (!vigente || !l) linea = <><span>Seguimiento SIGA sin leer.</span>{boton}</>;
  else if (esLecturaSigaFallida(l)) linea = <><span className="text-destructive">No se leyó: {l.motivo}</span>{boton}</>;
  else if (l.estado === "rechazado") linea = <><span className="text-destructive">No aplicado: {l.validacion?.errores?.join(" ") || "no corresponde a este Expediente."}</span>{boton}</>;
  else if (l.estado === "pendiente") linea = <><span>Leído, sin aplicar.</span><Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={() => revisar(doc, l)}>Revisar</Button></>;
  else if (l.estado === "aplicado") {
    const partes = [`${l.completados?.length ?? 0} campo(s) completado(s)`, `${l.procesos_nuevos ?? 0} proceso(s) nuevo(s)`];
    if (l.procesos_actualizados) partes.push(`${l.procesos_actualizados} actualizado(s)`);
    if (l.hitos?.length) partes.push("fecha de despacho completo en el Checklist");
    linea = <><span>Aplicado: {partes.join(", ")}.</span>{boton}</>;
  } else linea = <><span>Seguimiento SIGA sin leer.</span>{boton}</>;
  return (
    <div className="text-[11px] whitespace-normal break-words">
      {dialogo}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{linea}</div>
    </div>
  );
}

/** Avisos del encabezado: lectura pendiente, rechazo, diferencias y sugerencia de etapa. */
export function AvisosSeguimientoSiga({ exp, onAvanzarManifestado }: { exp: Record<string, any>; onAvanzarManifestado: () => void }) {
  const qc = useQueryClient();
  const { leerAhora, revisar, leyendo, dialogo } = useLeerAhoraSiga(exp.id);
  const { data: doc } = useQuery({
    queryKey: ["seguimiento-siga", exp.id],
    queryFn: async () => (await supabase.from("documentos").select("id,storage_path,lectura_siga,created_at").eq("expediente_id", exp.id).eq("tipo", TIPO_SEGUIMIENTO_SIGA).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });
  useEffect(() => {
    // La subida desde Documentos refresca este aviso.
    const h = () => qc.invalidateQueries({ queryKey: ["seguimiento-siga", exp.id] });
    window.addEventListener("seguimiento-siga-actualizado", h);
    return () => window.removeEventListener("seguimiento-siga-actualizado", h);
  }, [qc, exp.id]);
  if (!doc) return null;
  const bruta = doc.lectura_siga as LecturaSigaGuardada | LecturaSigaFallida | null;
  const fallida = esLecturaSigaFallida(bruta) ? bruta : null;
  const lectura = fallida ? null : bruta as LecturaSigaGuardada | null;
  const vigente = !!bruta && (bruta.archivo === undefined || bruta.archivo === doc.storage_path);

  const descartarSugerencia = async () => {
    await supabase.from("documentos").update({ lectura_siga: { ...(lectura ?? {}), sugerencia_descartada: true } as never }).eq("id", doc.id);
    qc.invalidateQueries({ queryKey: ["seguimiento-siga", exp.id] });
  };

  const fila = "expediente-header-alertas mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm";
  const aplicado = vigente && lectura?.estado === "aplicado" && !!lectura.datos;
  const diferencias = aplicado ? diferenciasAlertaSiga(exp, lectura!.datos) : [];
  const descripcionSiga = aplicado ? descripcionInformativaSiga(exp, lectura!.datos) : null;
  const sugerir = aplicado && !lectura!.sugerencia_descartada && !!lectura!.datos.fecha_llegada
    && !!exp.fecha_llegada_real && ["digitar", "en_transito"].includes(exp.estado);
  const botonLeer = <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => leerAhora(doc)} disabled={leyendo}>{leyendo ? "Leyendo…" : "Leer ahora"}</Button>;
  return (
    <>
      {dialogo}
      {doc.storage_path && !vigente && (
        <div className={fila} role="status">
          <span className="font-semibold">Seguimiento SIGA sin leer.</span>{botonLeer}
        </div>
      )}
      {vigente && fallida && (
        <div className={cn(fila, "text-destructive")} role="status">
          <span className="font-semibold">Seguimiento SIGA sin leer:</span><span className="break-words">{fallida.motivo}</span>{botonLeer}
        </div>
      )}
      {vigente && lectura?.estado === "pendiente" && (
        <div className={fila} role="status">
          <span className="font-semibold">Seguimiento SIGA leído, sin aplicar.</span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => revisar(doc, lectura)}>Revisar</Button>
        </div>
      )}
      {vigente && lectura?.estado === "rechazado" && (
        <div className={cn(fila, "text-destructive")} role="status">
          <span className="font-semibold">Seguimiento SIGA no aplicado:</span>
          {lectura.validacion.errores.map((e) => <span key={e} className="break-words">{e}</span>)}
        </div>
      )}
      {diferencias.length > 0 && (
        <div className={cn(fila, "text-destructive")} role="status" aria-label="Diferencias con SIGA">
          <span className="font-semibold">Diferencias con SIGA:</span>
          {diferencias.map((d) => <span key={d.campo} className="break-words">{d.label}: Expediente {d.expediente.length > 60 ? `${d.expediente.slice(0, 60)}…` : d.expediente} · SIGA {d.siga.length > 60 ? `${d.siga.slice(0, 60)}…` : d.siga}</span>)}
        </div>
      )}
      {descripcionSiga && (
        <div className={cn(fila, "text-[11px] md:text-[11px] text-muted-foreground")} role="note" title="Informativo: la descripción de SIGA puede estar en otro idioma; la del Expediente no cambia.">
          <span>Descripción en SIGA (informativo): {descripcionSiga.length > 80 ? `${descripcionSiga.slice(0, 80)}…` : descripcionSiga}</span>
        </div>
      )}
      {sugerir && (
        <div className={fila} role="status">
          <span>SIGA registra la llegada real ({fmtFechaSiga(lectura!.datos.fecha_llegada)}). ¿Pasar el Expediente a «Manifestado»?</span>
          <Button size="sm" className="h-6 px-2 text-xs" onClick={onAvanzarManifestado}>Pasar a Manifestado</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={descartarSugerencia}>Ahora no</Button>
        </div>
      )}
    </>
  );
}

/** Bloque «Datos SIGA» de Información General: editable; la etiqueta indica lo que vino de SIGA. */
export function DatosSigaBlock({ form, set, exp, disabled }: { form: Record<string, any>; set: (k: string, v: string) => void; exp: Record<string, unknown> | null | undefined; disabled: boolean }) {
  return (
    <div className="md:col-span-2 lg:col-span-3 grid gap-3 rounded-md border p-3">
      <div className="text-[13px] font-semibold">Datos SIGA <span className="font-normal text-[11px] text-muted-foreground">· se completan desde el Seguimiento SIGA solo cuando están vacíos</span></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        {Object.entries(CAMPOS_SIGA).map(([campo, def]) => (
          <div key={campo} className="grid gap-1.5">
            <Label className="flex flex-wrap items-center" title={campo === "siga_bandera" ? "No se completa sola: SIGA trae la bandera poco confiable." : undefined}>{def.label}<EtiquetaAutoSiga exp={exp} campo={campo} valor={form[campo]} /></Label>
            <Input value={form[campo] ?? ""} onChange={(e) => set(campo, e.target.value)} disabled={disabled} title={form[campo] ?? ""} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Historial de procesos SIGA (Seguimientos): solo lectura, ordenado por fecha. */
export function HistorialProcesosSiga({ expedienteId }: { expedienteId: string }) {
  const { data } = useQuery({
    queryKey: ["siga-procesos", expedienteId],
    queryFn: async () => (await supabase.from("expediente_siga_procesos").select("*").eq("expediente_id", expedienteId).order("fecha", { ascending: true, nullsFirst: false }).order("fecha_creacion", { ascending: true, nullsFirst: false }).order("created_at")).data ?? [],
  });
  if (!data?.length) return null;
  return (
    <div className="mt-4 rounded-md border">
      <div className="border-b px-3 py-2 text-sm font-semibold">Procesos SIGA <span className="font-normal text-[11px] text-muted-foreground">· historial desde el Seguimiento SIGA</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-muted-foreground"><th className="px-3 py-1.5 font-normal">Proceso</th><th className="px-3 py-1.5 font-normal">Doc. embarque</th><th className="px-3 py-1.5 font-normal">No. de solicitud</th><th className="px-3 py-1.5 font-normal">Creado</th><th className="px-3 py-1.5 font-normal">Procesado</th><th className="px-3 py-1.5 font-normal">Estado</th><th className="px-3 py-1.5 font-normal">Origen</th></tr></thead>
          <tbody>
            {data.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-1.5 whitespace-nowrap">{PROCESOS_SIGA[p.proceso as keyof typeof PROCESOS_SIGA] ?? p.etiqueta ?? p.proceso}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{p.doc_embarque ?? "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {p.numero_solicitud ?? "—"}
                  {String(p.numero_solicitud ?? "").includes("…") && <div className="text-[11px] text-destructive" title="El portal SIGA mostró el número cortado y no coincide con el No. de Control de Carga.">Cortado en SIGA: verificar</div>}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">{p.fecha_creacion_texto ? fmtFechaSiga(p.fecha_creacion_texto) : "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtFechaSiga(p.fecha_texto)}</td>
                <td className="px-3 py-1.5">{p.estado ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{p.origen === "correo" ? "Correo automático" : "Carga manual"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
