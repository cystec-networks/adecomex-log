/**
 * Cálculos del Dashboard de Transportes, alineados con la pantalla «Transportes»:
 * Ingreso = Monto a Facturar al Cliente del comprobante (bruto), Margen = Ganancia
 * del mismo desglose y Neto a pagar = Monto Neto a Pagar.
 */
import type { GananciaTransporte } from "@/lib/transporte-ganancia";

export type EstadoDashboard = "programado" | "en_transito" | "retrasado" | "entregado" | "facturado";
export const ESTADOS_DASHBOARD: { key: EstadoDashboard; label: string }[] = [
  { key: "programado", label: "Programado" },
  { key: "en_transito", label: "En tránsito" },
  { key: "retrasado", label: "Retrasado" },
  { key: "entregado", label: "Entregado" },
  { key: "facturado", label: "Facturado" },
];

export type ViajeDashboard = {
  id: string;
  estado?: string | null;
  factura_ecf_id?: string | null;
  contenedores_cantidad?: number | string | null;
  placa_contenedor?: string | null;
  contenedores_detalle?: string | null;
  pago_estado?: string | null;
};

// Código ISO 6346: 3 letras de propietario + U/J/Z + 6 dígitos + dígito de control.
const RE_CONTENEDOR = /\b([A-Z]{3}[UJZ])[\s-]?(\d{6})[\s-]?(\d)\b/gi;

/**
 * Contenedores del viaje: la «Cant. Contenedores a Facturar» si se escribió;
 * si no, los números de contenedor distintos de «Placa / Contenedor» y del detalle.
 */
export function contarContenedores(t: ViajeDashboard): number {
  const explicito = Number(t.contenedores_cantidad);
  if (Number.isFinite(explicito) && explicito > 0) return Math.round(explicito);
  const codigos = new Set<string>();
  for (const texto of [t.placa_contenedor, t.contenedores_detalle]) {
    for (const m of String(texto ?? "").matchAll(RE_CONTENEDOR)) {
      codigos.add(`${m[1]}${m[2]}${m[3]}`.toUpperCase());
    }
  }
  return codigos.size;
}

/**
 * Estado para el bloque «Estados». Facturado si el estado es «facturado» o tiene
 * al menos una factura e-CF vinculada; así cada viaje cuenta en un solo estado y
 * la suma de los estados coincide con «Viajes».
 */
export function estadoDashboard(t: ViajeDashboard, conFactura: Set<string>): EstadoDashboard {
  if (t.estado === "facturado" || t.factura_ecf_id || conFactura.has(t.id)) return "facturado";
  if (t.estado === "en_transito" || t.estado === "retrasado" || t.estado === "entregado") return t.estado;
  return "programado";
}

export type ResumenTransportes = {
  viajes: number;
  contenedores: number;
  /** Monto a Facturar al Cliente (RD$). */
  ingreso: number;
  /** Costo del Viaje (Monto a Facturar − Ganancia). */
  costo: number;
  ganancia: number;
  margenPct: number;
  /** Monto Neto a Pagar al transportista. */
  netoPagar: number;
  /** Parte del Ingreso ya cobrada según los cobros de sus facturas e-CF. */
  cobrado: number;
  /** Ingreso − Cobrado. */
  pendienteCobro: number;
};

/** Factura e-CF vinculada a un transporte, con sus líneas y cobros (Cuentas por Cobrar). */
export type FacturaCobroTransporte = {
  id: string;
  monto_total: number | string | null;
  estado?: string | null;
  eliminado_en?: string | null;
  vinculo_por_linea?: boolean | null;
  facturas_ecf_lineas?: { transporte_id: string | null; valor: number | string | null; itbis: number | string | null }[] | null;
  cxc_pagos?: { monto: number | string | null }[] | null;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Fracción (0–1) de lo facturado a un transporte que ya se cobró. Cada factura aporta
 * su cobrado ÷ total (mismo saldo que Cuentas por Cobrar), ponderada por la parte que
 * le corresponde al viaje: las facturas por línea solo pesan sus líneas asignadas.
 * Se usa como proporción porque las facturas incluyen ITBIS y pueden mezclar servicios,
 * mientras el Ingreso del dashboard es el Monto a Facturar del comprobante.
 */
export function fraccionCobrada(transporteId: string, facturas: readonly FacturaCobroTransporte[]): number {
  let peso = 0, cobradoPonderado = 0;
  const vistas = new Set<string>();
  for (const f of facturas) {
    if (vistas.has(f.id) || f.eliminado_en || f.estado === "anulada") continue;
    vistas.add(f.id);
    const total = num(f.monto_total);
    if (total <= 0) continue;
    const parte = f.vinculo_por_linea
      ? (f.facturas_ecf_lineas ?? []).filter((l) => l.transporte_id === transporteId).reduce((a, l) => a + num(l.valor) + num(l.itbis), 0)
      : total;
    if (parte <= 0) continue;
    const pagado = (f.cxc_pagos ?? []).reduce((a, p) => a + num(p.monto), 0);
    peso += parte;
    cobradoPonderado += parte * Math.min(1, Math.max(0, pagado / total));
  }
  return peso > 0 ? cobradoPonderado / peso : 0;
}

/** Fracción cobrada por transporte: «Pagado» manual cuenta completo; si no, según sus facturas. */
export function cobroPorTransporte(
  viajes: readonly (ViajeDashboard & { facturas?: readonly FacturaCobroTransporte[] })[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of viajes) {
    m.set(t.id, t.pago_estado === "pagado" ? 1 : fraccionCobrada(t.id, t.facturas ?? []));
  }
  return m;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Solo importes en RD$ (moneda del dashboard); otras monedas no se mezclan. */
export function resumenTransportes(
  viajes: ViajeDashboard[],
  ganancias: Map<string, GananciaTransporte>,
  /** Fracción cobrada por transporte (ver `cobroPorTransporte`); sin dato, nada cobrado. */
  cobros: Map<string, number> = new Map(),
): ResumenTransportes {
  let contenedores = 0, ingreso = 0, ganancia = 0, netoPagar = 0, cobrado = 0;
  for (const t of viajes) {
    contenedores += contarContenedores(t);
    const g = ganancias.get(t.id);
    if (!g || g.moneda !== "DOP") continue;
    const facturar = g.montoFacturar ?? 0;
    ingreso += facturar;
    ganancia += g.ganancia ?? 0;
    netoPagar += g.netoPagar;
    cobrado += facturar * (cobros.get(t.id) ?? (t.pago_estado === "pagado" ? 1 : 0));
  }
  return {
    viajes: viajes.length,
    contenedores,
    ingreso: r2(ingreso),
    costo: r2(ingreso - ganancia),
    ganancia: r2(ganancia),
    margenPct: ingreso > 0 ? (ganancia / ingreso) * 100 : 0,
    netoPagar: r2(netoPagar),
    cobrado: r2(cobrado),
    pendienteCobro: r2(ingreso - cobrado),
  };
}

/** Variación % contra el período anterior; null si el anterior es 0 (no hay base). */
export function variacionPct(actual: number, previo: number): number | null {
  if (!previo) return null;
  return ((actual - previo) / previo) * 100;
}
