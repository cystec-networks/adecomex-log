import { PDFDocument } from "@cantoo/pdf-lib";
import { detectarTipoPagina, segmentarPaginas, nombreSegmento, type TipoPagina } from "./correo-documento-combinado";
import { tipoAdjuntoCorreo } from "./correo-solicitud";
import { agruparAdjuntosCorreo, unirArchivosPdf, nombreUnido, etiquetaOriginalIncluido } from "./correo-adjuntos-union";
import { nombreDocumentoSiga, prefijoSiga, siguienteCodigoSiga } from "./codigo-siga";
import { supabase } from "@/integrations/supabase/client";
import { hoyRDISO } from "./dates";
import { optimizarDocumento } from "./documento-optimizacion";

export type ArchivoJuego = { nombre: string; tipo: string; storage_path: string; bytes: Uint8Array; mime: string; originalId?: string };
export const base64Juego = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Uses the same header detector, classifier vocabulary and segmentation as incoming email. */
export async function separarArchivoJuego(nombre: string, bytes: Uint8Array, textos: string[], clasificar: (nombre: string, base64: string) => Promise<string>, progreso: (texto: string) => void): Promise<ArchivoJuego[]> {
  const src = await PDFDocument.load(bytes, { password: "", updateMetadata: false } as any);
  const paginaPdf = async (indices: number[]) => {
    const out = await PDFDocument.create();
    (await out.copyPages(src, indices)).forEach((p) => out.addPage(p));
    return out.save();
  };
  const tipos: TipoPagina[] = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    progreso(`${nombre} · página ${i + 1} de ${src.getPageCount()}`);
    const detectado = detectarTipoPagina(textos[i] ?? "");
    if (detectado) { tipos.push(detectado); continue; }
    try {
      const raw = await clasificar(`${nombre.slice(0, 220)} p${i + 1}`, base64Juego(await paginaPdf([i])));
      const tipo = tipoAdjuntoCorreo(raw);
      tipos.push(/continuaci/i.test(raw) ? null : { tipo, etiqueta: tipo });
    } catch { tipos.push({ tipo: "Otro", etiqueta: "Sin clasificar" }); }
  }
  // No cap: every page and change of type must remain represented.
  const segmentos = segmentarPaginas(tipos, src.getPageCount());
  return Promise.all(segmentos.map(async (s, i) => ({ nombre: segmentos.length === 1 ? nombre : nombreSegmento(nombre, s, i), tipo: s.tipo ?? "Otro", storage_path: nombre, mime: "application/pdf", bytes: await paginaPdf(s.paginas) })));
}

/** Canonical one-PDF-per-type plan; unknown documents are deliberately separate. */
export function gruposJuego(archivos: ArchivoJuego[]) { return agruparAdjuntosCorreo(archivos); }

export async function guardarGrupoJuego(expedienteId: string, grupo: ArchivoJuego[]) {
  const primero = grupo[0];
  if (!primero) return;
  const tipo = primero.tipo || "Otro";
  const codigo = await siguienteCodigoSiga(expedienteId, prefijoSiga(tipo));
  const source = grupo.length > 1 ? await unirArchivosPdf(grupo) : primero.bytes;
  const bytes = (await optimizarDocumento(source, "application/pdf")).bytes;
  const nombre = nombreDocumentoSiga(codigo, tipo, primero.nombre);
  const ruta = `${expedienteId}/${crypto.randomUUID()}-${grupo.length > 1 ? nombreUnido(nombre, grupo.length) : nombre}`;
  const { error } = await supabase.storage.from("documentos").upload(ruta, new Blob([bytes as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (error) throw error;
  const payload = { expediente_id: expedienteId, tipo, codigo_siga: codigo, estado: "recibido" as const, fecha_recepcion: hoyRDISO(), storage_path: ruta, observaciones: `Juego de documentos: ${grupo.map((a) => a.nombre).join(", ")}`.slice(0, 500) };
  const reutilizar = grupo.length === 1 && primero.originalId;
  const query = reutilizar ? supabase.from("documentos").update(payload).eq("id", primero.originalId ?? "").eq("expediente_id", expedienteId) : supabase.from("documentos").insert(payload);
  const { data, error: writeError } = await query.select("id");
  if (writeError || !data?.length) {
    await supabase.storage.from("documentos").remove([ruta]);
    throw writeError ?? new Error("No se pudo guardar el documento");
  }
  if (!reutilizar) {
    for (const a of grupo) {
      const obs = `${etiquetaOriginalIncluido(codigo)} · ${a.nombre}`.slice(0, 500);
      if (a.originalId) {
        const { error: backupError } = await supabase.from("documentos").update({ observaciones: obs }).eq("id", a.originalId).eq("expediente_id", expedienteId);
        if (backupError) throw backupError;
      }
    }
  }
}