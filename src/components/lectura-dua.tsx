// Lectura del número de Declaración (DUA) desde la Liquidación de Impuestos o el DUA: compartida por la
// subida manual y «Leer ahora». Reglas fijas sin IA para el número; un solo UPDATE protegido para todo lo
// que llena el documento; etiqueta «Automático», línea en Auditoría y estado visible en el documento.
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLiquidacionDga } from "@/components/liquidacion-dga-context";
import { extractSolicitudFromDocument } from "@/lib/ai-ocr.functions";
import { leerDuaDocumentoPdf } from "@/lib/declaracion-dua.functions";
import {
  ETIQUETA_AUTO_DUA, TIPO_DUA, TIPO_LIQUIDACION, decidirNumeroDua, emparejarDua, esAutomaticoDua, resolverNumeroDua,
  type LecturaDuaGuardada, type LecturaNumero,
} from "@/lib/declaracion-dua";
import { decidirLiquidacionDga, fechaLiquidacion, prepararGuardadoLiquidacion, type CambiosLiquidacion, type LiquidacionDga } from "@/lib/liquidacion-dga-documento";
import { camposDesdeDocumentoDga, completarResultadoDga, type CamposResultadoDga } from "@/lib/resultado-dga-documentos";
import { cn } from "@/lib/utils";

const SIN_TEXTO = "El PDF no tiene texto legible (parece escaneado).";
const bytesABase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export type ResultadoLecturaDua = { lectura: LecturaDuaGuardada; completados: string[]; avisos: string[] };

export function useProcesarLecturaDua() {
  const qc = useQueryClient();
  const editor = useLiquidacionDga();
  const extraer = useServerFn(extractSolicitudFromDocument);
  const leerDua = useServerFn(leerDuaDocumentoPdf);
  return async (p: { expedienteId: string; documentoId: string | null; archivo: string | null; blob: Blob; nombre: string; tipo: typeof TIPO_LIQUIDACION | typeof TIPO_DUA; origen: "manual" | "leer_ahora" }): Promise<ResultadoLecturaDua> => {
    if (p.blob.size > 15 * 1024 * 1024) throw new Error("el archivo supera 15 MB para lectura automática; completa los campos manualmente");
    const base64 = bytesABase64(new Uint8Array(await p.blob.arrayBuffer()));
    let liq: LiquidacionDga = {};
    let numeroTexto: LecturaNumero;
    let ref: { exp?: string | null; bl?: string | null; importador?: string | null };
    let fechaDua: string | null = null;
    if (p.tipo === TIPO_LIQUIDACION) {
      const res = await extraer({ data: { filename: p.nombre, mime: "application/pdf", base64, resultado_dga: TIPO_LIQUIDACION } });
      liq = (res.resultado_dga ?? {}) as LiquidacionDga;
      numeroTexto = liq.lectura_texto ? { numero: liq.declaracion ?? null, motivo: liq.declaracion_motivo ?? null } : { numero: null, motivo: SIN_TEXTO };
      ref = { exp: liq.exp, bl: liq.bl, importador: liq.importador };
    } else {
      const d = await leerDua({ data: { filename: p.nombre, base64 } });
      numeroTexto = d.texto ? { numero: d.declaracion, motivo: d.motivo } : { numero: null, motivo: SIN_TEXTO };
      ref = d; fechaDua = d.fecha_declaracion;
    }
    const { data: actual, error: readError } = await supabase.from("expedientes").select("*, clientes(nombre)").eq("id", p.expedienteId).single();
    if (readError || !actual) throw readError ?? new Error("Expediente no encontrado");
    const { data: endoso } = await supabase.from("expediente_endosos")
      .select("endosado:clientes!expediente_endosos_consignatario_endosado_id_fkey(nombre)").eq("expediente_id", p.expedienteId).eq("activo", true).maybeSingle();
    const visible: Record<string, unknown> = { ...actual, ...editor?.current?.leer() };
    const resuelto = resolverNumeroDua(numeroTexto, p.nombre);
    const emparejamiento = emparejarDua({ numero: actual.numero, bl_awb: visible.bl_awb, clientes_nombres: [(actual as any).clientes?.nombre, (endoso as any)?.endosado?.nombre] }, ref);
    const decision = decidirNumeroDua(visible.numero_dua, resuelto, emparejamiento);

    let documentales: CambiosLiquidacion = {}; let campos: CamposResultadoDga = {}; const avisos: string[] = [];
    if (emparejamiento.aplicar) {
      if (p.tipo === TIPO_LIQUIDACION) {
        campos = completarResultadoDga(visible, camposDesdeDocumentoDga(TIPO_LIQUIDACION, liq));
        const d = decidirLiquidacionDga(visible, liq);
        documentales = d.cambios; avisos.push(...d.avisos);
      } else if (fechaDua) {
        const previa = fechaLiquidacion(visible.fecha_presentacion_real);
        if (!previa) documentales.fecha_presentacion_real = fechaDua;
        else if (previa !== fechaDua) avisos.push(`Fecha de Presentación: documento ${fechaDua}; Expediente ${previa}. Se conserva el dato del Expediente.`);
      }
      if (decision.numero_dua) documentales.numero_dua = decision.numero_dua;
    }
    const { cambios, previos } = prepararGuardadoLiquidacion(actual as Record<string, unknown>, documentales, campos);
    const completados = Object.keys(cambios);
    if (completados.length) {
      const payload: Record<string, unknown> = { ...cambios };
      if (decision.numero_dua) payload.dga_auto = { ...((actual as any).dga_auto ?? {}), numero_dua: { valor: decision.numero_dua, documento_id: p.documentoId, tipo_documento: p.tipo, fuente: resuelto.fuente, fecha: new Date().toISOString(), origen: p.origen } };
      // Un solo UPDATE con todos los campos del documento, o ninguno si alguien los cambió durante la lectura.
      let query = supabase.from("expedientes").update(payload as never).eq("id", p.expedienteId);
      for (const [campo, previo] of Object.entries(previos)) query = previo == null ? query.is(campo, null) : query.eq(campo, previo as string);
      const { data: updated, error } = await query.select("id");
      if (error) throw error;
      if (!updated?.length) throw new Error("el expediente cambió durante la lectura; vuelve a leer el documento. No se guardó ningún campo parcial");
      editor?.current?.aplicar(documentales);
    }
    const alertas = [...decision.alertas, ...avisos];
    if (decision.numero_dua || decision.estado === "rechazado") {
      const { error: audErr } = await supabase.from("auditoria").insert({
        entidad: "expedientes", entidad_id: p.expedienteId, accion: decision.numero_dua ? "dua_automatico" : "dua_no_aplicado",
        cambios: { numero_dua: decision.numero_dua ?? null, documento_id: p.documentoId, tipo_documento: p.tipo, fuente: resuelto.fuente, origen: p.origen, completados, alertas, motivo: decision.motivo } as never,
      });
      if (audErr) alertas.push(`No se pudo registrar en Auditoría: ${audErr.message}`);
    }
    const lectura: LecturaDuaGuardada = { archivo: p.archivo, tipo: p.tipo, estado: decision.estado, numero: resuelto.numero, fuente: resuelto.fuente, motivo: decision.motivo, alertas, procesado_en: new Date().toISOString(), origen: p.origen };
    if (p.documentoId) await supabase.from("documentos").update({ lectura_dua: lectura as never }).eq("id", p.documentoId);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["expediente", p.expedienteId] }),
      qc.invalidateQueries({ queryKey: ["documentos", p.expedienteId] }),
      qc.invalidateQueries({ queryKey: ["auditoria", p.expedienteId] }),
    ]);
    qc.invalidateQueries({ queryKey: ["expedientes"] });
    return { lectura, completados, avisos };
  };
}

/** Avisos breves tras leer: lo que se llenó, por qué no y las alertas. */
export function avisarLecturaDua({ lectura, completados }: ResultadoLecturaDua) {
  for (const a of lectura.alertas) toast.warning(a, { duration: 12000 });
  if (lectura.estado === "aplicado") toast.success(`Declaración DUA completada: ${lectura.numero}${lectura.fuente === "archivo" ? " (desde el nombre del archivo)" : ""}.`);
  else if (lectura.estado === "sin_numero" || lectura.estado === "rechazado") toast.warning(`No se completó la Declaración DUA: ${lectura.motivo}`, { duration: 12000 });
  else if (completados.length) toast.success("Datos DGA completados; los datos existentes se conservaron.");
  else toast.success("Documento guardado; no hay nuevos campos vacíos que completar.");
}

export function EtiquetaAutoDua({ exp, valor }: { exp: Record<string, unknown> | null | undefined; valor?: unknown }) {
  if (!esAutomaticoDua(exp, valor)) return null;
  const reg = ((exp?.dga_auto ?? {}) as Record<string, { fecha?: string; tipo_documento?: string; fuente?: string }>).numero_dua;
  const cuando = reg?.fecha ? new Date(reg.fecha).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" }) : "";
  const origen = reg?.tipo_documento === TIPO_DUA ? "el DUA" : "la Liquidación de Impuestos";
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
      title={`Completado desde ${origen}${reg?.fuente === "archivo" ? " (nombre del archivo)" : ""}${cuando ? ` el ${cuando}` : ""}. Si lo cambias a mano, la etiqueta desaparece.`}>
      <Bot className="h-3 w-3" />{ETIQUETA_AUTO_DUA}
    </span>
  );
}

/** Estado de la lectura bajo el archivo de la casilla: número leído, motivo si no se pudo y «Leer ahora». */
export function LecturaDuaDocumento({ expedienteId, doc }: { expedienteId: string; doc: { id: string; tipo: string; storage_path: string | null; lectura_dua?: unknown } }) {
  const procesar = useProcesarLecturaDua();
  const [leyendo, setLeyendo] = useState(false);
  // Misma raíz de clave que el Expediente: se refresca cuando cambia la Declaración DUA.
  const { data: duaActual } = useQuery({
    queryKey: ["expediente", expedienteId, "numero_dua"],
    queryFn: async () => (await supabase.from("expedientes").select("numero_dua").eq("id", expedienteId).single()).data?.numero_dua ?? null,
  });
  if (!doc.storage_path) return null;
  const lectura = doc.lectura_dua as LecturaDuaGuardada | null | undefined;
  const vigente = !!lectura && lectura.archivo === doc.storage_path;
  // Documentos anteriores sin leer: solo se ofrece la lectura mientras la Declaración DUA esté vacía.
  if (!vigente && String(duaActual ?? "").trim()) return null;
  const leerAhora = async () => {
    setLeyendo(true);
    try {
      const { data: blob, error } = await supabase.storage.from("documentos").download(doc.storage_path!);
      if (error || !blob) throw new Error(error?.message ?? "no se pudo descargar el PDF");
      const tipo = doc.tipo === TIPO_DUA ? TIPO_DUA : TIPO_LIQUIDACION;
      avisarLecturaDua(await procesar({ expedienteId, documentoId: doc.id, archivo: doc.storage_path, blob, nombre: doc.storage_path!.split("/").pop() ?? "documento.pdf", tipo, origen: "leer_ahora" }));
    } catch (e) {
      toast.error(`Lectura no disponible: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLeyendo(false); }
  };
  const boton = <Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={leerAhora} disabled={leyendo}>{leyendo ? "Leyendo…" : "Leer ahora"}</Button>;
  const fuente = lectura?.fuente === "archivo" ? " (desde el nombre del archivo)" : "";
  let linea: ReactNode = null;
  if (!vigente) linea = <><span>Número de Declaración sin leer.</span>{boton}</>;
  else if (lectura.estado === "aplicado") linea = <span>Declaración {lectura.numero}{fuente} · completada en el Expediente.</span>;
  else if (lectura.estado === "coincide") linea = <span>Declaración {lectura.numero}{fuente} · coincide con el Expediente.</span>;
  else if (lectura.estado === "conservado") linea = <span className="text-destructive">Declaración {lectura.numero}{fuente} · el Expediente tiene otro número; se conservó.</span>;
  else linea = <><span className="text-destructive">{lectura.estado === "rechazado" ? "No aplicado: " : "No se leyó el número: "}{lectura.motivo}</span>{boton}</>;
  const alertas = vigente ? lectura.alertas.filter((a) => !a.startsWith("Declaración DUA:")) : [];
  return (
    <div className="text-[11px] whitespace-normal break-words">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{linea}</div>
      {alertas.map((a) => <div key={a} className={cn("text-destructive")}>{a}</div>)}
    </div>
  );
}
