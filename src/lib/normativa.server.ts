// Procesamiento de la «Base normativa» (solo servidor): extrae el texto del PDF,
// lo fragmenta con página y artículo, y vectoriza los fragmentos por lotes
// cortos y reanudables para no exceder el tiempo de una solicitud.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { ErrorEmbeddings, vectorizar, vectorTexto } from "./embeddings.server";
import {
  LOTE_VECTORIZACION,
  MAX_FRAGMENTOS_NORMATIVA,
  MAX_PAGINAS_NORMATIVA,
  analizarTextoPaginas,
  detectarDatosDocumento,
  fragmentarDocumento,
  textoParaVectorizar,
} from "./normativa";

type Admin = SupabaseClient<Database>;
export const BUCKET_NORMATIVA = "base-normativa";

export type ResultadoProcesamiento = {
  estado: "procesando" | "listo" | "error" | "escaneado";
  mensaje: string;
  total: number;
  listos: number;
};

async function marcar(
  admin: Admin,
  id: string,
  cambios: Database["public"]["Tables"]["normativa_documentos"]["Update"],
) {
  const { error } = await admin.from("normativa_documentos").update(cambios).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el estado del documento.");
}

/** Paso 1: lee el PDF, detecta si es escaneado y guarda los fragmentos (sin vectores). */
export async function extraerDocumento(admin: Admin, id: string): Promise<ResultadoProcesamiento> {
  const { data: doc, error } = await admin
    .from("normativa_documentos")
    .select("id, archivo_path, tipo, numero, numero_detectado, fecha_emision, fecha_emision_detectada")
    .eq("id", id)
    .maybeSingle();
  if (error || !doc) throw new Error("Documento no encontrado.");
  if (!doc.archivo_path) throw new Error("El documento no tiene un PDF cargado.");

  await marcar(admin, id, {
    procesamiento_estado: "procesando",
    procesamiento_mensaje: "Extrayendo el texto del PDF…",
    fragmentos_total: 0,
    fragmentos_listos: 0,
    procesado_at: null,
  });
  const fallo = async (estado: "error" | "escaneado", mensaje: string) => {
    await admin.from("normativa_fragmentos").delete().eq("documento_id", id);
    await marcar(admin, id, { procesamiento_estado: estado, procesamiento_mensaje: mensaje });
    return { estado, mensaje, total: 0, listos: 0 } as ResultadoProcesamiento;
  };

  const { data: archivo, error: errDescarga } = await admin.storage
    .from(BUCKET_NORMATIVA)
    .download(doc.archivo_path);
  if (errDescarga || !archivo) return fallo("error", "No se pudo descargar el PDF guardado. Vuelve a subirlo.");

  let paginas: string[];
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await archivo.arrayBuffer()));
    if (pdf.numPages > MAX_PAGINAS_NORMATIVA)
      return fallo(
        "error",
        `El PDF tiene ${pdf.numPages} páginas; el máximo es ${MAX_PAGINAS_NORMATIVA}. Divídelo en partes.`,
      );
    const { text } = await extractText(pdf, { mergePages: false });
    paginas = Array.isArray(text) ? text : [String(text)];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[normativa] no se pudo leer el PDF", id, msg);
    return fallo(
      "error",
      /password/i.test(msg)
        ? "El PDF está protegido con contraseña y no se puede leer."
        : "No se pudo leer el PDF (archivo dañado o formato no compatible).",
    );
  }

  const analisis = analizarTextoPaginas(paginas);
  if (analisis.escaneado)
    return fallo(
      "escaneado",
      "El PDF parece escaneado (solo imágenes, sin texto legible) y no se puede consultar. Sube una versión con texto seleccionable o pasada por reconocimiento de texto (OCR).",
    );

  const fragmentos = fragmentarDocumento(paginas);
  if (fragmentos.length === 0) return fallo("escaneado", "No se encontró texto legible en el PDF.");
  if (fragmentos.length > MAX_FRAGMENTOS_NORMATIVA)
    return fallo(
      "error",
      `El documento es demasiado extenso (${fragmentos.length} fragmentos; máximo ${MAX_FRAGMENTOS_NORMATIVA}). Divídelo en partes.`,
    );

  await admin.from("normativa_fragmentos").delete().eq("documento_id", id);
  for (let i = 0; i < fragmentos.length; i += 500) {
    const { error: errIns } = await admin
      .from("normativa_fragmentos")
      .insert(fragmentos.slice(i, i + 500).map((f) => ({ ...f, documento_id: id })));
    if (errIns) return fallo("error", "No se pudieron guardar los fragmentos del documento.");
  }
  const aviso = analisis.sinTexto
    ? ` Atención: ${analisis.sinTexto} de ${analisis.total} página(s) no tienen texto legible (posiblemente escaneadas) y no se podrán consultar.`
    : "";
  // Número y fecha de emisión desde el encabezado o el cierre: solo como sugerencia
  // en campos vacíos o aún no confirmados; nunca pisa un dato confirmado por el administrador.
  const detectado = detectarDatosDocumento(paginas, doc.tipo);
  const sugerencias: Database["public"]["Tables"]["normativa_documentos"]["Update"] = {};
  const textoDetectado: string[] = [];
  if (!doc.numero || doc.numero_detectado) {
    sugerencias.numero = detectado.numero ?? (doc.numero_detectado ? null : doc.numero);
    sugerencias.numero_detectado = !!detectado.numero;
    if (detectado.numero) textoDetectado.push(`número ${detectado.numero}`);
  }
  if (!doc.fecha_emision || doc.fecha_emision_detectada) {
    sugerencias.fecha_emision = detectado.fecha_emision ?? (doc.fecha_emision_detectada ? null : doc.fecha_emision);
    sugerencias.fecha_emision_detectada = !!detectado.fecha_emision;
    if (detectado.fecha_emision) {
      const [a, m, d] = detectado.fecha_emision.split("-");
      textoDetectado.push(`fecha de emisión ${d}/${m}/${a}`);
    }
  }
  const avisoDetectado = textoDetectado.length
    ? ` Detectado automáticamente: ${textoDetectado.join(" y ")} (confírmalo).`
    : "";
  const mensaje = `Texto extraído: ${fragmentos.length} fragmento(s) de ${analisis.total} página(s). Preparando la búsqueda…${aviso}${avisoDetectado}`;
  await marcar(admin, id, {
    ...sugerencias,
    paginas: analisis.total,
    paginas_sin_texto: analisis.sinTexto,
    fragmentos_total: fragmentos.length,
    procesamiento_mensaje: mensaje,
  });
  return { estado: "procesando", mensaje, total: fragmentos.length, listos: 0 };
}

/** Paso 2 (repetible): vectoriza el siguiente lote de fragmentos pendientes. */
export async function vectorizarLote(admin: Admin, id: string): Promise<ResultadoProcesamiento> {
  const { data: doc, error } = await admin
    .from("normativa_documentos")
    .select("id, titulo, paginas, paginas_sin_texto, fragmentos_total, procesamiento_estado")
    .eq("id", id)
    .maybeSingle();
  if (error || !doc) throw new Error("Documento no encontrado.");

  const { data: pendientes, error: errPend } = await admin
    .from("normativa_fragmentos")
    .select("id, articulo, contenido")
    .eq("documento_id", id)
    .is("embedding", null)
    .order("orden")
    .limit(LOTE_VECTORIZACION);
  if (errPend) throw new Error("No se pudieron leer los fragmentos pendientes.");

  if (pendientes && pendientes.length) {
    try {
      const vectores = await vectorizar(pendientes.map((f) => textoParaVectorizar(doc.titulo, f)));
      const { error: errGuardar } = await admin.rpc("normativa_guardar_embeddings", {
        p_lote: pendientes.map((f, i) => ({ id: f.id, e: vectorTexto(vectores[i]) })),
      });
      if (errGuardar) throw new Error("No se pudieron guardar los vectores.");
    } catch (e) {
      const mensaje =
        e instanceof ErrorEmbeddings || e instanceof Error ? e.message : "Error al preparar la búsqueda.";
      await marcar(admin, id, {
        procesamiento_estado: "error",
        procesamiento_mensaje: `${mensaje} Pulsa «Reanudar» para continuar donde se quedó.`,
      });
      return { estado: "error", mensaje, total: doc.fragmentos_total, listos: 0 };
    }
  }

  const { count: restantes } = await admin
    .from("normativa_fragmentos")
    .select("id", { count: "exact", head: true })
    .eq("documento_id", id)
    .is("embedding", null);
  const total = doc.fragmentos_total;
  const listos = Math.max(0, total - (restantes ?? 0));
  if ((restantes ?? 0) === 0) {
    const aviso = doc.paginas_sin_texto
      ? ` ${doc.paginas_sin_texto} de ${doc.paginas} página(s) sin texto legible (posiblemente escaneadas) no se pueden consultar.`
      : "";
    const mensaje = `Listo: ${total} fragmento(s) de ${doc.paginas ?? "?"} página(s) disponibles para el asistente.${aviso}`;
    await marcar(admin, id, {
      procesamiento_estado: "listo",
      procesamiento_mensaje: mensaje,
      fragmentos_listos: total,
      procesado_at: new Date().toISOString(),
    });
    return { estado: "listo", mensaje, total, listos: total };
  }
  const mensaje = `Preparando la búsqueda: ${listos} de ${total} fragmento(s).`;
  await marcar(admin, id, {
    procesamiento_estado: "procesando",
    procesamiento_mensaje: mensaje,
    fragmentos_listos: listos,
  });
  return { estado: "procesando", mensaje, total, listos };
}
