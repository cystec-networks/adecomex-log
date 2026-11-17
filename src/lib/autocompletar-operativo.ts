import type { OcrExtraction } from "./ai-ocr.functions";

/**
 * Autocompletado de un Expediente ya creado desde el BL/AWB o la Factura comercial.
 * Reglas fijas y puras (sin IA, sin base de datos): el lector es el mismo del Nuevo
 * Expediente (`extractSolicitudFromDocument`); aquí solo se decide qué se llena.
 *
 * - Solo campos vacíos. Un 0 en importes, pesos o bultos cuenta como vacío.
 * - El N.º de BL solo se llena si el consignatario del documento coincide con el
 *   cliente del Expediente (original o endosado).
 * - Nunca se pisa un valor manual ni un valor ya guardado.
 */

export const TIPO_BL = "Bill of Lading";
export const TIPO_GUIA_AEREA = "Guía aérea";
export const TIPO_FACTURA_COMERCIAL = "Factura comercial";

/** Documentos cuyo contenido autocompleta campos operativos del Expediente. */
export const TIPOS_OPERATIVOS = [TIPO_BL, TIPO_GUIA_AEREA, TIPO_FACTURA_COMERCIAL] as const;

export const esDocumentoOperativo = (tipo: string | null | undefined): boolean =>
  !!tipo && (TIPOS_OPERATIVOS as readonly string[]).includes(tipo);

export type FuenteOperativa = "bl" | "factura";

export function fuenteOperativa(tipo: string | null | undefined): FuenteOperativa | null {
  if (tipo === TIPO_FACTURA_COMERCIAL) return "factura";
  if (tipo === TIPO_BL || tipo === TIPO_GUIA_AEREA) return "bl";
  return null;
}

export const ETIQUETA_AUTO_OPERATIVO = "Automático";

/** Diferencias aceptadas antes de mostrar una alerta. Son los valores por defecto del equipo. */
export const TOLERANCIAS_OPERATIVO = {
  /** Porcentaje de diferencia admitido en pesos (0.5 %). */
  pesoPct: 0.005,
  /** Bultos: sin tolerancia, cualquier diferencia alerta. */
  bultos: 0,
  /** Porcentaje de diferencia admitido en montos (0.5 %). */
  montoPct: 0.005,
  /** Diferencia absoluta mínima en el mismo antes de alertar (evita alertas por centavos). */
  montoMinimo: 1,
};

/** Columnas donde un 0 significa «sin dato» (así lo confirmó el usuario). */
const CERO_CUENTA_VACIO = new Set([
  "total_fob", "seguro", "flete", "otros", "peso_bruto", "peso_neto", "cantidad_bultos",
]);

export function esVacioOperativo(columna: string, valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string" && !valor.trim()) return true;
  if (CERO_CUENTA_VACIO.has(columna)) {
    const n = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(n) ? n === 0 : false;
  }
  return false;
}

export type CampoOperativo = {
  columna: string;
  etiqueta: string;
  /** Documentos de los que puede salir el valor. */
  fuentes: FuenteOperativa[];
  /** Clave del resultado de lectura de donde se toma. */
  clave: keyof OcrExtraction | "cantidad";
  tipo: "texto" | "numero" | "fecha";
  /** Columna de código DGA que acompaña al valor (puertos y países). */
  codigo?: string;
  /** El valor solo se acepta con evidencia fuerte. */
  exigeConfianzaAlta?: boolean;
  /** Requiere que el consignatario del documento coincida con el cliente. */
  exigeConsignatario?: boolean;
};

export const CAMPOS_OPERATIVOS: CampoOperativo[] = [
  { columna: "bl_awb", etiqueta: "N.º BL/AWB", fuentes: ["bl"], clave: "bl", tipo: "texto", exigeConsignatario: true },
  { columna: "naviera", etiqueta: "Naviera", fuentes: ["bl"], clave: "naviera", tipo: "texto" },
  { columna: "puerto_salida", etiqueta: "Puerto de salida", fuentes: ["bl"], clave: "puerto_salida", tipo: "texto", codigo: "puerto_salida_codigo" },
  { columna: "puerto_arribo", etiqueta: "Puerto de arribo", fuentes: ["bl"], clave: "puerto_arribo", tipo: "texto", codigo: "puerto_arribo_codigo" },
  { columna: "fecha_cargado", etiqueta: "Fecha de carga", fuentes: ["bl"], clave: "fecha_cargado", tipo: "fecha" },
  { columna: "medio_transporte", etiqueta: "Medio de transporte", fuentes: ["bl"], clave: "medio_transporte", tipo: "texto" },
  { columna: "peso_bruto", etiqueta: "Peso bruto", fuentes: ["bl"], clave: "peso_bruto_kg", tipo: "numero" },
  { columna: "peso_neto", etiqueta: "Peso neto", fuentes: ["bl", "factura"], clave: "peso_neto_kg", tipo: "numero" },
  { columna: "cantidad_bultos", etiqueta: "Cantidad de bultos", fuentes: ["bl", "factura"], clave: "cantidad", tipo: "numero" },
  { columna: "tipo_carga", etiqueta: "Tipo de carga", fuentes: ["bl", "factura"], clave: "tipo_carga", tipo: "texto", exigeConfianzaAlta: true },
  { columna: "pais_procedencia", etiqueta: "País de procedencia", fuentes: ["bl", "factura"], clave: "pais_procedencia", tipo: "texto", codigo: "pais_procedencia_codigo" },
  { columna: "suplidor", etiqueta: "Suplidor", fuentes: ["factura"], clave: "suplidor", tipo: "texto" },
  { columna: "factura_comercial", etiqueta: "N.º de factura", fuentes: ["factura"], clave: "factura_comercial", tipo: "texto" },
  { columna: "total_fob", etiqueta: "FOB total", fuentes: ["factura"], clave: "fob_total", tipo: "numero" },
  { columna: "seguro", etiqueta: "Seguro", fuentes: ["factura", "bl"], clave: "seguro", tipo: "numero" },
  { columna: "flete", etiqueta: "Flete", fuentes: ["factura", "bl"], clave: "flete", tipo: "numero" },
  { columna: "otros", etiqueta: "Otros CIF", fuentes: ["factura", "bl"], clave: "otros_gastos", tipo: "numero" },
  { columna: "incoterm", etiqueta: "Incoterm", fuentes: ["factura", "bl"], clave: "incoterm", tipo: "texto" },
  { columna: "pais_origen", etiqueta: "País de origen", fuentes: ["factura"], clave: "pais_origen", tipo: "texto", codigo: "pais_origen_codigo" },
  { columna: "descripcion_mercancia", etiqueta: "Descripción de la mercancía", fuentes: ["factura", "bl"], clave: "descripcion_mercancia", tipo: "texto" },
];

/** Lo que queda en `documentos.lectura_operativa`, ligado al archivo que se leyó. */
export type LecturaOperativaGuardada = {
  archivo: string | null;
  leido_en: string;
  origen: "manual" | "correo" | "leer_ahora";
  fuente: FuenteOperativa;
  /** Copia de los valores leídos que interesan, para no volver a leer el archivo. */
  datos: Record<string, unknown>;
  motivo: string | null;
  completados: string[];
  alertas: string[];
};

export type DecisionOperativa = {
  cambios: Record<string, unknown>;
  completados: string[];
  avisos: string[];
  /** Diferencias con otros documentos: solo alertas, nunca bloquean ni corrigen. */
  alertas: string[];
  /** Campos donde el documento y el Expediente dicen lo mismo. */
  coincidencias: string[];
};

type Actual = Record<string, unknown>;

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Valor del Expediente considerado «sin dato» según la regla de la columna. */
function vacioEn(actual: Actual, columna: string): boolean {
  return esVacioOperativo(columna, actual[columna]);
}

/**
 * Decide qué campos vacíos se llenan desde la lectura de un BL/AWB o una Factura comercial.
 * `consignatarioCoincide` llega de fuera (endoso incluido) porque depende de dos tablas.
 * `catalogo` resuelve puertos y países contra las tablas de la DGA (nombre + código).
 */
export function decidirAutocompletadoOperativo(p: {
  actual: Actual;
  datos: Partial<OcrExtraction> & Record<string, unknown>;
  fuente: FuenteOperativa;
  consignatarioCoincide: boolean;
  catalogo?: Record<string, { nombre: string | null; codigo: string | null }>;
  /** Contenedores ya guardados en el Expediente (se respetan siempre). */
  contenedoresActuales?: number;
}): DecisionOperativa {
  const cambios: Record<string, unknown> = {};
  const completados: string[] = [];
  const avisos: string[] = [];
  const alertas: string[] = [];
  const datos = p.datos ?? {};

  for (const campo of CAMPOS_OPERATIVOS) {
    if (!campo.fuentes.includes(p.fuente)) continue;
    if (campo.exigeConsignatario && !p.consignatarioCoincide) continue;
    if (campo.exigeConfianzaAlta && datos.tipo_carga_confianza !== "alta") {
      if (datos[campo.clave as keyof OcrExtraction] != null && vacioEn(p.actual, campo.columna)) {
        avisos.push(`${campo.etiqueta}: la lectura no es segura; se deja para que lo elijas.`);
      }
      continue;
    }
    let valor: unknown = datos[campo.clave as keyof OcrExtraction];
    if (campo.clave === "medio_transporte" && typeof valor === "string") {
      valor = valor === "aereo" ? "Aéreo" : valor === "maritimo" ? "Marítimo" : valor;
    }
    if (campo.clave === "factura_comercial" && !texto(valor)) valor = datos.numero_documento;
    if (campo.tipo === "numero") valor = numero(valor);
    else valor = texto(valor);

    if (valor === null || valor === undefined || valor === "") continue;
    if (!vacioEn(p.actual, campo.columna)) {
      const previo = p.actual[campo.columna];
      if (campo.tipo === "numero") {
        const a = numero(previo);
        if (a !== null && valor !== a) alertas.push(`${campo.etiqueta}: el Expediente tiene ${a} y el documento ${valor}.`);
      } else if (texto(previo) !== valor) {
        alertas.push(`${campo.etiqueta}: el Expediente tiene «${texto(previo)}» y el documento «${valor}».`);
      }
      continue;
    }

    cambios[campo.columna] = valor;
    completados.push(campo.columna);
    if (campo.codigo) {
      const res = p.catalogo?.[campo.columna];
      if (res?.codigo) {
        cambios[campo.codigo] = res.codigo;
        if (res.nombre && res.nombre !== valor) cambios[campo.columna] = res.nombre;
        completados.push(campo.codigo);
      } else if (campo.columna.startsWith("puerto_") || campo.columna.startsWith("pais_")) {
        avisos.push(`${campo.etiqueta}: sin código en el catálogo DGA; se guarda el texto del documento.`);
      }
    }
  }

  // Contenedores: solo cuando el Expediente no tiene ninguno.
  const lista = Array.isArray(datos.contenedores) ? (datos.contenedores as OcrExtraction["contenedores"]) : null;
  if (lista?.length && !p.contenedoresActuales) {
    const validos = lista.filter((c) => c && texto(c.numero));
    if (validos.length) cambios.contenedores = validos;
  }

  return { cambios, completados, avisos, alertas };
}

/* ------------------------------------------------------------------ *
 * Validaciones cruzadas: nunca corrigen, solo avisan.
 * ------------------------------------------------------------------ */

function difiere(a: number | null, b: number | null, pct: number, minimo = 0): boolean {
  if (a === null || b === null) return false;
  const d = Math.abs(a - b);
  return d > minimo && d > Math.max(Math.abs(a), Math.abs(b)) * pct;
}

/** BL contra Factura: consignatario, peso, bultos y descripción. */
export function alertasBlContraFactura(p: {
  bl: Partial<OcrExtraction> & Record<string, unknown>;
  factura: Partial<OcrExtraction> & Record<string, unknown>;
  consignatarioCoincide: boolean;
}): string[] {
  const out: string[] = [];
  const t = (v: unknown) => texto(v);
  if (t(p.bl.cliente) && t(p.factura.cliente) && !p.consignatarioCoincide) {
    out.push(`Consignatario del BL «${t(p.bl.cliente)}» no coincide con el de la factura «${t(p.factura.cliente)}».`);
  }
  if (difiere(numero(p.bl.peso_bruto_kg), numero(p.factura.peso_bruto_kg), TOLERANCIAS_OPERATIVO.pesoPct)) {
    out.push(`Peso bruto distinto: BL ${numero(p.bl.peso_bruto_kg)} kg, factura ${numero(p.factura.peso_bruto_kg)} kg.`);
  }
  const bultosBl = numero(p.bl.cantidad ?? p.bl.peso_neto_kg);
  const bultosFac = numero(p.factura.cantidad);
  if (bultosBl !== null && bultosFac !== null && bultosBl !== bultosFac) {
    out.push(`Bultos distintos: BL ${bultosBl}, factura ${bultosFac}.`);
  }
  const dB = t(p.bl.descripcion_mercancia), dF = t(p.factura.descripcion_mercancia);
  if (dB && dF && dB.toUpperCase() !== dF.toUpperCase() && !dB.toUpperCase().includes(dF.toUpperCase()) && !dF.toUpperCase().includes(dB.toUpperCase())) {
    out.push("Descripción de la mercancía distinta entre BL y factura.");
  }
  return out;
}

export type LineaComparables = { descripcion: string | null; cantidad: number | null; valor: number | null };

/** Factura contra la Orden de compra de origen: proveedor, cantidades, precio y total. */
export function alertasFacturaContraOrden(p: {
  suplidor: string | null;
  totalFob: number | null;
  lineas: LineaComparables[];
  orden: { suplidor: string | null; total: number | null; lineas: LineaComparables[] } | null;
}): string[] {
  const out: string[] = [];
  if (!p.orden) return out;
  const o = p.orden;
  const s = texto(p.suplidor), so = texto(o.suplidor);
  if (s && so && s.toUpperCase() !== so.toUpperCase()) out.push(`El suplidor de la factura «${s}» no es el de la Orden «${so}».`);
  if (difiere(p.totalFob, o.total, TOLERANCIAS_OPERATIVO.montoPct, TOLERANCIAS_OPERATIVO.montoMinimo)) {
    out.push(`Total distinto: factura US$${p.totalFob}, Orden US$${o.total}.`);
  }
  for (const l of p.lineas) {
    const d = texto(l.descripcion);
    if (!d) continue;
    const eq = o.lineas.find((x) => texto(x.descripcion)?.toUpperCase() === d.toUpperCase());
    if (!eq) continue;
    if (l.cantidad !== null && eq.cantidad !== null && l.cantidad !== eq.cantidad) {
      out.push(`Cantidad distinta en «${d}»: factura ${l.cantidad}, Orden ${eq.cantidad}.`);
    }
    const pf = l.cantidad ? (l.valor ?? 0) / l.cantidad : null;
    const po = eq.cantidad ? (eq.valor ?? 0) / eq.cantidad : null;
    if (difiere(pf, po, TOLERANCIAS_OPERATIVO.montoPct, TOLERANCIAS_OPERATIVO.montoMinimo)) {
      out.push(`Precio unitario distinto en «${d}»: factura ${pf?.toFixed(2)}, Orden ${po?.toFixed(2)}.`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Etiqueta «Automático»
 * ------------------------------------------------------------------ */

/** El valor actual del Expediente vino del BL/Factura (y sigue siendo ese valor). */
export function esAutomaticoOperativo(
  exp: Record<string, unknown> | null | undefined,
  campo: string,
  valor?: unknown,
): boolean {
  const reg = ((exp?.auto_documento ?? {}) as Record<string, unknown>)[campo];
  if (!reg) return false;
  if (valor === undefined) return true;
  const v = (reg as { valor?: unknown }).valor;
  if (v == null) return true;
  const a = typeof v === "number" ? v : Number(v);
  const b = typeof valor === "number" ? valor : Number(valor);
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  return String(v) === String(valor);
}
