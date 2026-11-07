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
  pendienteCobro: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Solo importes en RD$ (moneda del dashboard); otras monedas no se mezclan. */
export function resumenTransportes(
  viajes: ViajeDashboard[],
  ganancias: Map<string, GananciaTransporte>,
): ResumenTransportes {
  let contenedores = 0, ingreso = 0, ganancia = 0, netoPagar = 0, pendienteCobro = 0;
  for (const t of viajes) {
    contenedores += contarContenedores(t);
    const g = ganancias.get(t.id);
    if (!g || g.moneda !== "DOP") continue;
    const facturar = g.montoFacturar ?? 0;
    ingreso += facturar;
    ganancia += g.ganancia ?? 0;
    netoPagar += g.netoPagar;
    if (t.pago_estado === "pendiente") pendienteCobro += facturar;
  }
  return {
    viajes: viajes.length,
    contenedores,
    ingreso: r2(ingreso),
    costo: r2(ingreso - ganancia),
    ganancia: r2(ganancia),
    margenPct: ingreso > 0 ? (ganancia / ingreso) * 100 : 0,
    netoPagar: r2(netoPagar),
    pendienteCobro: r2(pendienteCobro),
  };
}

/** Variación % contra el período anterior; null si el anterior es 0 (no hay base). */
export function variacionPct(actual: number, previo: number): number | null {
  if (!previo) return null;
  return ((actual - previo) / previo) * 100;
}
