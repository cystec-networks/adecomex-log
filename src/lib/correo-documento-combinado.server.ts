import { PDFDocument } from "@cantoo/pdf-lib";
import {
  detectarTipoPagina, segmentarPaginas, nombreSegmento, MAX_PAGINAS_COMBINADO, AVISO_PROCESANDO_COMBINADO, type TipoPagina,
} from "@/lib/correo-documento-combinado";
import { tipoAdjuntoCorreo } from "@/lib/correo-solicitud";
import { bytesABase64, clasificarPaginaEscaneada, leerArchivoCorreo, type AdjuntoProcesado } from "@/lib/correo-adjunto-lectura.server";
import { prefijoSiga, nombreDocumentoSiga } from "@/lib/codigo-siga";

/** Cuenta páginas sin IA; null si no se puede abrir. */
export async function contarPaginasPdf(bytes: Uint8Array): Promise<number | null> {
  try { return (await PDFDocument.load(bytes, { password: "", updateMetadata: false } as any)).getPageCount(); }
  catch { return null; }
}

type Job = { id: string; solicitud_id: string | null; expediente_id: string | null; documento_id: string | null; nombre: string; storage_path: string; intentos: number };
type Db = any;

const nombreSeguro = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\- ]+/g, "_").slice(-120);

async function siguienteCodigo(db: Db, expedienteId: string, prefijo: string) {
  const [d, p] = await Promise.all([
    db.from("documentos").select("codigo_siga").eq("expediente_id", expedienteId).like("codigo_siga", `${prefijo}-%`),
    prefijo === "PER" ? db.from("permisos").select("codigo_siga").eq("expediente_id", expedienteId).like("codigo_siga", "PER-%") : { data: [] },
  ]);
  const nums = [...(d.data ?? []), ...(p.data ?? [])].map((r: any) => parseInt(String(r.codigo_siga ?? "").split("-")[1] ?? "", 10)).filter((n: number) => !isNaN(n));
  return `${prefijo}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
}

/** Divide y lee el PDF; un segmento que falla queda como «Otro» sin detener los demás. */
async function segmentarYLeer(job: Job, bytes: Uint8Array): Promise<AdjuntoProcesado[]> {
  const src = await PDFDocument.load(bytes, { password: "" } as any);
  const total = Math.min(src.getPageCount(), MAX_PAGINAS_COMBINADO);
  let textos: string[] = [];
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    textos = ((await extractText(await getDocumentProxy(bytes.slice()), { mergePages: false })).text as string[]).slice(0, total);
  } catch { textos = []; }

  const subPdf = async (paginas: number[]) => {
    const out = await PDFDocument.create();
    (await out.copyPages(src, paginas)).forEach((p) => out.addPage(p));
    return out.save();
  };

  const tipos: TipoPagina[] = [];
  for (let i = 0; i < total; i++) {
    const t = textos[i] ?? "";
    if (t.replace(/\s/g, "").length >= 30) { tipos.push(detectarTipoPagina(t)); continue; }
    // Página escaneada: clasificación corta de esa sola página.
    try {
      const r = await clasificarPaginaEscaneada(`${job.nombre} p${i + 1}`, bytesABase64(await subPdf([i])));
      if (/continuaci/i.test(r)) tipos.push(null);
      else if (/producci/i.test(r)) tipos.push({ tipo: "Otro", etiqueta: "Certificate of Production" });
      else { const tipo = tipoAdjuntoCorreo(r); tipos.push(tipo === "Otro" ? null : { tipo, etiqueta: tipo }); }
    } catch { tipos.push(null); }
  }

  const resultado: AdjuntoProcesado[] = [];
  for (const [i, s] of segmentarPaginas(tipos).entries()) {
    const nombre = nombreSegmento(job.nombre, s, i);
    let segBytes: Uint8Array;
    try { segBytes = await subPdf(s.paginas); }
    catch (e) { continue; }
    try {
      const leido = await leerArchivoCorreo(nombre, "application/pdf", bytesABase64(segBytes), segBytes);
      // El encabezado detectado manda; la IA solo clasifica lo que no lo tenía.
      resultado.push({ ...leido, tipo: s.tipo ?? leido.tipo, nombre, bytes: segBytes });
    } catch (e) {
      resultado.push({ tipo: s.tipo ?? "Otro", nombre, mime: "application/pdf", bytes: segBytes, error: `No se pudo leer este segmento: ${String(e instanceof Error ? e.message : e).slice(0, 140)}` });
    }
  }
  return resultado;
}

const CAMPOS_SOLICITUD = ["bl_awb", "eta", "producto", "cantidad", "cliente_nombre", "peso_bruto_kg", "factura_comercial"] as const;

async function aplicarASolicitud(db: Db, job: Job, segmentos: (AdjuntoProcesado & { storage_path: string })[]) {
  const { data: sol, error } = await db.from("solicitudes_correo").select("*").eq("id", job.solicitud_id).single();
  if (error) throw new Error(error.message);
  if (sol.estado !== "pendiente") return sol.expediente_id as string | null;
  const lista = (Array.isArray(sol.adjuntos) ? sol.adjuntos : []) as any[];
  const adjuntos = lista.map((a) => a.storage_path === job.storage_path
    ? { ...a, tipo: "Otro", procesando: false, error: undefined, respaldo: `Original — separado en ${segmentos.length} documento(s)` }
    : a);
  const yaRutas = new Set(adjuntos.map((a) => a.storage_path));
  for (const s of segmentos) if (!yaRutas.has(s.storage_path)) adjuntos.push({ nombre: s.nombre, mime: s.mime, tipo: s.tipo, storage_path: s.storage_path, datos: s.datos ?? {}, ...(s.error ? { error: s.error } : {}) });
  const cambios: Record<string, unknown> = { adjuntos };
  for (const k of CAMPOS_SOLICITUD) {
    if (sol[k] != null && sol[k] !== "") continue;
    const v = segmentos.find((s) => (s as any)[k] != null && (s as any)[k] !== "");
    if (v) cambios[k] = (v as any)[k];
  }
  cambios.advertencias = [...((sol.advertencias ?? []) as string[]).filter((a) => !a.includes(job.nombre) || !a.includes(AVISO_PROCESANDO_COMBINADO)),
    ...segmentos.filter((s) => s.error).map((s) => `${s.nombre}: ${s.error}`)];
  const { data: upd, error: e2 } = await db.from("solicitudes_correo").update(cambios).eq("id", sol.id).eq("estado", "pendiente").select("id");
  if (e2) throw new Error(e2.message);
  if (upd?.length) return null;
  // Confirmado mientras procesábamos: va directo al expediente.
  const { data: s2 } = await db.from("solicitudes_correo").select("expediente_id").eq("id", sol.id).single();
  return s2?.expediente_id ?? null;
}

async function aplicarAExpediente(db: Db, expedienteId: string, job: Job, segmentos: (AdjuntoProcesado & { storage_path: string })[]) {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: existentes } = await db.from("documentos").select("observaciones").eq("expediente_id", expedienteId);
  const ya = new Set((existentes ?? []).map((d: any) => d.observaciones));
  const codigos: string[] = [];
  for (const s of segmentos) {
    const obs = `Separado de documento combinado: ${s.nombre}`.slice(0, 500);
    if (ya.has(obs)) continue;
    const codigo = await siguienteCodigo(db, expedienteId, prefijoSiga(s.tipo));
    const ruta = `${expedienteId}/${Date.now()}_${nombreDocumentoSiga(codigo, s.tipo, s.nombre)}`;
    const cp = await db.storage.from("documentos").copy(s.storage_path, ruta);
    const { error } = await db.from("documentos").insert({
      expediente_id: expedienteId, tipo: s.tipo || "Otro", storage_path: cp.error ? s.storage_path : ruta, estado: "recibido",
      codigo_siga: codigo, fecha_recepcion: hoy, observaciones: obs,
    });
    if (error) throw new Error(error.message);
    codigos.push(codigo);
  }
  // El original queda como respaldo en «Otros documentos».
  const respaldo = `Original — ya incluido en ${codigos.join(", ") || "documentos separados"} · ${job.nombre}`.slice(0, 500);
  if (job.documento_id) await db.from("documentos").update({ observaciones: respaldo }).eq("id", job.documento_id);
  else await db.from("documentos").update({ observaciones: respaldo }).eq("expediente_id", expedienteId).eq("storage_path", job.storage_path);
}

/** Procesa una tarea reservada. Nunca lanza: deja la tarea en completado, pendiente (reintento) o error. */
export async function procesarDocumentoCombinado(db: Db, job: Job) {
  try {
    const { data: blob, error } = await db.storage.from("documentos").download(job.storage_path);
    if (error || !blob) throw new Error(`No se pudo leer el archivo: ${error?.message ?? "sin contenido"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const leidos = await segmentarYLeer(job, bytes);
    if (!leidos.length) throw new Error("No se pudo separar ninguna página");
    const carpeta = job.storage_path.replace(/\/[^/]*$/, "");
    const segmentos: (AdjuntoProcesado & { storage_path: string })[] = [];
    for (const [i, s] of leidos.entries()) {
      const path = `${carpeta}/seg_${job.id.slice(0, 8)}_${i}_${nombreSeguro(s.nombre)}`;
      const up = await db.storage.from("documentos").upload(path, new Blob([s.bytes as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);
      segmentos.push({ ...s, storage_path: path });
    }
    let expedienteId = job.expediente_id;
    if (job.solicitud_id) expedienteId = (await aplicarASolicitud(db, job, segmentos)) ?? (job.expediente_id ?? null);
    if (expedienteId) await aplicarAExpediente(db, expedienteId, job, segmentos);
    const resultado = segmentos.map((s) => ({ nombre: s.nombre, tipo: s.tipo, storage_path: s.storage_path, ...(s.error ? { error: s.error } : {}) }));
    await db.from("correo_documentos_combinados").update({ estado: "completado", resultado, error: null, procesado_en: new Date().toISOString(), bloqueado_hasta: null }).eq("id", job.id);
    return { ok: true as const, segmentos: resultado.length };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
    // Créditos/permiso: no reintentar. Resto: hasta 3 intentos.
    const terminal = /\[40[23]\]|Créditos de IA/i.test(msg) || job.intentos >= 3;
    await db.from("correo_documentos_combinados").update({ estado: terminal ? "error" : "pendiente", error: msg, bloqueado_hasta: null }).eq("id", job.id);
    if (terminal && job.solicitud_id) {
      // Se conserva en «Otros documentos» con el aviso de error.
      const { data: sol } = await db.from("solicitudes_correo").select("adjuntos,estado").eq("id", job.solicitud_id).single();
      if (sol?.estado === "pendiente") {
        const adjuntos = ((sol.adjuntos ?? []) as any[]).map((a) => a.storage_path === job.storage_path ? { ...a, procesando: false, error: `No se pudo separar el documento combinado; queda en Otros documentos. ${msg.slice(0, 120)}` } : a);
        await db.from("solicitudes_correo").update({ adjuntos }).eq("id", job.solicitud_id).eq("estado", "pendiente");
      }
    }
    return { ok: false as const, error: msg };
  }
}

/** Reserva y procesa hasta `max` tareas (o una concreta). */
export async function procesarCola(db: Db, opts: { id?: string | null; max?: number } = {}) {
  const res: unknown[] = [];
  for (let n = 0; n < (opts.max ?? 2); n++) {
    const { data, error } = await db.rpc("reservar_documento_combinado", { p_id: opts.id ?? null });
    if (error) throw new Error(error.message);
    const job = (data ?? [])[0];
    if (!job) break;
    res.push({ id: job.id, ...(await procesarDocumentoCombinado(db, job)) });
    if (opts.id) break;
  }
  return res;
}
