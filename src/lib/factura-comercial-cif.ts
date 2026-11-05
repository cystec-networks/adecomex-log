import type { OcrExtraction } from "./ai-ocr.functions";

export type DesgloseCif = { costo: number; seguro: number; flete: number; total: number };
/** Missing documentary charges contribute nothing; explicit zero is retained. */
export function acumularValoresFactura(actuales: Record<string, unknown>, nuevos: Record<string, unknown>) {
  const resultado: Record<string, string> = {};
  for (const k of ["total_fob", "seguro", "flete", "otros"]) {
    const valor = nuevos[k];
    if (valor == null || valor === "" || !Number.isFinite(Number(valor))) continue;
    resultado[k] = String(Math.round(((Number(actuales[k]) || 0) + Number(valor)) * 100) / 100);
  }
  return resultado;
}
const importe = (v: string) => {
  const s = v.replace(/\s/g, "");
  const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  return Number(decimal === "," ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
};

/** Only complete, arithmetically consistent, explicitly labelled CIF breakdowns are authoritative. */
export function leerDesglosesCif(texto: string): DesgloseCif[] {
  const bloques = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/desglose\s+de\s+valores\s+CIF\s*:?/i).slice(1);
  return bloques.flatMap((bloque) => {
    const valor = (etiqueta: string) => {
      const m = bloque.match(new RegExp(`\\b${etiqueta}\\s*[:=]?\\s*(?:USD|US\\$|\\$)?\\s*([0-9][0-9.,]*(?:[ \\u00a0][0-9]{3})*(?:[.,][0-9]{2})?)`, "i"));
      return m ? importe(m[1]) : null;
    };
    const costo = valor("Costo"), seguro = valor("Seguro"), flete = valor("Flete"), total = valor("(?:Total\\s+CIF|CIF|Total)");
    if (costo == null || seguro == null || flete == null || total == null || ![costo, seguro, flete, total].every(Number.isFinite) || Math.abs(costo + seguro + flete - total) > 0.02) return [];
    return [{ costo, seguro, flete, total }];
  });
}

/** Does not distribute a document-level total arbitrarily across several products. */
export function normalizarFacturaCif<T extends Partial<OcrExtraction>>(datos: T, bloques: DesgloseCif[] = []): T {
  const lineas = datos.lineas_factura;
  const asignables = lineas?.length && bloques.length === lineas.length;
  const corregidas = lineas?.map((l, i) => ({ ...l,
    ...(asignables ? { costo_desglose_cif: bloques[i].costo } : {}),
    valor_fob: asignables ? bloques[i].costo : l.costo_desglose_cif ?? (bloques.length ? null : l.valor_fob),
  }));
  const sumar = (k: keyof DesgloseCif) => Math.round(bloques.reduce((s, b) => s + b[k], 0) * 100) / 100;
  const costosCompletos = corregidas?.length && corregidas.every((l) => l.costo_desglose_cif != null);
  return {
    ...datos,
    ...(corregidas ? { lineas_factura: corregidas } : {}),
    ...(bloques.length ? { fob_total: sumar("costo"), seguro: sumar("seguro"), flete: sumar("flete") } : costosCompletos ? { fob_total: Math.round(corregidas.reduce((s, l) => s + (l.valor_fob ?? 0), 0) * 100) / 100 } : {}),
  };
}