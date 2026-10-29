/** Documentos combinados (varios tipos en un solo PDF): detección y segmentación sin IA. */

/** Más páginas que esto se procesa en segundo plano, nunca en la llamada del webhook. */
export const UMBRAL_PAGINAS_COMBINADO = 4;
export const MAX_PAGINAS_COMBINADO = 40;
export const MAX_SEGMENTOS_COMBINADO = 15;

type Encabezado = { tipo: string; etiqueta: string; re: RegExp };

// Orden importa: proforma antes que factura comercial.
const ENCABEZADOS: Encabezado[] = [
  { tipo: "Factura proforma", etiqueta: "Proforma Invoice", re: /PRO\s*-?\s*FORMA\s+INVOICE|FACTURA\s+PRO\s*-?\s*FORMA/ },
  { tipo: "Factura comercial", etiqueta: "Commercial Invoice", re: /COMMERCIAL\s+INVOICE|FACTURA\s+COMERCIAL/ },
  { tipo: "Lista de empaque", etiqueta: "Packing List", re: /PACKING\s+LIST|LISTA\s+DE\s+EMPAQUE/ },
  { tipo: "Otro", etiqueta: "Certificate of Production", re: /CERTIFICATE\s+OF\s+PRODUCTION|CERTIFICADO\s+DE\s+PRODUCCI[OÓ]N/ },
  { tipo: "Certificado de origen", etiqueta: "Certificate of Origin", re: /CERTIFICATE\s+OF\s+ORIGIN|CERTIFICADO\s+DE\s+ORIGEN|CAFTA|EUR\.?\s*1\b/ },
  { tipo: "Certificado de análisis", etiqueta: "Certificate of Analysis", re: /CERTIFICATE\s+OF\s+ANALYSIS|CERTIFICADO\s+DE\s+AN[AÁ]LISIS/ },
  { tipo: "Certificado Sanitario/Fitosanitario", etiqueta: "Certificado Sanitario/Fitosanitario", re: /PHYTOSANITARY|FITOSANITARIO|SANITARY\s+CERTIFICATE|HEALTH\s+CERTIFICATE|CERTIFICADO\s+SANITARIO/ },
  { tipo: "Bill of Lading", etiqueta: "Bill of Lading", re: /BILL\s+OF\s+LADING|CONOCIMIENTO\s+DE\s+EMBARQUE/ },
  { tipo: "Guía aérea", etiqueta: "Air Waybill", re: /AIR\s*WAY\s*BILL/ },
];

export type TipoPagina = { tipo: string; etiqueta: string } | null;

/** Busca el encabezado en la parte superior de la página (evita menciones dentro del cuerpo). */
export function detectarTipoPagina(texto: string): TipoPagina {
  const top = texto.normalize("NFC").toUpperCase().replace(/\s+/g, " ").slice(0, 700);
  let mejor: { e: Encabezado; pos: number } | null = null;
  for (const e of ENCABEZADOS) {
    const m = e.re.exec(top);
    if (m && (!mejor || m.index < mejor.pos)) mejor = { e, pos: m.index };
  }
  return mejor ? { tipo: mejor.e.tipo, etiqueta: mejor.e.etiqueta } : null;
}

export type Segmento = { tipo: string | null; etiqueta: string | null; paginas: number[] };

/**
 * Divide donde cambia el tipo. Una página sin encabezado continúa el segmento anterior;
 * páginas iniciales sin encabezado forman un segmento sin clasificar (tipo null).
 */
export function segmentarPaginas(tipos: TipoPagina[], max = MAX_SEGMENTOS_COMBINADO): Segmento[] {
  const out: Segmento[] = [];
  tipos.forEach((t, i) => {
    const ult = out[out.length - 1];
    if (!t) {
      if (ult) ult.paginas.push(i);
      else out.push({ tipo: null, etiqueta: null, paginas: [i] });
      return;
    }
    if (ult && ult.tipo === t.tipo && ult.etiqueta === t.etiqueta) ult.paginas.push(i);
    else if (out.length >= max && ult) ult.paginas.push(i);
    else out.push({ tipo: t.tipo, etiqueta: t.etiqueta, paginas: [i] });
  });
  return out;
}

/** Fallo por tiempo de espera del gateway: se reintenta en segundo plano, no en la misma llamada. */
export function esTimeoutGateway(error: unknown): boolean {
  return /\[(52[0-4]|504|408)\]|time\s*-?out|timed out/i.test(String(error instanceof Error ? error.message : error ?? ""));
}

export const AVISO_PROCESANDO_COMBINADO = "Procesando documento combinado…";

export function nombreSegmento(nombreOriginal: string, s: Segmento, i: number): string {
  const base = nombreOriginal.replace(/\.pdf$/i, "");
  const pags = s.paginas.length === 1 ? `p${s.paginas[0] + 1}` : `p${s.paginas[0] + 1}-${s.paginas[s.paginas.length - 1] + 1}`;
  return `${base} · ${i + 1} ${s.etiqueta ?? "Sin clasificar"} (${pags}).pdf`;
}
