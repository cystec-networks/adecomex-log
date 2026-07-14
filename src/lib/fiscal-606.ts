// Catálogos y utilidades para el reporte 606 DGII (instructivo feb 2026)

export const TIPOS_BIENES_SERVICIOS: { v: number; l: string }[] = [
  { v: 1, l: "01 - Gastos de personal" },
  { v: 2, l: "02 - Gastos por trabajos, suministros y servicios" },
  { v: 3, l: "03 - Arrendamientos" },
  { v: 4, l: "04 - Gastos de activos fijos" },
  { v: 5, l: "05 - Gastos de representación" },
  { v: 6, l: "06 - Otras deducciones admitidas" },
  { v: 7, l: "07 - Gastos financieros" },
  { v: 8, l: "08 - Gastos extraordinarios" },
  { v: 9, l: "09 - Compras y gastos que forman parte del costo de venta" },
  { v: 10, l: "10 - Adquisiciones de activos" },
  { v: 11, l: "11 - Gastos de seguros" },
];

export const TIPOS_RETENCION_ISR: { v: number; l: string }[] = [
  { v: 1, l: "01 - Alquileres" },
  { v: 2, l: "02 - Honorarios por servicios" },
  { v: 3, l: "03 - Otras rentas" },
  { v: 4, l: "04 - Otras rentas (presuntas)" },
  { v: 5, l: "05 - Intereses a personas jurídicas residentes" },
  { v: 6, l: "06 - Intereses a personas físicas residentes" },
  { v: 7, l: "07 - Retención por proveedores del Estado" },
  { v: 8, l: "08 - Juegos telefónicos" },
  { v: 9, l: "09 - Retenciones ganadería de carne bovina" },
];

export const FORMA_PAGO_CODE: Record<string, string> = {
  efectivo: "1",
  cheque_transferencia: "2",
  tarjeta: "3",
  credito: "4",
  permuta: "5",
  nota_credito: "6",
  mixto: "7",
};

export const EMPRESA_RNC_KEY = "empresa_rnc";

export function money(n: number | null | undefined): string {
  return (Number(n) || 0).toFixed(2);
}

export function isPagoExterior(ncf: string | null | undefined): boolean {
  if (!ncf) return false;
  const p = ncf.trim().toUpperCase().slice(0, 3);
  return p === "B17" || p === "E17";
}
