import { z } from "zod";

export const SECCIONES_ARANCEL = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"] as const;
const booleano = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "sí", "si"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return v;
}, z.boolean());
const opcional = (v: unknown) => v == null || String(v).trim() === "" ? undefined : v;
const nullable = (v: unknown) => opcional(v) === undefined ? null : v;
export const filaArancelSchema = z.object({
  codigo: z.string().trim().regex(/^\d{4}(?:\.\d{2}){0,3}$|^\d{6}$|^\d{8}$|^\d{10}$/),
  codigo_partida: z.string().trim().regex(/^\d{4}$/),
  descripcion: z.string().trim().min(1),
  capitulo: z.preprocess(nullable, z.coerce.number().int().min(1).max(97).nullable()),
  capitulo_titulo: z.string().trim().min(1),
  seccion: z.enum(SECCIONES_ARANCEL),
  gravamen_pct: z.preprocess(nullable, z.coerce.number().min(0).max(100).nullable()),
  exento_itbis: z.preprocess(nullable, booleano.nullable()),
  nivel: z.coerce.number().int().min(0).max(10),
  es_hoja: booleano,
  notas_legales: z.preprocess(nullable, z.string().nullable()),
  requiere_permiso: z.preprocess(opcional, booleano.default(false)),
  vigente_desde: z.preprocess(opcional, z.iso.date().default("2022-01-01")),
  activo: z.preprocess(opcional, booleano.default(true)),
}).refine((r) => r.codigo.replace(/\./g, "").startsWith(r.codigo_partida), { message: "La partida no coincide con el código", path: ["codigo_partida"] });
export type FilaArancel = z.output<typeof filaArancelSchema>;

export type ResultadoValidacionArancel = { filas: FilaArancel[]; errores: { fila: number; mensaje: string }[] };

export function validarFilasArancel(filas: Record<string, unknown>[]): ResultadoValidacionArancel {
  if (!filas.length) throw new Error("El archivo no contiene filas.");
  if (filas.length > 20000) throw new Error("Divide el archivo en bloques de hasta 20000 filas.");
  const codigos = new Set<string>();
  const validas: FilaArancel[] = [];
  const errores: { fila: number; mensaje: string }[] = [];
  filas.forEach((fila, i) => {
    const parsed = filaArancelSchema.safeParse(fila);
    if (!parsed.success) {
      errores.push({ fila: i + 2, mensaje: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") });
      return;
    }
    const clave = parsed.data.codigo.replace(/\./g, "");
    if (codigos.has(clave)) {
      errores.push({ fila: i + 2, mensaje: `código duplicado ${parsed.data.codigo}` });
      return;
    }
    codigos.add(clave);
    validas.push(parsed.data);
  });
  return { filas: validas, errores };
}

export async function leerCsvArancel(file: File): Promise<ResultadoValidacionArancel> {
  if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera 20 MB.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.text(), { type: "string", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("No se pudo leer el CSV.");
  return validarFilasArancel(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true }));
}

export function tasasSugeridasArancel(arancel: { gravamen_pct: number | null; exento_itbis: boolean | null }) {
  return { gravamen: arancel.gravamen_pct, itbis: arancel.exento_itbis === true ? 0 : arancel.exento_itbis === false ? 18 : null };
}

export function resolverTasaProducto(manual: unknown, sugerida: number | null): string {
  return manual != null && String(manual) !== "" ? String(manual) : sugerida == null ? "" : String(sugerida);
}