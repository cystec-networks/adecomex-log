/**
 * Estado «Completado»: requisitos de cierre, línea de tiempo y bloqueo de datos.
 * Las reglas que bloquean deben coincidir con `pendientes_cierre_desde_hechos` (SQL),
 * que es la que hace cumplir el cierre en la base de datos.
 */

/** El saldo cobrado solo se exige en facturas emitidas desde esta fecha (inclusive). */
export const FECHA_CORTE_COBRO = "2026-11-01";
export const ROLES_COMPLETAR = ["admin", "operaciones", "finanzas"] as const;
export const ROLES_REABRIR = ["admin"] as const;
export const ESTADO_COMPLETADO = "completado";
const TOLERANCIA_COBRO = 0.01;

export const puedeCompletar = (roles: readonly string[] | null | undefined) =>
  (roles ?? []).some((r) => (ROLES_COMPLETAR as readonly string[]).includes(r));
export const puedeReabrir = (roles: readonly string[] | null | undefined) =>
  (roles ?? []).some((r) => (ROLES_REABRIR as readonly string[]).includes(r));

export type FacturaCierre = { id: string; encf?: string | null; emision?: string | null; vencimiento?: string | null; monto: number; pagado: number };
export type HitoPendienteCierre = { id: string; codigo: string; nombre: string; estado?: string };
export type TransporteCierre = { id: string; numero?: string | null; estado?: string | null; solicitud_pago_id?: string | null; conciliado?: boolean };
export type FechasCierre = {
  llegada?: string | null; presentado?: string | null; aprobacion?: string | null; despacho_siga?: string | null;
  despachado?: string | null; entregado?: string | null; facturado?: string | null; retiro?: string | null; cobro?: string | null;
};
export type HechosCierre = {
  estado?: string;
  docs: { factura: boolean; bl: boolean; dua: boolean; liquidacion: boolean };
  numero_igra?: string | null;
  fecha_aprobacion_despacho?: string | null;
  factura_ecf_id?: string | null;
  siga_cargado?: boolean;
  siga_despacho_completo?: boolean;
  facturas: FacturaCierre[];
  hitos_pendientes: HitoPendienteCierre[];
  transportes: TransporteCierre[];
  incidencias_abiertas: number;
  fechas: FechasCierre;
};

export type FichaCierre = "docs" | "info" | "cost" | "checklist" | "transportes" | "inc";
/** «aviso»: no impide completar, pero hay algo que revisar (se muestra en ámbar). */
export type EstadoRequisito = "ok" | "falta" | "na" | "aviso";
export type RequisitoCierre = { clave: string; titulo: string; estado: EstadoRequisito; detalle: string; ficha: FichaCierre; pendientes: string[] };
export type EvaluacionCierre = {
  requisitos: RequisitoCierre[];
  /** Todos los avisos (confirmación, lote y foto del cierre). */
  avisos: string[];
  /** Avisos que no se ven ya en una fila de requisito en ámbar (para no repetirlos en el panel). */
  avisosSueltos: string[];
  pendientes: string[]; listo: boolean;
};

const soloFecha = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

/** ¿La factura exige estar cobrada? Solo si se emitió desde la fecha de corte. */
export const facturaExigeCobro = (f: Pick<FacturaCierre, "emision">) => {
  const d = soloFecha(f.emision);
  return !!d && d >= FECHA_CORTE_COBRO;
};
export const facturaCobrada = (f: Pick<FacturaCierre, "monto" | "pagado">) =>
  Number(f.pagado ?? 0) >= Number(f.monto ?? 0) - TOLERANCIA_COBRO;
export const saldoFactura = (f: Pick<FacturaCierre, "monto" | "pagado">) =>
  Math.max(0, Math.round((Number(f.monto ?? 0) - Number(f.pagado ?? 0)) * 100) / 100);
/** Mora: misma regla que las alertas del Expediente (vencida y sin ningún pago registrado). */
export const facturaEnMora = (f: Pick<FacturaCierre, "monto" | "pagado" | "vencimiento">, hoy: string) => {
  const v = soloFecha(f.vencimiento);
  return !!v && v < hoy && Number(f.monto ?? 0) > 0 && Number(f.pagado ?? 0) <= 0;
};
export const fmtRD = (n: number) =>
  `RD$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtFechaCorta = (iso: string) => iso.split("-").reverse().join("/");
/** Hoy en Santo Domingo (AAAA-MM-DD). */
const hoySantoDomingo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());

export function evaluarCierre(h: HechosCierre, opciones: { omitirChecklist?: boolean; hoy?: string } = {}): EvaluacionCierre {
  const hoy = opciones.hoy ?? hoySantoDomingo();
  const req: RequisitoCierre[] = [];
  const avisos: string[] = [];

  const faltan = [
    !h.docs?.factura && "Factura comercial",
    !h.docs?.bl && "BL / Guía aérea",
    !h.docs?.dua && "DUA",
    !h.docs?.liquidacion && "Liquidación de Impuestos",
  ].filter(Boolean) as string[];
  req.push({
    clave: "documentos", titulo: "Documentos (Factura comercial, BL, DUA y Liquidación)", ficha: "docs",
    estado: faltan.length ? "falta" : "ok",
    detalle: faltan.length ? `Faltan: ${faltan.join(", ")}` : "Los cuatro recibidos con su archivo",
    pendientes: faltan.length ? [`Documentos faltantes: ${faltan.join(", ")}`] : [],
  });

  const despachoOk = !!(h.numero_igra && String(h.numero_igra).trim()) && !!h.fecha_aprobacion_despacho;
  req.push({
    clave: "despacho", titulo: "Despacho completo", ficha: "info",
    estado: despachoOk ? "ok" : "falta",
    detalle: despachoOk ? `N.º de despacho ${h.numero_igra}, aprobado` : "Falta el N.º de despacho o su fecha de aprobación",
    pendientes: despachoOk ? [] : ["Despacho completo: falta el N.º de despacho o su fecha de aprobación"],
  });
  if (!h.siga_cargado) avisos.push("No hay Seguimiento SIGA cargado: el despacho completo se toma del N.º de despacho y su fecha de aprobación.");
  else if (!h.siga_despacho_completo) avisos.push("El Seguimiento SIGA cargado no dice «Despacho completo».");

  req.push({
    clave: "factura", titulo: "Factura e-CF emitida", ficha: "cost",
    estado: h.factura_ecf_id ? "ok" : "falta",
    detalle: h.factura_ecf_id ? "Vinculada" : "No hay factura e-CF vinculada",
    pendientes: h.factura_ecf_id ? [] : ["No hay factura e-CF vinculada"],
  });

  const exigibles = (h.facturas ?? []).filter(facturaExigeCobro);
  const sinCobrar = exigibles.filter((f) => !facturaCobrada(f));
  // Facturas anteriores al corte: no impiden completar, pero su saldo se advierte (sigue en Cuentas por Cobrar).
  const anterioresConSaldo = (h.facturas ?? []).filter((f) => !facturaExigeCobro(f) && !facturaCobrada(f));
  const saldoAnterior = anterioresConSaldo.reduce((t, f) => t + saldoFactura(f), 0);
  const enMoraAnterior = anterioresConSaldo.filter((f) => facturaEnMora(f, hoy)).length;
  const corte = fmtFechaCorta(FECHA_CORTE_COBRO);
  const textoAnterior = anterioresConSaldo.length
    ? `Saldo pendiente ${fmtRD(saldoAnterior)} en ${anterioresConSaldo.length} factura(s) anterior(es) al ${corte}${enMoraAnterior ? ` · ${enMoraAnterior} en mora` : ""}`
    : "";
  req.push({
    clave: "cobro", titulo: "Saldo cobrado", ficha: "cost",
    estado: sinCobrar.length ? "falta" : anterioresConSaldo.length ? "aviso" : exigibles.length === 0 ? "na" : "ok",
    detalle: sinCobrar.length
      ? `Saldo pendiente ${fmtRD(sinCobrar.reduce((t, f) => t + saldoFactura(f), 0))} en ${sinCobrar.length} factura(s)${textoAnterior ? ` · ${textoAnterior}` : ""}`
      : anterioresConSaldo.length ? `${textoAnterior}. No impide completar; sigue en Cuentas por Cobrar.`
      : (h.facturas ?? []).length === 0 ? "No aplica: sin facturas e-CF"
      : exigibles.length === 0 ? `No aplica: facturas anteriores al ${corte} sin saldo pendiente` : "Cobrado",
    pendientes: sinCobrar.map((f) => `Saldo sin cobrar en factura ${f.encf ?? `emitida el ${soloFecha(f.emision)}`}`),
  });
  const avisoCobro = anterioresConSaldo.length ? `${textoAnterior}: no impide completar y sigue en Cuentas por Cobrar y en las alertas de mora.` : null;
  if (avisoCobro) avisos.push(avisoCobro);

  const nHitos = (h.hitos_pendientes ?? []).length;
  req.push({
    clave: "checklist", titulo: "Checklist completo o «No aplica»", ficha: "checklist",
    estado: nHitos ? "falta" : "ok",
    detalle: nHitos ? `${nHitos} paso(s) pendiente(s): ${h.hitos_pendientes.map((x) => x.nombre).join(", ")}` : "Completo",
    pendientes: nHitos && !opciones.omitirChecklist ? [`Checklist incompleto: ${nHitos} paso(s) pendiente(s)`] : [],
  });

  const viajes = h.transportes ?? [];
  const sinEntregar = viajes.filter((t) => !["entregado", "facturado"].includes(String(t.estado ?? "")));
  req.push({
    clave: "viajes", titulo: "Viajes entregados", ficha: "transportes",
    estado: viajes.length === 0 ? "na" : sinEntregar.length ? "falta" : "ok",
    detalle: viajes.length === 0 ? "Sin viajes" : sinEntregar.length ? `${sinEntregar.length} sin entregar` : `${viajes.length} entregado(s)`,
    pendientes: sinEntregar.map((t) => `Viaje ${t.numero ?? ""} sin entregar`),
  });
  const sinPago = viajes.filter((t) => !t.solicitud_pago_id);
  req.push({
    clave: "pago_transporte", titulo: "Pago de transporte registrado", ficha: "transportes",
    estado: viajes.length === 0 ? "na" : sinPago.length ? "falta" : "ok",
    detalle: viajes.length === 0 ? "Sin viajes" : sinPago.length ? `${sinPago.length} viaje(s) sin solicitud de pago` : "Registrado",
    pendientes: sinPago.map((t) => `Viaje ${t.numero ?? ""} sin pago de transporte registrado`),
  });
  const noConciliados = viajes.filter((t) => t.solicitud_pago_id && !t.conciliado);
  if (noConciliados.length) avisos.push(`${noConciliados.length} pago(s) de transporte sin conciliar en el Diario.`);

  const inc = Number(h.incidencias_abiertas ?? 0);
  req.push({
    clave: "incidencias", titulo: "Sin incidencias abiertas", ficha: "inc",
    estado: inc > 0 ? "falta" : "ok",
    detalle: inc > 0 ? `${inc} abierta(s)` : "Ninguna abierta",
    pendientes: inc > 0 ? [`${inc} incidencia(s) abierta(s)`] : [],
  });

  // Mismo orden que la función SQL.
  const orden = ["documentos", "despacho", "factura", "cobro", "checklist", "viajes", "pago_transporte", "incidencias"];
  const pendientes = orden.flatMap((c) => {
    const r = req.find((x) => x.clave === c)!;
    if (c === "viajes") {
      // SQL intercala por viaje: sin entregar y sin pago.
      return viajes.flatMap((t) => [
        ...(!["entregado", "facturado"].includes(String(t.estado ?? "")) ? [`Viaje ${t.numero ?? ""} sin entregar`] : []),
        ...(!t.solicitud_pago_id ? [`Viaje ${t.numero ?? ""} sin pago de transporte registrado`] : []),
      ]);
    }
    if (c === "pago_transporte") return [];
    return r.pendientes;
  });
  return { requisitos: req, avisos, avisosSueltos: avisos.filter((a) => a !== avisoCobro), pendientes, listo: pendientes.length === 0 };
}

const diasEntre = (a?: string | null, b?: string | null): number | null => {
  const x = soloFecha(a); const y = soloFecha(b);
  if (!x || !y) return null;
  const ms = Date.parse(`${y}T00:00:00Z`) - Date.parse(`${x}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
};

export type HitoLinea = { clave: string; titulo: string; fecha: string | null };
export type LineaTiempoCierre = {
  hitos: HitoLinea[];
  /** Fechas incoherentes que conviene revisar (las líneas guardadas antes pueden no traerlo). */
  avisos?: string[];
  dias: { llegada_despacho: number | null; despacho_entrega: number | null; almacenaje: number | null };
};

/** Línea de tiempo del cierre. Una fecha ausente queda en null («sin dato»): nunca se inventa. */
export function lineaTiempoCierre(f: FechasCierre): LineaTiempoCierre {
  const despacho = soloFecha(f.despacho_siga) ?? soloFecha(f.aprobacion) ?? soloFecha(f.despachado);
  const retiro = soloFecha(f.retiro) ?? soloFecha(f.entregado);
  const llegada = soloFecha(f.llegada); const presentado = soloFecha(f.presentado);
  const avisos: string[] = [];
  if (llegada && presentado && presentado < llegada) {
    avisos.push(`La DUA presentada (${fmtFechaCorta(presentado)}) es anterior a la llegada real (${fmtFechaCorta(llegada)}); revísala.`);
  }
  return {
    avisos,
    hitos: [
      { clave: "llegada", titulo: "Llegada", fecha: soloFecha(f.llegada) },
      { clave: "presentado", titulo: "DUA presentada", fecha: soloFecha(f.presentado) },
      { clave: "aprobacion", titulo: "DUA aprobada", fecha: soloFecha(f.aprobacion) },
      { clave: "despacho", titulo: "Despacho completo", fecha: despacho },
      { clave: "entregado", titulo: "Entrega", fecha: soloFecha(f.entregado) },
      { clave: "facturado", titulo: "Facturación", fecha: soloFecha(f.facturado) },
      { clave: "cobro", titulo: "Último cobro", fecha: soloFecha(f.cobro) },
    ],
    dias: {
      llegada_despacho: diasEntre(f.llegada, despacho),
      despacho_entrega: diasEntre(despacho, f.entregado),
      almacenaje: diasEntre(f.llegada, retiro),
    },
  };
}

/** Foto que se guarda al completar. */
export const snapshotCierre = (h: HechosCierre) => {
  const ev = evaluarCierre(h);
  return { linea_tiempo: lineaTiempoCierre(h.fechas ?? {}), avisos: ev.avisos };
};

/** Campos del Expediente que quedan bloqueados en Completado (mismo patrón que el trigger). */
export const PATRON_CAMPO_BLOQUEADO =
  /^(numero_dua|numero_igra|regimen_aduanero|cliente_id|factura_ecf_id|bl_awb|tasa_cambio_usada|tasa_cambio_congelada|liq_oficial_total|total_fob|total_cif|seguro|flete|otros|peso_neto|peso_bruto|cierre_snapshot|liq_siga_.*|pin_.*|fecha_.*)$/;

const vacio = (v: unknown) => v === null || v === undefined || v === "";
const conHora = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const igual = (a: unknown, b: unknown) => {
  if (vacio(a) && vacio(b)) return true;
  if (vacio(a) !== vacio(b)) return false;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  // Fechas con hora: el formulario guarda al minuto; mismo instante al minuto = sin cambio.
  if (conHora(a) && conHora(b)) return Math.floor(Date.parse(String(a)) / 60_000) === Math.floor(Date.parse(String(b)) / 60_000);
  return String(a).trim() === String(b).trim();
};

/** Campos ya guardados que el cambio alteraría (vacío → valor está permitido). */
export function camposBloqueadosCambiados(original: Record<string, unknown>, cambios: Record<string, unknown>): string[] {
  return Object.keys(cambios).filter((k) =>
    PATRON_CAMPO_BLOQUEADO.test(k) && k in original && !vacio(original[k]) && !igual(original[k], cambios[k]));
}

/**
 * Prepara el guardado de un Expediente Completado: falla si cambia un dato bloqueado y
 * quita del envío los datos bloqueados ya guardados (sin cambio), para no reescribirlos.
 */
export function payloadGuardadoCompletado<T extends Record<string, unknown>>(original: Record<string, unknown>, payload: T): T {
  const bloqueados = camposBloqueadosCambiados(original, payload);
  if (bloqueados.length) {
    throw new Error(`Expediente Completado: no se pueden cambiar datos ya guardados (${bloqueados.join(", ")}). Un Administrador debe reabrirlo.`);
  }
  const limpio: Record<string, unknown> = { ...payload };
  for (const k of Object.keys(limpio)) if (PATRON_CAMPO_BLOQUEADO.test(k) && k in original && !vacio(original[k])) delete limpio[k];
  return limpio as T;
}

