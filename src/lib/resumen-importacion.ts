import { impuestoPantallaRd } from "@/lib/liquidacion-moneda";

/**
 * Resumen de Importación (solo lectura, pestaña Costos).
 * Los impuestos Real se guardan en US$ por línea de producto; aquí se suman y
 * se presentan en RD$ con la tasa del expediente. Una línea sin valor guardado
 * (incluido vacío) no se cuenta: si ninguna línea tiene el impuesto capturado,
 * se reporta como pendiente de liquidación en vez de 0.00.
 */
export type ImpuestoResumen = { capturado: boolean; rd: number };

export function resumenImportacion(args: {
  /** mercancia_items del expediente (solo se leen los campos *_real). */
  filas: { gravamen_real?: unknown; isc_real?: unknown; itbis_real?: unknown }[];
  /** Tasa de cambio del expediente (RD$ por US$). */
  tasa: number;
  /** Costo de mercancía ya en RD$ (el mismo Total RD$ de la pestaña). */
  costoMercanciaRd: number;
}) {
  const { filas, tasa, costoMercanciaRd } = args;
  const suma = (campo: "gravamen_real" | "isc_real" | "itbis_real"): ImpuestoResumen => {
    const vals = filas
      .map((it) => it?.[campo])
      .filter((v) => v != null && v !== "")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    return {
      capturado: vals.length > 0,
      rd: vals.reduce((s, v) => s + (impuestoPantallaRd(v, tasa) ?? 0), 0),
    };
  };
  const gravamen = suma("gravamen_real");
  const isc = suma("isc_real");
  const itbis = suma("itbis_real");
  const sinTasa = tasa <= 0 && (gravamen.capturado || isc.capturado || itbis.capturado);
  // Total general = Gravamen + ISC + Costo de mercancía; el ITBIS es crédito fiscal, no es costo.
  const pendientes = !gravamen.capturado || !isc.capturado;
  return {
    gravamen,
    isc,
    itbis,
    sinTasa,
    pendientes,
    totalGeneral: pendientes || sinTasa ? null : gravamen.rd + isc.rd + costoMercanciaRd,
  };
}
