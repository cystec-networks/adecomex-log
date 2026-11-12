// Reglas puras: cuándo un PDF es digital completo y qué tipo indica su título (clasificación sin IA).

export const MAX_CARACTERES_TEXTO = 60_000;

export const INSTRUCCION_CANTIDAD = " Agrega 'cantidad': la cantidad total de bultos/unidades tal como aparece (ej. '2,000 BAGS'), o null.";
const MIN_POR_PAGINA = 80;

/** Solo PDFs digitales completos: cada página con texto suficiente y sin exceder el tamaño manejable. */
export function textoDigitalSuficiente(paginas: string[]): boolean {
  if (!paginas.length) return false;
  const total = paginas.reduce((s, p) => s + p.replace(/\s/g, "").length, 0);
  if (total > MAX_CARACTERES_TEXTO) return false;
  // Formularios con solo etiquetas (valores como imagen o campos de formulario) casi no tienen cifras.
  if (paginas.join("").replace(/\D/g, "").length < 15) return false;
  return paginas.every((p) => p.replace(/\s/g, "").length >= MIN_POR_PAGINA);
}

const REGLAS: Array<[string, RegExp]> = [
  ["Factura proforma", /^(PRO\s?-?FORMA(\s+INVOICE)?|FACTURA\s+PRO\s?-?FORMA)$/],
  ["Factura comercial", /^(COMMERCIAL\s+INVOICE|FACTURA\s+COMERCIAL)$/],
  ["Lista de empaque", /^(PACKING\s+LIST|LISTA\s+DE\s+EMPAQUE)$/],
  ["Guía aérea", /^(AIR\s?WAY\s?BILL|GUIA\s+AEREA)$/],
  ["Bill of Lading", /^(BILL\s+OF\s+LADING|SEA\s?WAY\s?BILL|CONOCIMIENTO\s+DE\s+EMBARQUE)( FOR (OCEAN|COMBINED) TRANSPORT( OR (PORT TO PORT|MULTIMODAL) SHIPMENT)?)?$/],
  ["Certificado de análisis", /^(CERTIFICATE\s+OF\s+ANALYSIS|CERTIFICADO\s+DE\s+ANALISIS)$/],
  ["Certificado Sanitario/Fitosanitario", /^(PHYTOSANITARY\s+CERTIFICATE|CERTIFICADO\s+FITOSANITARIO|HEALTH\s+CERTIFICATE|CERTIFICADO\s+SANITARIO)$/],
  ["Certificado de origen", /^(CERTIFICATE\s+OF\s+ORIGIN|CERTIFICADO\s+DE\s+ORIGEN)$/],
];
const ADORNOS = /^(ORIGINAL|COPY|COPIA|NON[\s-]?NEGOTIABLE|DRAFT)\s+|\s+(ORIGINAL|COPY|COPIA|NON[\s-]?NEGOTIABLE|DRAFT)$/g;

/**
 * Tipo por el título del documento: solo cuando un renglón (o celda) de la página 1 es exactamente
 * el título y un único tipo aparece así. Una etiqueta como «Bill of Lading No» dentro de una factura
 * no cuenta. Cualquier duda devuelve null y decide el modelo económico.
 */
export function tipoPorEncabezado(texto: string): string | null {
  const pagina1 = texto.replace(/^--- Página 1 ---\n/, "").split(/\n--- Página \d+ ---\n/)[0];
  const normal = pagina1.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const renglones = normal.split("\n").slice(0, 30);
  if (renglones.some((r) => /\b(STATEMENT|ESTADO\s+DE\s+CUENTA|QUOTATION|COTIZACION|DEBIT\s+NOTE|ARRIVAL\s+NOTICE|AVISO\s+DE\s+LLEGADA|VUCE|PIN|RECIBO|COMPROBANTE)\b/.test(r))) return null;
  // Solo celdas que son únicamente palabras (sin numeración, puntos ni cifras: «2) Factura Comercial.» no es un título).
  const celdas = renglones.flatMap((r) => r.split(" | ")).map((c) => c.trim()).filter((c) => /^[A-Z][A-Z\s-]*$/.test(c)).map((c) => c.replace(/\s+/g, " ").replace(ADORNOS, "").trim());
  const hallados = new Set(REGLAS.filter(([, re]) => celdas.some((c) => re.test(c))).map(([t]) => t));
  if (hallados.size === 2 && hallados.has("Factura proforma") && hallados.has("Factura comercial")) return "Factura proforma";
  return hallados.size === 1 ? [...hallados][0] : null;
}
