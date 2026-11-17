// Lectura determinista del «COMPROBANTE DE PAGO» de la DGA y su comparación con la Liquidación.
// Reglas fijas, sin IA: el texto del PDF se procesa por etiquetas y celdas; si algo no se puede
// leer se reporta el motivo, nunca se deduce ni se inventa.

import { campoDgaVacio } from "./resultado-dga-documentos";

export const TIPO_RECIBO_DGA = "Recibo Pago de Impuestos";

/** Importe con separador de miles y decimales obligatorios (así los imprime SIGA). */
const MONEY = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})";
const AL_FINAL = new RegExp(`(${MONEY})\\s*$`);
const SOLO_MONEY = new RegExp(`^\\$?\\s*(${MONEY})\\s*$`);
const MONEY_G = new RegExp(MONEY, "g");

const num = (raw: string | null | undefined): number | null => {
  if (typeof raw !== "string") return null;
  const limpio = raw.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(limpio)) return null;
  const v = Number(limpio);
  return Number.isFinite(v) ? v : null;
};

/** «25/09/2026» → «2026-09-25»; null si no es una fecha real. */
export function isoFechaRecibo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export type FormaPagoRecibo = {
  tipo: string | null;
  numero_pin: string | null;
  banco: string | null;
  transaccion: string | null;
  monto: number | null;
};

export type ConceptosRecibo = {
  servicio: number | null;
  arancel: number | null;
  itbis: number | null;
  declaracion_valor: number | null;
  dua: number | null;
  recargo: number | null;
};

export type ReciboDga = {
  recibo: string | null;
  fecha_pago: string | null;
  hora_pago: string | null;
  rnc: string | null;
  recibido_de: string | null;
  monto: number | null;
  conceptos: ConceptosRecibo;
  total: number | null;
  balance: number | null;
  formas: FormaPagoRecibo[];
  facturas_pagadas: string[];
};

export type BalanceLiquidacion = {
  numero: string | null;
  gravamen: number | null;
  selectivo: number | null;
  itbis: number | null;
  servicio: number | null;
  servicio_pagado: number | null;
  dua: number | null;
  dua_pagado: number | null;
  recargo: number | null;
  multa: number | null;
  interes: number | null;
  sancion: number | null;
  impuestos: number | null;
  impuestos_pagado: number | null;
  balance_impuestos: number | null;
  balance_servicio: number | null;
  fecha_declaracion: string | null;
  importador: string | null;
};

// El comprobante puede venir suelto o dentro de un PDF combinado (recibo + liquidación + DUA).
// La sección del recibo empieza en «Recibo No.» y termina en la siguiente cabecera documental.
const FIN_RECIBO: RegExp[] = [
  /^Reporte de Liquidaci[oó]n de Impuestos/m,
  /^DECLARACION UNICA ADUANERA\s*$/m,
  /^Comprobante de transacci[oó]n\s*$/m,
  /^Factura de Cr[eé]dito Fiscal/m,
];

// El nombre del banco suele partirse entre columnas (otra columna se interpone), así que se
// reconoce por su palabra distintiva y se guarda el nombre canónico.
const BANCOS: { re: RegExp; nombre: string }[] = [
  { re: /BANCO\s+POPULAR/i, nombre: "BANCO POPULAR DOMINICANO" },
  { re: /BANCO\s+DE\s+RESERVAS/i, nombre: "BANCO DE RESERVAS DE LA REPUBLICA DOMINICANA" },
  { re: /BANRESERVAS/i, nombre: "BANRESERVAS" },
  { re: /\bBHD\b/i, nombre: "BHD" },
  { re: /SANTA\s+CRUZ/i, nombre: "BANCO SANTA CRUZ" },
  { re: /MERIDIAN/i, nombre: "BANCO MERIDIAN" },
  { re: /ATLANTICO/i, nombre: "BANCO ATLANTICO" },
  { re: /LOPEZ\s+DE\s+HARO/i, nombre: "BANCO LOPEZ DE HARO" },
  { re: /AGRARIOR/i, nombre: "BANCO AGRARIOR" },
  { re: /\bVIVI\b/i, nombre: "BANCO VIVI" },
  { re: /\bLEON\b/i, nombre: "BANCO LEON" },
  { re: /MICASA/i, nombre: "BANCO MICASA" },
  { re: /BANCAMERICA/i, nombre: "BANCO BANCAMERICA" },
  { re: /\bADEMI\b/i, nombre: "BANCO ADEMI" },
];

const TIPOS_PAGO: { re: RegExp; nombre: string }[] = [
  { re: /banca\s*electr[oó]nica/i, nombre: "Banca Electrónica" },
  { re: /transferencia/i, nombre: "Transferencia" },
  { re: /cheque/i, nombre: "Cheque" },
  { re: /tarjeta/i, nombre: "Tarjeta" },
  { re: /efectivo/i, nombre: "Efectivo" },
];

const CONCEPTOS: { clave: keyof ConceptosRecibo; re: RegExp }[] = [
  { clave: "servicio", re: /^Tasa por Servicio Aduanero\b/ },
  { clave: "arancel", re: /^Impuestos Arancelarios\b/ },
  { clave: "itbis", re: /^Impuesto a la Transferencia de Bienes Industrializados y Servicios\b/ },
  { clave: "declaracion_valor", re: /^Declaraci[oó]n del Valor\b/ },
  { clave: "dua", re: /^Declaraci[oó]n Unica Aduanera\b/ },
  { clave: "recargo", re: /^Recargo Art\.374\b/ },
];

function concepto(lineas: string[], re: RegExp): number | null {
  for (let i = 0; i < lineas.length; i++) {
    if (!re.test(lineas[i])) continue;
    const resto = lineas[i].replace(re, "");
    const alFinal = resto.match(AL_FINAL);
    if (alFinal) return num(alFinal[1]);
    // ITBIS: la etiqueta va en su línea y el valor en la siguiente, con «(ITBIS)» debajo.
    for (let j = i + 1; j <= i + 2 && j < lineas.length; j++) {
      const t = lineas[j].trim();
      if (!t) continue;
      if (/^\((?:ITBIS|ISCav|ISCV)\)$/i.test(t)) continue;
      const solo = t.match(SOLO_MONEY);
      if (solo) return num(solo[1]);
      break;
    }
    return null;
  }
  return null;
}

function formasDePago(lineas: string[]): FormaPagoRecibo[] {
  const inicio = lineas.findIndex((l) => /^FORMAS DE PAGO\s*$/i.test(l));
  if (inicio < 0) return [];
  const fin = lineas.findIndex((l, i) => i > inicio && (/^TOTAL\s+[\d,]/.test(l) || /^Balance\s*\$/i.test(l)));
  const bloque = lineas.slice(inicio + 1, fin < 0 ? lineas.length : fin).join(" ");
  if (!bloque.trim()) return [];
  const pines = [...bloque.matchAll(/\b\d{8}[0-9A-F]{8}\b/g)].map((m) => m[0]);
  // Los importes llevan decimales: se quitan antes de buscar transacciones para no leer «17,804.86» como número.
  const sinDinero = bloque.replace(MONEY_G, " ");
  const trans = [...sinDinero.matchAll(/\b\d{7,12}\b/g)].map((m) => m[0]).filter((t) => !pines.some((p) => p.includes(t)));
  const banco = BANCOS.find((b) => b.re.test(sinDinero))?.nombre ?? null;
  // «Banca Electrónica» suele partirse entre columnas: «Banca | … | Electrónica».
  const tipo = /banca/i.test(bloque) && /electr[oó]nica/i.test(bloque)
    ? "Banca Electrónica"
    : TIPOS_PAGO.find((t) => t.re.test(bloque))?.nombre ?? null;
  const montos = [...bloque.matchAll(MONEY_G)].map((m) => num(m[0])).filter((v): v is number => v != null);
  const monto = montos.length ? montos[montos.length - 1] : null;
  const forma = (pin: string | null, t: string | null): FormaPagoRecibo => ({ tipo, numero_pin: pin, banco, transaccion: t, monto });
  if (pines.length) return pines.map((p, i) => forma(p, trans[i] ?? trans[0] ?? null));
  return [forma(null, trans[0] ?? null)];
}

function facturasPagadas(lineas: string[]): string[] {
  const inicio = lineas.findIndex((l) => /^FACTURAS PAGADAS\s*$/i.test(l));
  if (inicio < 0) return [];
  const bloque = lineas.slice(inicio + 1).join("\n").replace(/-\s*\n\s*/g, "-");
  return [...bloque.matchAll(/\b[0-9A-Z]{5}-CL\d{2}-[0-9A-Z]{4}-[0-9A-Z]{4,8}\b/g)].map((m) => m[0]);
}

/** Solo lectura: null cuando el archivo no es un comprobante de pago de la DGA. */
export function reciboDgaDesdeTexto(text: string): ReciboDga | null {
  if (typeof text !== "string") return null;
  const inicio = text.search(/Recibo No\./i);
  if (inicio < 0) return null;
  const resto = text.slice(inicio);
  let fin = resto.length;
  for (const re of FIN_RECIBO) {
    const m = re.exec(resto);
    if (m && m.index > 0 && m.index < fin) fin = m.index;
  }
  const seccion = resto.slice(0, fin);
  if (!/COMPROBANTE DE PAGO/i.test(seccion)) return null;
  const lineas = seccion.split("\n").map((l) => l.trim());
  const recibido = seccion.match(new RegExp(`RECIBIDO DE\\s+(.+?)\\s*\\$\\s*:\\s*(${MONEY})`));
  const total = lineas.find((l) => /^TOTAL\s+[\d,]/.test(l))?.match(AL_FINAL)?.[1] ?? null;
  const conceptos: ConceptosRecibo = {
    servicio: concepto(lineas, CONCEPTOS[0].re),
    arancel: concepto(lineas, CONCEPTOS[1].re),
    itbis: concepto(lineas, CONCEPTOS[2].re),
    declaracion_valor: concepto(lineas, CONCEPTOS[3].re),
    dua: concepto(lineas, CONCEPTOS[4].re),
    recargo: concepto(lineas, CONCEPTOS[5].re),
  };
  return {
    recibo: seccion.match(/Recibo No\.\s*:\s*([0-9A-Za-z][0-9A-Za-z-]*)/i)?.[1] ?? null,
    fecha_pago: isoFechaRecibo(seccion.match(/Fecha\s*:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1]),
    hora_pago: seccion.match(/Hora\s*:\s*(\d{2}:\d{2}:\d{2})/)?.[1] ?? null,
    rnc: seccion.match(/Documento No\.\s*:?\s*([0-9-]{6,})/)?.[1]?.replace(/-/g, "") ?? null,
    recibido_de: recibido?.[1]?.trim() ?? null,
    monto: num(recibido?.[2]),
    conceptos,
    total: num(total),
    balance: num(seccion.match(new RegExp(`Balance\\s*\\$\\s*:\\s*(${MONEY})`))?.[1]),
    formas: formasDePago(lineas),
    facturas_pagadas: facturasPagadas(lineas),
  };
}

export const esReciboDga = (text: string) => /Recibo No\./i.test(text) && /COMPROBANTE DE PAGO/i.test(text);

const plano = (t: string) => t.replace(/\s+/g, " ");

/**
 * Solo lectura: montos de la Liquidación con su parte ya pagada y el saldo real, para comparar
 * el recibo contra lo que quedaba por pagar y no contra el monto bruto.
 */
export function leerBalanceLiquidacion(text: string): BalanceLiquidacion | null {
  if (typeof text !== "string" || !/Reporte de Liquidaci[oó]n de Impuestos/i.test(text)) return null;
  const p = plano(text);
  const d = (re: RegExp) => num(p.match(re)?.[1]);
  const fila = text.match(/(?:^|\n)[ \t]*Totales[ \t]+([0-9.,\s]+?)[ \t]*$/m)?.[1];
  const celdas = fila ? [...fila.matchAll(new RegExp(MONEY, "g"))].map((m) => num(m[0])) : [];
  const cinco = celdas.length === 5;
  return {
    numero: p.match(/Liquidaci[oó]n\s*:\s*([0-9A-Z]{5}-CL\d{2}-[0-9A-Z-]+)/i)?.[1] ?? null,
    gravamen: cinco ? celdas[1] : null,
    selectivo: cinco ? celdas[2] : null,
    itbis: cinco ? celdas[3] : null,
    servicio: d(new RegExp(`Tasa Servicio Aduanero(?! Pagado)\\s*:\\s*\\$\\s*(${MONEY})`)),
    servicio_pagado: d(new RegExp(`Tasa Servicio Aduanero Pagado\\s*:\\s*\\$\\s*(${MONEY})`)),
    dua: d(new RegExp(`Declaraci[oó]n Unica Aduanera(?! Pagado)\\s*:\\s*\\$\\s*(${MONEY})`)),
    dua_pagado: d(new RegExp(`Declaraci[oó]n Unica Aduanera Pagado\\s*:\\s*\\$\\s*(${MONEY})`)),
    recargo: d(new RegExp(`Recargo Por Declaraci[oó]n Tard[ií]a\\s*:\\s*\\$\\s*(${MONEY})`)),
    multa: d(new RegExp(`Multa por Infracci[oó]n\\s*:\\s*\\$\\s*(${MONEY})`)),
    interes: d(new RegExp(`Inter[eé]s por Mora\\s*:\\s*\\$\\s*(${MONEY})`)),
    sancion: d(new RegExp(`Sanci[oó]n por Infracci[oó]n\\s*:\\s*\\$\\s*(${MONEY})`)),
    impuestos: d(new RegExp(`Total Impuestos a Pagar\\s*:\\s*\\$\\s*(${MONEY})`)),
    impuestos_pagado: d(new RegExp(`Total Impuestos Pagado\\s*:\\s*\\$\\s*(${MONEY})`)),
    balance_impuestos: d(new RegExp(`Balance a Pagar de Impuestos\\s*:\\s*\\$\\s*(${MONEY})`)),
    balance_servicio:
      d(new RegExp(`Balance a Pagar por Servicio Aduanero\\s*:\\s*\\$\\s*(${MONEY})`)) ??
      d(new RegExp(`Balance a Pagar por Servicio.{0,90}?Aduanero\\s*:\\s*\\$\\s*(${MONEY})`)),
    fecha_declaracion: isoFechaRecibo(p.match(/Fecha Decl\.\s*:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1]),
    importador: p.match(/Importador\s*:\s*([^|]+?)(?=\s+\S+\s*:|\s*\||$)/i)?.[1]?.trim() ?? null,
  };
}

export type EstadoFila = "ok" | "difiere" | "parcial" | "sin_datos";
export type FilaValidacion = {
  clave: string;
  etiqueta: string;
  recibo: number | null;
  liquidacion: number | null;
  estado: EstadoFila;
  diferencia: number | null;
};
export type ValidacionRecibo = {
  filas: FilaValidacion[];
  emparejadas: string[];
  sin_emparejar: string[];
  total_recibo: number | null;
  total_liquidacion: number | null;
  estado: "ok" | "difiere" | "sin_emparejar" | "sin_datos";
  avisos: string[];
};

const mismo = (a: number | null, b: number | null) => a != null && b != null && Math.round(a * 100) === Math.round(b * 100);
const suma = (vals: (number | null)[]): number | null =>
  vals.some((v) => v == null) ? null : vals.reduce<number>((acc, v) => acc + (v ?? 0), 0);
const money = (v: number | null) => (v == null ? "—" : `RD$${v.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function fila(clave: string, etiqueta: string, recibo: number | null, liquidacion: number | null, parcial = false): FilaValidacion {
  if (recibo == null && liquidacion == null) return { clave, etiqueta, recibo, liquidacion, estado: "sin_datos", diferencia: null };
  if (liquidacion == null) return { clave, etiqueta, recibo, liquidacion, estado: "sin_datos", diferencia: null };
  if (mismo(recibo, liquidacion)) return { clave, etiqueta, recibo, liquidacion, estado: parcial ? "parcial" : "ok", diferencia: 0 };
  return { clave, etiqueta, recibo, liquidacion, estado: "difiere", diferencia: (recibo ?? 0) - liquidacion };
}

/**
 * Compara el recibo con la Liquidación del Expediente. El emparejamiento es solo por el número
 * de liquidación que el recibo lista en «FACTURAS PAGADAS»; sin coincidencia no se compara nada.
 */
export function validarReciboDga(recibo: ReciboDga, liquidaciones: BalanceLiquidacion[]): ValidacionRecibo {
  const avisos: string[] = [];
  const clave = (n: string | null) => (n ?? "").toUpperCase().replace(/\s+/g, "");
  const emparejadas = liquidaciones.filter((l) => l.numero && recibo.facturas_pagadas.some((f) => clave(f) === clave(l.numero)));
  const sin_emparejar = recibo.facturas_pagadas.filter((f) => !liquidaciones.some((l) => clave(l.numero) === clave(f)));
  const total_liquidacion = emparejadas.length
    ? suma(emparejadas.map((l) => (l.balance_impuestos == null && l.balance_servicio == null ? null : (l.balance_impuestos ?? 0) + (l.balance_servicio ?? 0))))
    : null;
  const impuestos_pagados = emparejadas.some((l) => (l.impuestos_pagado ?? 0) > 0);
  const filas: FilaValidacion[] = [
    fila("servicio", "Tasa por Servicio Aduanero", recibo.conceptos.servicio, emparejadas.length ? suma(emparejadas.map((l) => (l.servicio == null && l.servicio_pagado == null ? null : (l.servicio ?? 0) - (l.servicio_pagado ?? 0)))) : null),
    fila("arancel", "Impuestos Arancelarios", recibo.conceptos.arancel, emparejadas.length ? suma(emparejadas.map((l) => l.gravamen)) : null, impuestos_pagados),
    fila("itbis", "ITBIS", recibo.conceptos.itbis, emparejadas.length ? suma(emparejadas.map((l) => l.itbis)) : null, impuestos_pagados),
    fila("declaracion_valor", "Declaración del Valor", recibo.conceptos.declaracion_valor, null),
    fila("dua", "Declaración Única Aduanera (DUA)", recibo.conceptos.dua, emparejadas.length ? suma(emparejadas.map((l) => (l.dua == null && l.dua_pagado == null ? null : (l.dua ?? 0) - (l.dua_pagado ?? 0)))) : null),
    fila("recargo", "Recargo Art. 374", recibo.conceptos.recargo, emparejadas.length ? suma(emparejadas.map((l) => l.recargo)) : null),
    fila("total", "TOTAL", recibo.total, total_liquidacion),
  ];
  if (!emparejadas.length) avisos.push("El recibo no coincide con la Liquidación guardada en este Expediente.");
  if (sin_emparejar.length) avisos.push(`Facturas del recibo no registradas en el Expediente: ${sin_emparejar.join(", ")}.`);
  if (impuestos_pagados) avisos.push("La Liquidación registra impuestos pagados anteriores; la comparación de impuestos es parcial.");
  if ((recibo.balance ?? 0) > 0) avisos.push(`El recibo registra un balance pendiente de ${money(recibo.balance)}: pago parcial.`);
  if (recibo.facturas_pagadas.length > 1) avisos.push(`El recibo paga ${recibo.facturas_pagadas.length} liquidaciones a la vez.`);
  const estado: ValidacionRecibo["estado"] = filas.some((f) => f.estado === "difiere")
    ? "difiere"
    : !emparejadas.length
      ? "sin_emparejar"
      : "ok";
  return { filas, emparejadas: emparejadas.map((l) => l.numero ?? ""), sin_emparejar, total_recibo: recibo.total, total_liquidacion, estado, avisos };
}

/** Solo campos vacíos: lo manual o ya guardado nunca se sobrescribe. */
export function decidirGuardadoRecibo(actual: Record<string, unknown>, recibo: ReciboDga, validacion: ValidacionRecibo) {
  const cambios: Record<string, string | number> = {};
  const avisos: string[] = [...validacion.avisos];
  const completar = (campo: string, valor: string | null | undefined, label: string) => {
    const v = typeof valor === "string" ? valor.trim() : null;
    if (!v) return;
    if (campoDgaVacio(actual[campo])) cambios[campo] = v;
    else if (String(actual[campo]).trim() !== v) avisos.push(`${label}: recibo ${v}; expediente ${actual[campo]}. Se conserva el dato del Expediente.`);
  };
  completar("liq_siga_fecha_pago", recibo.fecha_pago, "Fecha de pago");
  completar("liq_recibo_numero", recibo.recibo, "N.º de recibo");
  completar("liq_recibo_banco", recibo.formas[0]?.banco, "Banco del recibo");
  completar("liq_recibo_transaccion", recibo.formas[0]?.transaccion, "N.º de transacción");
  completar("liq_siga_pin_pago", recibo.formas[0]?.numero_pin, "PIN del recibo");
  // El total oficial del Expediente: solo si está vacío; una diferencia se avisa, no se cambia.
  if (typeof recibo.total === "number") {
    if (campoDgaVacio(actual.liq_oficial_total)) cambios.liq_oficial_total = recibo.total;
    else if (Math.round(Number(actual.liq_oficial_total) * 100) !== Math.round(recibo.total * 100))
      avisos.push(`Total oficial: recibo ${recibo.total}; expediente ${actual.liq_oficial_total}. Se conserva el dato del Expediente.`);
  }
  return { cambios, avisos };
}

/** Informativo: el PIN tiene vencimiento; pagar después se avisa, no se bloquea. */
export function estadoPagoTardio(recibo: ReciboDga, terminoAt: unknown): "a_tiempo" | "tardio" | "sin_dato" {
  if (typeof terminoAt !== "string" || !terminoAt.trim() || !recibo.fecha_pago) return "sin_dato";
  const fin = new Date(terminoAt);
  const pago = new Date(`${recibo.fecha_pago}T${recibo.hora_pago ?? "23:59:59"}-04:00`);
  if (!Number.isFinite(fin.getTime()) || !Number.isFinite(pago.getTime())) return "sin_dato";
  return pago.getTime() > fin.getTime() ? "tardio" : "a_tiempo";
}

export const ETIQUETA_AUTO_RECIBO = "Automático";

/** Lo que queda guardado en `documentos.lectura_recibo` tras leer el comprobante. */
export type LecturaReciboGuardada = {
  archivo: string | null;
  leido_en: string;
  origen: "manual" | "leer_ahora" | "cambio_tipo";
  recibo: ReciboDga | null;
  motivo: string | null;
  validacion: ValidacionRecibo | null;
  completados: string[];
  diferencia_aceptada: { motivo: string; usuario: string; fecha: string } | null;
};

/** Etiqueta «Automático»: el valor del Expediente vino del recibo (o sigue siendo el que puso). */
export function esAutomaticoRecibo(exp: Record<string, unknown> | null | undefined, campo: string, valor?: unknown): boolean {
  const reg = ((exp?.dga_auto ?? {}) as Record<string, unknown>)[campo];
  if (!reg) return false;
  if (valor === undefined) return true;
  const v = (reg as { valor?: unknown }).valor;
  return v == null || String(v) === String(valor);
}
