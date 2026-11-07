/**
 * Ganancia y Descuento por CxC de los viajes de transporte.
 *
 * Usa exactamente el mismo desglose del «Comprobante de solicitud de pago»:
 *   Monto a Facturar = Cantidad de viajes × Precio por viaje
 *   Costo del Viaje  = Monto a Facturar × (1 − % margen)   (o el monto si no hay %)
 *   Ganancia         = Monto a Facturar − Costo del Viaje
 */

export type SolicitudPagoDesglose = {
  cantidad_viajes?: number | string | null;
  precio_viaje?: number | string | null;
  porcentaje_margen?: number | string | null;
  monto?: number | string | null;
  descuento_cxc?: number | string | null;
};

export type DesgloseSolicitudPago = {
  /** null cuando la solicitud no trae cantidad y precio (sin margen calculable). */
  montoFacturar: number | null;
  costoViaje: number;
  ganancia: number | null;
  descuentoCxc: number;
  netoPagar: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const redondear = (n: number) => Math.round(n * 100) / 100;

export function desgloseSolicitudPago(s: SolicitudPagoDesglose): DesgloseSolicitudPago {
  const hayMargen = s.cantidad_viajes != null && s.precio_viaje != null;
  const montoFacturar = hayMargen ? num(s.cantidad_viajes) * num(s.precio_viaje) : null;
  const costoCalc =
    montoFacturar != null && s.porcentaje_margen != null
      ? montoFacturar * (1 - num(s.porcentaje_margen) / 100)
      : null;
  const costoViaje = costoCalc ?? num(s.monto);
  const descuentoCxc = num(s.descuento_cxc);
  return {
    montoFacturar,
    costoViaje,
    ganancia: montoFacturar != null ? redondear(montoFacturar - costoViaje) : null,
    descuentoCxc,
    netoPagar: costoViaje - descuentoCxc,
  };
}

export type SolicitudTransporte = SolicitudPagoDesglose & {
  id: string;
  transporte_id?: string | null;
  estado?: string | null;
  moneda?: string | null;
};

export type TransporteRef = {
  id: string;
  solicitud_pago_id?: string | null;
  created_at?: string | null;
};

export type GananciaTransporte = {
  /** null si ninguna solicitud del viaje permite calcular la ganancia. */
  ganancia: number | null;
  descuentoCxc: number;
  /** Monto a Facturar al Cliente (cantidad × precio por viaje); null si ninguna solicitud lo trae. */
  montoFacturar: number | null;
  /** Monto Neto a Pagar al transportista (Costo del Viaje − Descuento CxC), igual que el comprobante. */
  netoPagar: number;
  moneda: string;
  solicitudes: number;
};

/**
 * Suma ganancia y descuento por viaje. Cada solicitud pertenece a su
 * `transporte_id` (prevalece, igual que en el comprobante); solo si no lo
 * tiene se asigna al primer transporte creado que la referencia. Las
 * solicitudes anuladas no cuentan.
 */
export function gananciaPorTransporte(
  transportes: TransporteRef[],
  solicitudes: SolicitudTransporte[],
): Map<string, GananciaTransporte> {
  const existentes = new Set(transportes.map((t) => t.id));
  const primeroPorSolicitud = new Map<string, TransporteRef>();
  for (const t of transportes) {
    if (!t.solicitud_pago_id) continue;
    const previo = primeroPorSolicitud.get(t.solicitud_pago_id);
    if (!previo || String(t.created_at ?? "") < String(previo.created_at ?? "")) {
      primeroPorSolicitud.set(t.solicitud_pago_id, t);
    }
  }

  const res = new Map<string, GananciaTransporte>();
  for (const s of solicitudes) {
    if (s.estado === "anulada") continue;
    const destino = s.transporte_id ?? primeroPorSolicitud.get(s.id)?.id ?? null;
    if (!destino || !existentes.has(destino)) continue;
    const d = desgloseSolicitudPago(s);
    const acc = res.get(destino) ?? { ganancia: null, montoFacturar: null, descuentoCxc: 0, netoPagar: 0, moneda: s.moneda || "DOP", solicitudes: 0 };
    if (d.montoFacturar != null) acc.montoFacturar = redondear((acc.montoFacturar ?? 0) + d.montoFacturar);
    if (d.ganancia != null) acc.ganancia = redondear((acc.ganancia ?? 0) + d.ganancia);
    acc.descuentoCxc = redondear(acc.descuentoCxc + d.descuentoCxc);
    acc.netoPagar = redondear(acc.netoPagar + d.netoPagar);
    acc.solicitudes += 1;
    res.set(destino, acc);
  }
  return res;
}

/** Totales por moneda (para la fila de totales del listado). */
export function totalesGananciaPorMoneda(valores: Iterable<GananciaTransporte | undefined>) {
  const totales = new Map<string, { ganancia: number; descuentoCxc: number }>();
  for (const v of valores) {
    if (!v) continue;
    const t = totales.get(v.moneda) ?? { ganancia: 0, descuentoCxc: 0 };
    t.ganancia = redondear(t.ganancia + (v.ganancia ?? 0));
    t.descuentoCxc = redondear(t.descuentoCxc + v.descuentoCxc);
    totales.set(v.moneda, t);
  }
  return totales;
}

export type TotalesPeriodoTransportes = { flete: number; pagado: number; ganancia: number; descuentoCxc: number };

/**
 * Totales del período por moneda para los recuadros y la fila final:
 * Flete (Monto a Facturar al Cliente), Total Pagado (Monto Neto a Pagar),
 * Ganancia y Descuento CxC, todos del desglose de las solicitudes de pago
 * (igual que el comprobante), en la moneda de la solicitud.
 * Siempre devuelve al menos DOP para que los recuadros muestren 0.
 */
export function totalesPeriodoTransportes(
  viajes: { id: string }[],
  ganancias: Map<string, GananciaTransporte>,
): [string, TotalesPeriodoTransportes][] {
  const totales = new Map<string, TotalesPeriodoTransportes>();
  const de = (m: string) => {
    let t = totales.get(m);
    if (!t) { t = { flete: 0, pagado: 0, ganancia: 0, descuentoCxc: 0 }; totales.set(m, t); }
    return t;
  };
  for (const v of viajes) {
    const g = ganancias.get(v.id);
    if (g) {
      const t = de(g.moneda);
      t.flete = redondear(t.flete + (g.montoFacturar ?? 0));
      t.pagado = redondear(t.pagado + g.netoPagar);
      t.ganancia = redondear(t.ganancia + (g.ganancia ?? 0));
      t.descuentoCxc = redondear(t.descuentoCxc + g.descuentoCxc);
    }
  }
  if (totales.size === 0) de("DOP");
  const peso = (m: string) => (m === "DOP" ? 0 : m === "USD" ? 1 : 2);
  return [...totales.entries()].sort((a, b) => peso(a[0]) - peso(b[0]) || a[0].localeCompare(b[0]));
}

// ---------- Período (Semana / Mes / Año) ----------

export type ModoPeriodo = "todo" | "semana" | "mes" | "anio";

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export function lunesDe(d: Date) {
  const x = new Date(d);
  const dia = x.getDay();
  x.setHours(0, 0, 0, 0);
  return addDays(x, dia === 0 ? -6 : 1 - dia);
}
export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Rango inclusivo [desde, hasta] en formato YYYY-MM-DD, o null para «Todo». */
export function rangoPeriodo(modo: ModoPeriodo, ancla: Date): { desde: string; hasta: string } | null {
  if (modo === "todo") return null;
  if (modo === "semana") {
    const l = lunesDe(ancla);
    return { desde: isoLocal(l), hasta: isoLocal(addDays(l, 6)) };
  }
  if (modo === "mes") {
    return {
      desde: isoLocal(new Date(ancla.getFullYear(), ancla.getMonth(), 1)),
      hasta: isoLocal(new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0)),
    };
  }
  return { desde: `${ancla.getFullYear()}-01-01`, hasta: `${ancla.getFullYear()}-12-31` };
}

export function moverPeriodo(modo: ModoPeriodo, ancla: Date, delta: number): Date {
  if (modo === "semana") return addDays(lunesDe(ancla), delta * 7);
  if (modo === "mes") return new Date(ancla.getFullYear(), ancla.getMonth() + delta, 1);
  if (modo === "anio") return new Date(ancla.getFullYear() + delta, 0, 1);
  return ancla;
}

/** Fecha del viaje para el período: Salida; si falta, la fecha de creación (hora de Santo Domingo). */
export function fechaViajePeriodo(t: { fecha_salida?: string | null; created_at?: string | null }): string {
  if (t.fecha_salida) return String(t.fecha_salida).slice(0, 10);
  if (!t.created_at) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t.created_at));
}
