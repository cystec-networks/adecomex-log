/** Recepción de solicitudes de servicio por correo: aislar el mensaje nuevo y extraer datos sin inventar. */

const MARCADORES: RegExp[] = [
  /^\s*-{2,}\s*(forwarded message|mensaje reenviado|original message|mensaje original)\s*-{2,}/im,
  /^\s*_{5,}\s*$/m,
  /^\s*El\s.{3,200}?escribi[óo]\s*:?\s*$/im,
  /^\s*On\s.{3,200}?wrote\s*:?\s*$/im,
  /^\s*\*?De:\*?\s.+\n(?:.*\n){0,3}?\s*\*?Enviad[oa]:\*?\s/im,
  /^\s*\*?From:\*?\s.+\n(?:.*\n){0,3}?\s*\*?Sent:\*?\s/im,
  /^\s*>/m,
];

/** Devuelve solo el mensaje más reciente del hilo (antes del primer marcador de cadena). */
export function aislarMensajeReciente(cuerpo: string): string {
  const texto = (cuerpo ?? "").replace(/\r\n?/g, "\n");
  let corte = texto.length;
  for (const re of MARCADORES) {
    const m = re.exec(texto);
    if (m && m.index < corte) corte = m.index;
  }
  return texto.slice(0, corte).trim();
}

export type DatosSolicitudCorreo = {
  bl_awb: string | null;
  eta: string | null; // YYYY-MM-DD
  producto: string | null;
  cantidad: string | null;
  cliente_nombre: string | null;
};

const linea = (texto: string, etiquetas: string) => {
  const re = new RegExp(`^[\\s\\-•*]*(?:${etiquetas})\\s*[:#.]?\\s*(.+)$`, "im");
  const v = re.exec(texto)?.[1]?.trim();
  return v ? v.replace(/\s+/g, " ") : null;
};

/** DD/MM/YYYY, DD-MM-YYYY o YYYY-MM-DD → YYYY-MM-DD; inválida → null. */
export function fechaCorreo(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else {
    r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3];
  }
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Extracción determinista por etiquetas del mensaje aislado. */
export function extraerPorEtiquetas(mensaje: string): DatosSolicitudCorreo {
  const bl = linea(mensaje, "B/?L|AWB|BL/AWB|Bill of Lading|Gu[ií]a a[ée]rea|Conocimiento de embarque");
  return {
    bl_awb: bl ? (bl.match(/[A-Z0-9][A-Z0-9-]{5,}/i)?.[0]?.toUpperCase() ?? null) : null,
    eta: fechaCorreo(linea(mensaje, "ETA|Fecha estimada de llegada|Llegada estimada")),
    producto: linea(mensaje, "Producto|Mercanc[ií]a|Descripci[óo]n"),
    cantidad: linea(mensaje, "Cantidad|Qty|Quantity"),
    cliente_nombre: null,
  };
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Combina etiquetas (prioritarias) con la IA. Un valor de la IA solo se acepta si aparece
 * literalmente en el mensaje aislado (o el remitente, para el cliente): nunca se inventa.
 */
export function combinarDatos(
  etiquetas: DatosSolicitudCorreo,
  ia: Partial<Record<keyof DatosSolicitudCorreo, string | null>>,
  mensaje: string,
  remitente = "",
): DatosSolicitudCorreo {
  const fuente = norm(`${mensaje} ${remitente}`);
  const ok = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s && fuente.includes(norm(s)) ? s : null;
  };
  const etaIa = typeof ia.eta === "string" ? fechaCorreo(ia.eta) : null;
  return {
    bl_awb: etiquetas.bl_awb ?? ok(ia.bl_awb)?.toUpperCase() ?? null,
    eta: etiquetas.eta ?? (etaIa && typeof ia.eta === "string" && fuente.includes(norm(ia.eta)) ? etaIa : null),
    producto: etiquetas.producto ?? ok(ia.producto),
    cantidad: etiquetas.cantidad ?? ok(ia.cantidad),
    cliente_nombre: etiquetas.cliente_nombre ?? ok(ia.cliente_nombre),
  };
}

/** Campos por completar que se muestran en la bandeja. */
export function camposFaltantes(s: Partial<DatosSolicitudCorreo> & { cliente_id?: string | null }): string[] {
  const f: string[] = [];
  if (!s.bl_awb) f.push("BL/AWB");
  if (!s.eta) f.push("ETA");
  if (!s.producto) f.push("Producto");
  if (!s.cantidad) f.push("Cantidad");
  if (!s.cliente_id && !s.cliente_nombre) f.push("Cliente");
  return f;
}
