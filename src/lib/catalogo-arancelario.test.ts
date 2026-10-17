import { describe, it, expect } from "vitest";
import { filaArancelSchema, resolverTasaProducto, tasasSugeridasArancel, validarFilasArancel } from "./catalogo-arancelario";
describe("Sugerencias oficiales sin reemplazar overrides", () => {
  it("mantiene el cero manual por encima del gravamen sugerido", () => expect(resolverTasaProducto(0, 20)).toBe("0"));
  it("mantiene una tasa manual positiva", () => expect(resolverTasaProducto("8", 20)).toBe("8"));
  it("sugiere gravamen solo en campo vacío", () => expect(resolverTasaProducto("", 20)).toBe("20"));
  it("ITBIS exento sugiere cero", () => expect(tasasSugeridasArancel({ gravamen_pct: 20, exento_itbis: true }).itbis).toBe(0));
  it("ITBIS en blanco no inventa un valor", () => expect(tasasSugeridasArancel({ gravamen_pct: null, exento_itbis: null }).itbis).toBeNull());
});
describe("CSV sin pérdida de códigos ni nulos", () => {
  const fila = { codigo: "0709.60.13", codigo_partida: "0709", descripcion: "Dato de prueba, no se importa", capitulo: "7", capitulo_titulo: "Prueba", seccion: "II", gravamen_pct: "", exento_itbis: "", nivel: "3", es_hoja: "true" };
  it("preserva ceros iniciales y defaults", () => { const r = filaArancelSchema.parse(fila); expect(r.codigo_partida).toBe("0709"); expect(r.vigente_desde).toBe("2022-01-01"); expect(r.activo).toBe(true); expect(r.gravamen_pct).toBeNull(); expect(r.exento_itbis).toBeNull(); });
  it("rechaza duplicados antes de cualquier escritura", () => expect(() => validarFilasArancel([fila, fila])).toThrow("duplicado"));
  it("rechaza partida distinta", () => expect(filaArancelSchema.safeParse({ ...fila, codigo_partida: "0801" }).success).toBe(false));
});