/** Documentary VUCE states retain their literal label alongside the operational enum. */
export function clasificarEstadoVuce(value: string) {
  const s = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (s === "aprobado") return "aprobado";
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
};

export function leerDetalleSolicitudVuce(text: string): DatosPermisoVuce | null {
  const t = text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const numero = t.match(/No\.?\s*(?:de\s+)?Tr[aá]mite\s*:?\s*(TRM-[\w-]+)/i)?.[1];
  if (!numero) return null;
  // Stop at the next label even when PDF text extraction merges a table row.
  const valor = (label: string) => t.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+?)(?=\\s+(?:[A-ZÁÉÍÓÚ][\\wÁÉÍÓÚáéíóú.]*\\s*){1,5}:|\\n|$)`, "i"))?.[1]?.trim() ?? null;
  const estadoVuce = valor("(?<![\\w])Estado");
  if (!estadoVuce || estadoVuce === "-") return null;
  const estado = clasificarEstadoVuce(estadoVuce);
  const historial = t.split(/Historial\s+de\s+Aprobaciones/i)[1]?.split(/(?:Historial\s+de\s+(?!Aprobaciones)|Documentos\s+Adjuntos|Historial\s+de\s+Estados)/i)[0] ?? "";
  const fechas = [...historial.matchAll(/Fecha\s+de\s+Aprobaci[oó]n\s*:\s*([^\n]+)/gi)]
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
    fecha_vencimiento: datos.fecha_vencimiento ?? "", fecha_aprobacion: datos.fecha_aprobacion ?? "" };
}