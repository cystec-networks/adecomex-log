import { z } from "zod";

export const adjuntoCorreoSchema = z.object({
  nombre: z.string().trim().min(1).max(300),
  tipo: z.string().trim().max(150),
  contenido: z.string().min(1).max(20_000_000),
});

/** No pierde archivos por aliases del remitente; cada rechazo queda visible. */
export function normalizarAdjuntosCorreo(value: unknown) {
  const adjuntos: z.infer<typeof adjuntoCorreoSchema>[] = [];
  const advertencias: string[] = [];
  if (value == null) return { adjuntos, advertencias };
  if (!Array.isArray(value)) return { adjuntos, advertencias: ["Adjuntos: se esperaba un arreglo; no se recibió ningún archivo válido."] };
  for (const [i, raw] of value.entries()) {
    const v = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const nombre = String(v.nombre ?? v.name ?? v.filename ?? v.fileName ?? `adjunto-${i + 1}`);
    const contenido = v.contenidoBase64 ?? v.contenido ?? v.content ?? v.data ?? v.base64 ?? v.contentBytes ?? v.contenido_base64 ?? v.content_base64 ?? v.contentBase64 ?? v.base64Content ?? v.bytes;
    const parsed = adjuntoCorreoSchema.safeParse({ nombre, tipo: String(v.tipo ?? v.mimeType ?? v.mime_type ?? v.mime ?? v.contentType ?? v.content_type ?? v.type ?? ""), contenido });
    if (!parsed.success || adjuntos.length >= 10) {
      advertencias.push(`No se pudo recibir ${nombre}: ${adjuntos.length >= 10 ? "máximo 10 adjuntos por correo" : "contenido base64 ausente o inválido"}. Reenvía el archivo.`);
      continue;
    }
    adjuntos.push(parsed.data);
  }
  return { adjuntos, advertencias };
}

export function mimeAdjuntoCorreo(nombre: string, tipo: string, contenido: string) {
  const mime = tipo.split(";")[0].trim().toLowerCase();
  if (/^(application\/pdf|image\/(png|jpe?g|webp|gif))$/.test(mime)) return mime === "image/jpg" ? "image/jpeg" : mime;
  const dataMime = /^data:([^;,]+)/i.exec(contenido)?.[1];
  if (dataMime) return mimeAdjuntoCorreo(nombre, dataMime, "");
  const ext = nombre.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[ext ?? ""] ?? mime;
}

export type AdjuntoGuardadoCorreo = { nombre: string; tipo: string; storage_path: string; error?: string; datos?: Record<string, unknown> };

/** Datos adicionales permanecen en el adjunto, sin convertir la solicitud en expediente. */
export function datosDocumentalesCorreo(adjuntos: AdjuntoGuardadoCorreo[]) {
  const resultado: Record<string, unknown> = {};
  const orden = [...adjuntos].sort((a, b) => Number(!["Bill of Lading", "Guía aérea"].includes(a.tipo)) - Number(!["Bill of Lading", "Guía aérea"].includes(b.tipo)));
  for (const a of orden) {
    if (a.tipo === "Otro") continue;
    for (const [k, v] of Object.entries(a.datos ?? {})) {
      if (v != null && v !== "" && resultado[k] == null) resultado[k] = v;
    }
  }
  return resultado;
}
const claveNombreAdjunto = (nombre: string) => nombre.trim().toLowerCase().replace(/\s+/g, " ");

/** Un archivo repetido en el mismo correo (mismo nombre, o mismo tipo + contenido) se guarda una sola vez. */
export function deduplicarAdjuntosCorreo<T extends { nombre: string; tipo?: string | null; file_hash?: string | null }>(adjuntos: T[]): T[] {
  const nombres = new Set<string>();
  const contenidos = new Set<string>();
  const unicos: T[] = [];
  for (const a of adjuntos) {
    const n = claveNombreAdjunto(a.nombre ?? "");
    const c = a.file_hash ? `${a.tipo ?? ""}|${a.file_hash}` : null;
    if ((n && nombres.has(n)) || (c && contenidos.has(c))) continue;
    if (n) nombres.add(n);
    if (c) contenidos.add(c);
    unicos.push(a);
  }
  return unicos;
}
