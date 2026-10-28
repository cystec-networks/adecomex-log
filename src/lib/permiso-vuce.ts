/** Documentary VUCE states retain their literal label alongside the operational enum. */
export function clasificarEstadoVuce(value: string) {
  const s = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  // SIGA wcIC012003 reports a granted authorization as "No Objeción".
  if (s === "aprobado" || s === "no objecion") return "aprobado";
  if (s === "pendiente de pago") return "pendiente_pago";
  if (s === "rechazado") return "rechazado";
  if (s === "vencido") return "vencido";
  if (s === "solicitado") return "solicitado";
  return "en_tramite";
}

export function fechaVuce(value: string): string | null {
  const m = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!m && !iso) return null;
  const y = Number(iso ? iso[1] : m?.[3]);
  const month = Number(iso ? iso[2] : m?.[2]);
  const day = Number(iso ? iso[3] : m?.[1]);
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type DatosPermisoVuce = {
  numero: string; institucion_emisora: string | null; estado: ReturnType<typeof clasificarEstadoVuce>;
  estado_vuce: string; fecha_vencimiento: string | null; fecha_aprobacion: string | null;
  /** Reference values from the document, used only to verify the expediente (never overwrite). */
  verificacion?: { bl: string | null; puerto: string | null; transporte: string | null; solicitante: string | null; documento: string | null };
};

const ESTADOS_SIGA = /(No\s*Objeci[oó]n|Registrado\/Aceptado|Aprobado|Rechazado|Pendiente\s+de\s+Pago|En\s+Evaluaci[oó]n|Anulado|Cancelado|Observado|Solicitado|Vencido)/i;

/** SIGA "wcIC012003 Detalle Información de Autorización Control para Aduaneros". */
export function leerAutorizacionControlVuce(text: string): DatosPermisoVuce | null {
  const t = text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  if (!/Autorizaci[oó]n\s+Control|Historial\s+de\s+Aprobaci[oó]n\b/i.test(t)) return null;
  const numero = t.match(/No\.?\s*de\s+Solicitud\s*:?\s*(TRM-[\w-]+)/i)?.[1];
  if (!numero) return null;
  const historial = t.split(/Fecha\s+de\s+Modificaci[oó]n[^\n]*Estados?/i)[1] ?? "";
  const filas = historial.split("\n").map((l) => {
    const f = l.match(/^\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    const e = l.match(ESTADOS_SIGA);
    return f && e ? { fecha: fechaVuce(f[1]), estado: e[1].replace(/\s+/g, " ").replace(/^No ?Objeci/i, "No Objeci") } : null;
  }).filter((r): r is { fecha: string; estado: string } => !!r?.fecha);
  const ultima = filas.sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1);
  if (!ultima) return null;
  const estado = clasificarEstadoVuce(ultima.estado);
  const campo = (re: RegExp) => t.match(re)?.[1]?.trim() || null;
  const organismo = campo(/Organismo\s+Externo\s*:?\s*(.+?)(?=\s+Nombre\s+de\s+Formulario|\n|$)/i);
  const transporte = campo(/(Mar[ií]timo|A[ée]reo|Terrestre)/i);
  return {
    numero, institucion_emisora: organismo, estado, estado_vuce: ultima.estado,
    fecha_vencimiento: null,
    fecha_aprobacion: estado === "aprobado" ? ultima.fecha : null,
    verificacion: {
      bl: campo(/No\.?\s*Doc\.?\s*de\s+Embarque\s*:?\s*(?:BL|AWB|HBL|MBL)?\s*([A-Z0-9-]+)/i),
      puerto: campo(/Puerto\s+de\s+Entrada\s*:?\s*(.+?)(?=\n|$)/i),
      transporte,
      solicitante: campo(/\nNombre\s+(.+?)\s+Documento\s+\d/i),
      documento: campo(/\nNombre\s+.+?\s+Documento\s+(\d[\d-]*)/i),
    },
  };
}

/** Both SIGA layouts; neither invents expiry or resolution when absent. */
export function leerPermisoVuce(text: string): DatosPermisoVuce | null {
  return leerDetalleSolicitudVuce(text) ?? leerAutorizacionControlVuce(text);
}

const norm = (v: string | null | undefined) => (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Verification-only warnings against the expediente; values are never overwritten. */
export function avisosVerificacionVuce(datos: DatosPermisoVuce, exp: { bl_awb?: string | null; puerto_arribo?: string | null; cliente?: string | null; rnc?: string | null }): string[] {
  const v = datos.verificacion; if (!v) return [];
  const out: string[] = [];
  if (v.bl && exp.bl_awb && norm(v.bl) !== norm(exp.bl_awb)) out.push(`BL/AWB del permiso (${v.bl}) no coincide con el del expediente (${exp.bl_awb}).`);
  if (v.puerto && exp.puerto_arribo && !norm(v.puerto).includes(norm(exp.puerto_arribo)) && !norm(exp.puerto_arribo).includes(norm(v.puerto))) out.push(`Puerto de entrada del permiso (${v.puerto}) difiere del puerto de arribo (${exp.puerto_arribo}).`);
  const docOk = v.documento && exp.rnc && norm(v.documento) === norm(exp.rnc);
  const nomOk = v.solicitante && exp.cliente && norm(v.solicitante) === norm(exp.cliente);
  if ((v.documento || v.solicitante) && (exp.rnc || exp.cliente) && !docOk && !nomOk) out.push(`Solicitante del permiso (${v.solicitante ?? ""} ${v.documento ?? ""}) no coincide con el cliente (${exp.cliente ?? ""}).`);
  return out;
}

export function leerDetalleSolicitudVuce(text: string): DatosPermisoVuce | null {
  const t = text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const numero = t.match(/No\.?\s*(?:de\s+)?Tr[aá]mite\s*:?\s*(TRM-[\w-]+)/i)?.[1];
  if (!numero) return null;
  // Stop at the next label even when PDF text extraction merges a table row.
  const valor = (label: string) => t.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+?)(?=[ \t]+(?:No\\.?[ \t]+Tr[aá]mite|Organismo[ \t]+Externo|Estado|Fecha[ \t]+de[ \t]+[A-Za-zÁÉÍÓÚáéíóú]+)[ \t]*:|\\n|$)`, "i"))?.[1]?.trim() ?? null;
  const estadoVuce = valor("(?<![\\w])Estado");
  if (!estadoVuce || estadoVuce === "-") return null;
  const estado = clasificarEstadoVuce(estadoVuce);
  const historial = t.split(/Historial\s+de\s+Aprobaciones/i)[1]?.split(/(?:Historial\s+de\s+(?!Aprobaciones)|Documentos\s+Adjuntos|Historial\s+de\s+Estados)/i)[0] ?? "";
  const fechas = [...historial.matchAll(/Fecha\s+de\s+Aprobaci[oó]n\s*:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/gi)]
    .map((m) => fechaVuce(m[1])).filter((f): f is string => f !== null).sort();
  return {
    numero, institucion_emisora: valor("Organismo\\s+Externo"), estado, estado_vuce: estadoVuce,
    fecha_vencimiento: fechaVuce(valor("Fecha\\s+de\\s+Vencimiento") ?? ""),
    fecha_aprobacion: estado === "aprobado" ? fechas.at(-1) ?? null : null,
  };
}

/** Replacing a recognized document replaces its documentary dates, never manual-only fields. */
export function aplicarDetalleVuce<T extends { numero: string; institucion_emisora: string; estado: string; estado_vuce: string | null; fecha_vencimiento: string; fecha_aprobacion: string }>(form: T, datos: DatosPermisoVuce): T {
  return { ...form, numero: datos.numero, institucion_emisora: datos.institucion_emisora ?? form.institucion_emisora,
    estado: datos.estado, estado_vuce: datos.estado_vuce,
    // wcIC012003 has no expiry: keep the current value instead of clearing it.
    fecha_vencimiento: datos.verificacion ? form.fecha_vencimiento : datos.fecha_vencimiento ?? "",
    fecha_aprobacion: datos.fecha_aprobacion ?? "" };
}

/** Match this permit only; other permits in the same expediente remain independent. */
export function documentoDelPermisoVuce<T extends { storage_path: string | null; codigo_siga: string | null }>(
  documentos: T[], path: string, previo: string | null, codigo: string | null,
): T | undefined {
  return documentos.find((d) => d.storage_path === path)
    ?? documentos.find((d) => previo != null && d.storage_path === previo)
    ?? documentos.find((d) => codigo != null && d.codigo_siga === codigo);
}