import { z } from "zod";

export const CAPITULOS_CON_NOTAS = Array.from({ length: 97 }, (_, i) => i + 1).filter((n) => n !== 77);
export const notaCapituloSchema = z.object({
  capitulo: z.preprocess((v) => typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v,
    z.number().int().min(1).max(97).refine((n) => n !== 77, "El capítulo 77 está reservado")),
  notas_texto: z.string().refine((s) => s.trim().length > 0, "Las notas están vacías"),
});
export type NotaCapitulo = z.output<typeof notaCapituloSchema>;

export function validarNotasCapitulo(filas: Record<string, unknown>[]) {
  if (!filas.length) throw new Error("El archivo no contiene filas.");
  const capitulos = new Set<number>();
  const validas: NotaCapitulo[] = [];
  const errores: { fila: number; mensaje: string }[] = [];
  filas.forEach((fila, i) => {
    const parsed = notaCapituloSchema.safeParse(fila);
    if (!parsed.success) {
      errores.push({ fila: i + 2, mensaje: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") });
    } else if (capitulos.has(parsed.data.capitulo)) {
      errores.push({ fila: i + 2, mensaje: `capítulo duplicado ${parsed.data.capitulo}` });
    } else {
      capitulos.add(parsed.data.capitulo);
      validas.push(parsed.data);
    }
  });
  return { filas: validas, errores };
}

export async function leerCsvNotasCapitulo(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera 20 MB.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.text(), { type: "string", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("No se pudo leer el CSV.");
  return validarNotasCapitulo(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true }));
}