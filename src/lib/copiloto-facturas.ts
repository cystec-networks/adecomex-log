import { z } from "zod";

export const filaClasificacionSchema = z.object({
  descripcion: z.string(), cantidad: z.number().nullable(), unidad: z.string().nullable(),
  partida: z.string().nullable(), gravamen: z.number().nullable(), itbis: z.number().nullable(),
  enArancel: z.boolean(), insuficiente: z.boolean(), noProducto: z.boolean().optional(),
});
export type FilaClasificacion = z.infer<typeof filaClasificacionSchema>;
export type ArancelClasificacion = { codigo: string; gravamen_pct: number | null; exento_itbis: boolean | null; es_hoja: boolean };

export function candidatosCodigoCopiloto(codigo: string) {
  let d = codigo.replace(/[^0-9]/g, "");
  if (![4, 6, 8, 10].includes(d.length)) return [];
  const candidatos = [d];
  // Solo retirar pares 00 de relleno; nunca adivinar un desdoblamiento nacional.
  while (d.length > 6 && d.endsWith("00")) { d = d.slice(0, -2); candidatos.push(d); }
  return candidatos;
}

export function resolverArancelCopiloto(codigo: string, filas: ArancelClasificacion[]) {
  for (const candidato of candidatosCodigoCopiloto(codigo)) {
    const fila = filas.find((r) => r.codigo.replace(/[^0-9]/g, "") === candidato && r.es_hoja);
    if (fila) return fila;
  }
  return null;
}

export function columnasExcelClasificacion(filas: FilaClasificacion[]) {
  return filas.map((f) => [f.descripcion, f.partida ?? "", f.gravamen, f.itbis]);
}

export async function excelClasificacion(filas: FilaClasificacion[]) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Descripción", "Partida sugerida", "Gravamen %", "ITBIS %"],
    ...columnasExcelClasificacion(filas),
  ]);
  sheet["!cols"] = [{ wch: 70 }, { wch: 22 }, { wch: 16 }, { wch: 16 }];
  sheet["!autofilter"] = { ref: `A1:D${filas.length + 1}` };
  for (let i = 2; i <= filas.length + 1; i++) {
    for (const col of ["C", "D"]) { const c = sheet[`${col}${i}`]; if (c?.t === "n") c.z = '0.##"%"'; }
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Clasificación");
  return new Blob([XLSX.write(book, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function descargarExcelClasificacion(blob: Blob, archivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${archivo.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_") || "clasificacion"}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}