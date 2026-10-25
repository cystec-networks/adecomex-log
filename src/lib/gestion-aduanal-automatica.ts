import { esConceptoPagoPuerto } from "./pago-puerto";

export type CostoMercancia = {
  id: string; concepto: string; monto_real: number | string; moneda: string;
  observaciones?: string | null; automatico?: boolean;
};
export type FacturaGestion = {
  id: string; encf: string; monto_total: number | string; pdf_url?: string | null;
  fecha_emision?: string | null; eliminado_en?: string | null; estado?: string | null;
};
export type CobroGestion = {
  concepto: string; deleted_at?: string | null; estado?: string | null;
  factura_ecf_id?: string | null; facturas_ecf: FacturaGestion | null;
};

const normalizar = (texto: string) => texto.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const esCobroGestion = (concepto: string) =>
  /^(servicios de )?gestion aduanal(?:\s|$)/.test(normalizar(concepto));

/** Source-of-truth projection: no writes to billing or historical scanned costs. */
export function resolverCostosGestion(costos: CostoMercancia[], cobros: CobroGestion[]): CostoMercancia[] {
  const relacionadas = new Map<string, FacturaGestion>();
  const vigentes = new Map<string, FacturaGestion>();
  for (const cobro of cobros) {
    const factura = cobro.facturas_ecf;
    if (!factura || !esCobroGestion(cobro.concepto)) continue;
    relacionadas.set(factura.id, factura);
    if (!cobro.deleted_at && cobro.estado !== "anulada" && !factura.eliminado_en &&
        factura.estado !== "anulada" && factura.pdf_url?.trim()) vigentes.set(factura.id, factura);
  }
  const manuales = costos.filter((costo) => {
    if (!esConceptoPagoPuerto(costo.concepto, "gestion_aduanal")) return true;
    const notas = costo.observaciones ?? "";
    const referencia = notas.split(" · ").find((p) => p.startsWith("Factura/NCF: "))?.slice(13).trim().toUpperCase();
    if (referencia) return ![...relacionadas.values()].some((f) => f.encf.trim().toUpperCase() === referencia);
    // Older scanner rows without a reference are replaceable only when unambiguous.
    return !(relacionadas.size === 1 && notas.split(" · ").includes("Pago escaneado: Gestión Aduanal"));
  });
  return [...manuales, ...[...vigentes.values()].map((f) => ({
    id: `gestion-ecf-${f.id}`, concepto: "Gestión Aduanal", monto_real: Number(f.monto_total),
    moneda: "DOP", automatico: true,
    observaciones: [f.fecha_emision && `Fecha de factura: ${f.fecha_emision}`, `Factura/NCF: ${f.encf}`].filter(Boolean).join(" · "),
  }))];
}