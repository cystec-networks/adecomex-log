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

/**
 * Patrón determinista del Asunto: «HACER VUCE: BL <código>-- ETA <fecha> -- …».
 * BL = lo que sigue a «BL» hasta «--» o espacio; ETA = lo que sigue a «ETA» hasta «--».
 * Si no hay etiqueta ETA, se acepta solo una fecha pegada al separador del BL («BL: X ---29/09/2026---»).
 */
export function extraerDeAsunto(asunto: string): Pick<DatosSolicitudCorreo, "bl_awb" | "eta"> {
  const s = (asunto ?? "").replace(/\s+/g, " ");
  const bl = /\bBL\s*:?\s*([A-Z0-9][A-Z0-9-]*?[A-Z0-9])(?=\s*-{2,}|\s|$)/i.exec(s)?.[1]?.toUpperCase() ?? null;
  const valido = bl && bl.length >= 6 && /\d/.test(bl) ? bl : null;
  let eta = fechaCorreo(/\bETA\s*:?\s*([^-]+?)\s*(?:-{2,}|$)/i.exec(s)?.[1] ?? null);
  if (!eta && valido) {
    const m = new RegExp(`\\bBL\\s*:?\\s*${valido}\\s*-{2,}\\s*(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}|\\d{4}-\\d{1,2}-\\d{1,2})`, "i").exec(s);
    eta = fechaCorreo(m?.[1] ?? null);
  }
  return { bl_awb: valido, eta };
}

/** Une asunto (prioritario, patrón fijo) y cuerpo; si ambos traen un dato distinto, gana el asunto con aviso. */
export function fusionarAsunto(cuerpo: DatosSolicitudCorreo, asunto: string): { datos: DatosSolicitudCorreo; advertencias: string[] } {
  const a = extraerDeAsunto(asunto);
  const advertencias: string[] = [];
  const datos = { ...cuerpo };
  if (cuerpo.bl_awb && a.bl_awb && norm(cuerpo.bl_awb) !== norm(a.bl_awb)) advertencias.push(`BL/AWB: verificar: el cuerpo sugiere un valor distinto (${cuerpo.bl_awb}); se usó el del asunto (${a.bl_awb})`);
  if (cuerpo.eta && a.eta && cuerpo.eta !== a.eta) advertencias.push(`ETA: verificar: el cuerpo sugiere un valor distinto (${cuerpo.eta}); se usó la del asunto (${a.eta})`);
  datos.bl_awb = a.bl_awb ?? cuerpo.bl_awb;
  datos.eta = a.eta ?? cuerpo.eta;
  return { datos, advertencias };
}

/** Tipos de la ficha Documentos que puede recibir un adjunto de correo. */
export const TIPOS_ADJUNTO_CORREO = [
  "Bill of Lading", "Guía aérea", "Factura comercial", "Lista de empaque", "Certificado de origen",
  "Certificado Sanitario/Fitosanitario", "Certificado de análisis",
] as const;

/** Normaliza el tipo propuesto por la IA; lo no reconocido queda en «Otro». */
export function tipoAdjuntoCorreo(v: unknown): string {
  const n = norm(typeof v === "string" ? v : "");
  if (!n) return "Otro";
  const exacto = TIPOS_ADJUNTO_CORREO.find((t) => norm(t) === n);
  if (exacto) return exacto;
  if (/BILLOFLADING|^BL$|CONOCIMIENTO/.test(n)) return "Bill of Lading";
  if (/AIRWAYBILL|AIRWAYBILL|AWB|GUIAAEREA/.test(n)) return "Guía aérea";
  if (/PACKING|EMPAQUE/.test(n)) return "Lista de empaque";
  if (/INVOICE|FACTURA/.test(n) && !/PROFORMA/.test(n)) return "Factura comercial";
  if (/ORIGIN|ORIGEN/.test(n)) return "Certificado de origen";
  if (/SANITAR|PHYTO|FITO|HEALTH/.test(n)) return "Certificado Sanitario/Fitosanitario";
  if (/ANALYSIS|ANALISIS/.test(n)) return "Certificado de análisis";
  return "Otro";
}

export type DatosAdjunto = {
  tipo: string;
  eta?: string | null;
  bl_awb?: string | null;
  cliente_nombre?: string | null;
  producto?: string | null;
  cantidad?: string | null;
  peso_bruto_kg?: number | null;
  factura_comercial?: string | null;
};

export type DatosCompletosCorreo = DatosSolicitudCorreo & { peso_bruto_kg: number | null; factura_comercial: string | null };

const ETIQUETA: Record<string, string> = { bl_awb: "BL/AWB", eta: "ETA", cliente_nombre: "Cliente", producto: "Producto", cantidad: "Cantidad" };

/**
 * Prioridad: 1) documento adjunto reconocido, 2) asunto/cuerpo (ya fusionados).
 * Si el documento y el correo difieren, gana el documento y se añade el aviso «verificar».
 */
export function fusionarAdjuntos(
  correo: DatosSolicitudCorreo,
  advertenciasCorreo: string[],
  adjuntos: DatosAdjunto[],
): { datos: DatosCompletosCorreo; advertencias: string[] } {
  const advertencias = [...advertenciasCorreo];
  const datos: DatosCompletosCorreo = { ...correo, peso_bruto_kg: null, factura_comercial: null };
  const reconocidos = adjuntos.filter((a) => a.tipo !== "Otro");
  const primero = <K extends keyof DatosAdjunto>(k: K, tipos?: string[]) =>
    reconocidos.filter((a) => !tipos || tipos.includes(a.tipo)).map((a) => a[k]).find((v) => v != null && v !== "") ?? null;
  for (const k of ["bl_awb", "eta", "cliente_nombre", "producto", "cantidad"] as const) {
    const raw = primero(k, k === "bl_awb" ? ["Bill of Lading", "Guía aérea"] : undefined) as string | null;
    const doc = raw ? (k === "eta" ? fechaCorreo(raw) : k === "bl_awb" ? raw.trim().toUpperCase() : raw.trim()) : null;
    if (!doc) continue;
    const previo = correo[k];
    if (previo && norm(previo) !== norm(doc)) advertencias.push(`${ETIQUETA[k]}: verificar: el asunto/cuerpo sugiere un valor distinto (${previo}); se usó el del documento adjunto (${doc})`);
    datos[k] = doc;
  }
  const peso = primero("peso_bruto_kg");
  datos.peso_bruto_kg = peso != null && !isNaN(Number(peso)) ? Number(peso) : null;
  datos.factura_comercial = (primero("factura_comercial", ["Factura comercial"]) as string | null) ?? (primero("factura_comercial") as string | null);
  return { datos, advertencias };
}
