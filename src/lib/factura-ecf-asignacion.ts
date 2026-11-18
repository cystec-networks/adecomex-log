/**
 * Reparto de una Factura e-CF entre Expedientes y Transportes (TR-…), por renglón.
 *
 * Reglas (Francisco López, 17/11/2026):
 * - Cada renglón tiene un tipo: Gestión aduanal, Transporte, Reembolso u Otros.
 * - A un Transporte solo se le asignan renglones de Transporte; nunca gestión aduanal.
 *   Gestión aduanal, Reembolso y Otros van siempre a un Expediente.
 * - Los montos asignados deben cubrir exactamente cada renglón y sumar exactamente el total.
 * - Alerta (no bloqueo) cuando lo asignado a un destino difiere más del 20 % del esperado.
 * - Candidatos: solo renglones de transporte → Transportes primero; con gestión → Expedientes primero.
 * - Nunca se ofrecen Expedientes Completados.
 */

export type TipoConcepto = "gestion_aduanal" | "transporte" | "reembolso" | "otros";

export const TIPOS_CONCEPTO: { value: TipoConcepto; label: string }[] = [
  { value: "gestion_aduanal", label: "Gestión aduanal" },
  { value: "transporte", label: "Transporte" },
  { value: "reembolso", label: "Reembolso" },
  { value: "otros", label: "Otros" },
];

export const UMBRAL_ALERTA_MONTO = 0.2;

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;
const centavos = (n: number) => Math.round(n * 100);

/** Tipo sugerido por la descripción del renglón (el usuario siempre puede cambiarlo). */
export function tipoConceptoSugerido(descripcion: string | null | undefined): TipoConcepto {
  const s = normalizar(descripcion ?? "");
  if (/reembolso/.test(s)) return "reembolso";
  if (/transporte|flete|retorno|demora/.test(s)) return "transporte";
  if (/gestion|aduanal|vuce|honorario/.test(s)) return "gestion_aduanal";
  return "otros";
}

/** Destino como texto compacto: `exp:<uuid>` o `tr:<uuid>`. */
export type ClaveDestino = `exp:${string}` | `tr:${string}`;
export const claveDestino = (d: { expediente_id?: string | null; transporte_id?: string | null }): ClaveDestino | null =>
  d.expediente_id ? `exp:${d.expediente_id}` : d.transporte_id ? `tr:${d.transporte_id}` : null;
export const esTransporte = (clave: string) => clave.startsWith("tr:");
export const idDestino = (clave: string) => clave.slice(clave.indexOf(":") + 1);

/** Un destino puede recibir un renglón según su tipo. */
export function destinoPermitido(tipo: TipoConcepto, clave: string) {
  return esTransporte(clave) ? tipo === "transporte" : true;
}

export type RenglonReparto = { importe: number; tipo: TipoConcepto; orden?: number; descripcion?: string };
export type FilaAsignacion = { linea: number; destino: string; monto: number; origen?: "manual" | "escaneo" | "migrado" };

export type ResultadoValidacion = {
  /** Sin ninguna asignación: la factura queda «Sin vincular». */
  vacia: boolean;
  valida: boolean;
  errores: string[];
  asignado: number;
  /** Diferencia (total − asignado); positiva = falta asignar. */
  diferencia: number;
  porLinea: { asignado: number; diferencia: number }[];
};

export function validarAsignaciones(renglones: readonly RenglonReparto[], filas: readonly FilaAsignacion[], total: number): ResultadoValidacion {
  const conDestino = filas.filter((f) => f.destino);
  const errores: string[] = [];
  const porLinea = renglones.map(() => ({ asignado: 0, diferencia: 0 }));
  for (const f of conDestino) {
    const r = renglones[f.linea];
    if (!r) continue;
    porLinea[f.linea].asignado = r2(porLinea[f.linea].asignado + (Number(f.monto) || 0));
    if (!(Number(f.monto) > 0)) errores.push(`Renglón ${f.linea + 1}: el monto asignado debe ser mayor que cero.`);
    if (!destinoPermitido(r.tipo, f.destino)) {
      errores.push(`Renglón ${f.linea + 1}: es ${etiquetaTipo(r.tipo)}; a un Transporte solo se le asignan renglones de transporte.`);
    }
  }
  const asignado = r2(porLinea.reduce((a, p) => a + p.asignado, 0));
  if (!conDestino.length) {
    return { vacia: true, valida: true, errores: [], asignado: 0, diferencia: r2(total), porLinea: porLinea.map((p, i) => ({ ...p, diferencia: r2(renglones[i].importe) })) };
  }
  renglones.forEach((r, i) => {
    porLinea[i].diferencia = r2(r.importe - porLinea[i].asignado);
    if (centavos(r.importe) !== centavos(porLinea[i].asignado)) {
      errores.push(porLinea[i].asignado === 0
        ? `Renglón ${i + 1}: falta elegir su destino.`
        : `Renglón ${i + 1}: lo asignado (${fmt(porLinea[i].asignado)}) no cubre exactamente su importe (${fmt(r.importe)}).`);
    }
  });
  if (centavos(asignado) !== centavos(total)) errores.push(`Los montos asignados (${fmt(asignado)}) deben sumar exactamente el total de la factura (${fmt(total)}).`);
  const destinos = new Set(conDestino.map((f) => f.destino));
  const soloTransportes = [...destinos].every(esTransporte);
  if (soloTransportes && renglones.some((r) => r.tipo === "gestion_aduanal")) {
    errores.unshift("La factura queda vinculada solo a Transportes pero tiene renglones de Gestión aduanal. Corrige el tipo o asígnalos a un Expediente.");
  }
  return { vacia: false, valida: errores.length === 0, errores: [...new Set(errores)], asignado, diferencia: r2(total - asignado), porLinea };
}

export function etiquetaTipo(t: TipoConcepto) {
  return TIPOS_CONCEPTO.find((x) => x.value === t)?.label ?? t;
}
const fmt = (n: number) => `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Total asignado por destino. */
export function montosPorDestino(filas: readonly FilaAsignacion[]) {
  const m = new Map<string, number>();
  for (const f of filas) if (f.destino) m.set(f.destino, r2((m.get(f.destino) ?? 0) + (Number(f.monto) || 0)));
  return m;
}

/**
 * Reparto automático sin pisar lo elegido: solo completa renglones cuya única fila no tiene destino.
 * Gestión/Reembolso/Otros → el único Expediente elegido; Transporte → el único TR elegido
 * (o el Expediente si no hay TR). Con varios candidatos del mismo tipo no adivina.
 */
export function completarReparto(renglones: readonly RenglonReparto[], filas: readonly FilaAsignacion[], destinos: readonly string[], origen: FilaAsignacion["origen"] = "manual"): FilaAsignacion[] {
  const exps = destinos.filter((d) => !esTransporte(d));
  const trs = destinos.filter(esTransporte);
  const salida: FilaAsignacion[] = [];
  renglones.forEach((r, i) => {
    const propias = filas.filter((f) => f.linea === i);
    if (propias.length > 1 || (propias.length === 1 && propias[0].destino)) { salida.push(...propias); return; }
    let destino = "";
    if (r.tipo === "transporte") destino = trs.length === 1 ? trs[0] : trs.length === 0 && exps.length === 1 ? exps[0] : "";
    else destino = exps.length === 1 ? exps[0] : "";
    salida.push({ linea: i, destino, monto: r2(r.importe), origen: destino ? origen : undefined });
  });
  return salida;
}

/** Une filas repetidas del mismo renglón y destino (la base no admite duplicados). */
export function unirFilas(filas: readonly FilaAsignacion[]): FilaAsignacion[] {
  const m = new Map<string, FilaAsignacion>();
  for (const f of filas) {
    if (!f.destino) continue;
    const k = `${f.linea}|${f.destino}`;
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, monto: r2(prev.monto + (Number(f.monto) || 0)) } : { ...f, monto: r2(Number(f.monto) || 0) });
  }
  return [...m.values()];
}

/** Alerta (no bloqueo) cuando lo asignado difiere más del umbral respecto del esperado. */
export function alertaMonto(asignado: number, esperado: number | null | undefined, umbral = UMBRAL_ALERTA_MONTO) {
  if (esperado == null || !(esperado > 0)) return null;
  const variacion = (asignado - esperado) / esperado;
  return Math.abs(variacion) > umbral + 1e-9 ? { esperado: r2(esperado), variacion } : null;
}

/** Monto esperado de un Transporte: cantidad de viajes × precio por viaje (el Monto a Facturar del comprobante). */
export function montoEsperadoTransporte(t: { cantidad_viajes?: number | string | null; precio_viaje?: number | string | null }) {
  if (t.cantidad_viajes == null || t.precio_viaje == null) return null;
  const v = Number(t.cantidad_viajes) * Number(t.precio_viaje);
  return Number.isFinite(v) && v > 0 ? r2(v) : null;
}

// ───────────────────────── Candidatos ─────────────────────────

export type Pistas = { expedientes: string[]; bl: string[]; contenedores: string[]; transportes: string[] };

export type Candidato = {
  clave: string;
  tipo: "expediente" | "transporte";
  numero: string;
  clienteCoincide: boolean;
  completado?: boolean;
  /** e-NCF de otras facturas ya vinculadas a este destino. */
  facturasOtras: string[];
  bl?: string | null;
  contenedores?: string | null;
  fecha?: string | null;
  esperado?: number | null;
  /** Lo ya facturado al Transporte por otras facturas (para comparar con lo esperado). */
  facturadoOtras?: number;
  expedienteNumero?: string | null;
};

const normRef = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Coincidencia exacta con una referencia escrita en la factura (EXP, TR, BL o contenedor). */
export function coincidenciaReferencia(c: Candidato, p: Pistas): "numero" | "bl" | "contenedor" | null {
  const num = normRef(c.numero);
  if (c.tipo === "expediente" && p.expedientes.some((e) => normRef(e) === num)) return "numero";
  if (c.tipo === "transporte" && p.transportes.some((t) => normRef(t) === num)) return "numero";
  if (c.bl && p.bl.some((b) => normRef(b) && normRef(b) === normRef(c.bl!))) return "bl";
  const conts = normRef(c.contenedores ?? "");
  if (conts && p.contenedores.some((k) => k.length >= 11 && conts.includes(normRef(k)))) return "contenedor";
  return null;
}

const diasEntre = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const d = Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000;
  return Number.isFinite(d) ? d : null;
};

/** ¿Qué lista va primero? Solo transporte → Transportes; con gestión aduanal → Expedientes. */
export function prioridadCandidatos(tipos: readonly TipoConcepto[]): "transporte" | "expediente" {
  return tipos.length > 0 && tipos.every((t) => t === "transporte") ? "transporte" : "expediente";
}

/**
 * Ordena candidatos: referencia exacta, mismo cliente, sin factura, fecha cercana (±30 días).
 * Los Completados se excluyen siempre.
 */
export function ordenarCandidatos(candidatos: readonly Candidato[], pistas: Pistas, fechaFactura: string | null, prioridad: "transporte" | "expediente") {
  return candidatos
    .filter((c) => !c.completado)
    .map((c) => {
      const ref = coincidenciaReferencia(c, pistas);
      const dias = diasEntre(c.fecha, fechaFactura);
      let puntos = 0;
      if (ref === "numero") puntos += 1000; else if (ref) puntos += 600;
      if (c.clienteCoincide) puntos += 300;
      if (c.tipo === prioridad) puntos += 150;
      if (!c.facturasOtras.length) puntos += 100;
      if (dias != null && dias <= 30) puntos += Math.round(80 * (1 - dias / 30));
      return { ...c, referencia: ref, puntos };
    })
    .sort((a, b) => b.puntos - a.puntos || String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")) || a.numero.localeCompare(b.numero));
}

/** Preselección por escaneo: solo coincidencias exactas e inequívocas (una por tipo). */
export function preseleccionEscaneo(ordenados: ReturnType<typeof ordenarCandidatos>) {
  const elegir = (tipo: Candidato["tipo"]) => {
    const exactos = ordenados.filter((c) => c.tipo === tipo && c.referencia && c.clienteCoincide);
    const porNumero = exactos.filter((c) => c.referencia === "numero");
    if (porNumero.length) return porNumero.map((c) => c.clave);
    return exactos.length === 1 ? [exactos[0].clave] : [];
  };
  return [...elegir("expediente"), ...elegir("transporte")];
}

// ───────────────────── Parte asignada (lectores) ─────────────────────

type LineaParte = { id?: string; expediente_id?: string | null; transporte_id?: string | null; valor?: number | string | null; itbis?: number | string | null };
type AsignacionParte = { linea_id?: string | null; expediente_id?: string | null; transporte_id?: string | null; monto: number | string | null };
export type FacturaParte = {
  monto_total?: number | string | null;
  vinculo_por_linea?: boolean | null;
  facturas_ecf_lineas?: readonly LineaParte[] | null;
  facturas_ecf_asignaciones?: readonly AsignacionParte[] | null;
};
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * Parte de la factura que corresponde a un destino. `conItbis=false` devuelve la base sin ITBIS
 * (prorrateada por renglón). `null` = factura antigua sin reparto: cuenta completa.
 */
export function parteAsignada(f: FacturaParte, destino: { expedienteId?: string; transporteId?: string }, conItbis = true): number | null {
  const coincide = (x: { expediente_id?: string | null; transporte_id?: string | null }) =>
    destino.expedienteId ? x.expediente_id === destino.expedienteId : x.transporte_id === destino.transporteId;
  const asig = f.facturas_ecf_asignaciones ?? [];
  if (asig.length) {
    const lineas = new Map((f.facturas_ecf_lineas ?? []).map((l) => [l.id, l]));
    return r2(asig.filter(coincide).reduce((s, a) => {
      if (conItbis) return s + n(a.monto);
      const l = a.linea_id ? lineas.get(a.linea_id) : undefined;
      const imp = l ? n(l.valor) + n(l.itbis) : 0;
      return s + (imp > 0 ? n(a.monto) * n(l!.valor) / imp : n(a.monto));
    }, 0));
  }
  if (f.vinculo_por_linea) {
    return r2((f.facturas_ecf_lineas ?? []).filter(coincide).reduce((s, l) => s + n(l.valor) + (conItbis ? n(l.itbis) : 0), 0));
  }
  return null;
}

// ───────────────────── Estado inicial (editar / Vincular) ─────────────────────

export type LineaGuardada = { id: string; expediente_id?: string | null; transporte_id?: string | null; importe: number; tipo: TipoConcepto };
export type AsignacionGuardada = { linea_id: string; expediente_id?: string | null; transporte_id?: string | null; monto: number | string };

/**
 * Reparto guardado; si la factura es antigua (sin montos asignados) se propone desde sus vínculos
 * anteriores: destino del renglón, Expediente y Transporte vinculados. Nunca inventa un reparto
 * cuando hay varios destinos posibles del mismo tipo.
 */
export function estadoInicialVinculacion(lineas: readonly LineaGuardada[], asignaciones: readonly AsignacionGuardada[], legado: { expedientes: string[]; transportes: string[] }) {
  const indice = new Map(lineas.map((l, i) => [l.id, i]));
  if (asignaciones.length) {
    const filas: FilaAsignacion[] = asignaciones.flatMap((a) => {
      const i = indice.get(a.linea_id);
      const d = claveDestino(a);
      return i == null || !d ? [] : [{ linea: i, destino: d, monto: r2(Number(a.monto) || 0) }];
    });
    const destinos = [...new Set(filas.map((f) => f.destino))];
    return { destinos, filas: completarReparto(lineas, filas, []) };
  }
  const destinos = new Set<string>();
  const base: FilaAsignacion[] = [];
  lineas.forEach((l, i) => {
    const d = claveDestino(l);
    if (d) { destinos.add(d); base.push({ linea: i, destino: d, monto: r2(l.importe), origen: "migrado" }); }
  });
  legado.expedientes.forEach((e) => destinos.add(`exp:${e}`));
  legado.transportes.forEach((t) => destinos.add(`tr:${t}`));
  const lista = [...destinos];
  const exps = lista.filter((d) => !esTransporte(d));
  const trs = lista.filter(esTransporte);
  const filas: FilaAsignacion[] = [];
  lineas.forEach((l, i) => {
    const propias = base.filter((f) => f.linea === i);
    if (propias.length) { filas.push(...propias); return; }
    let destino = "";
    if (l.tipo === "transporte") destino = trs.length === 1 ? trs[0] : trs.length === 0 && exps.length === 1 ? exps[0] : "";
    else destino = exps.length === 1 ? exps[0] : exps.length === 0 && trs.length === 1 ? trs[0] : "";
    filas.push({ linea: i, destino, monto: r2(l.importe), origen: destino ? "migrado" : undefined });
  });
  return { destinos: lista, filas };
}
