import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CAPITULOS_CON_NOTAS, notaCapituloSchema, validarNotasCapitulo, leerCsvNotasCapitulo } from "./capitulo-notas";

describe("Notas oficiales por capítulo", () => {
  it("acepta capítulos 1 a 97 excepto 77 reservado", () => {
    assert.equal(CAPITULOS_CON_NOTAS.length, 96);
    for (const capitulo of [1, 97]) assert.equal(notaCapituloSchema.parse({ capitulo, notas_texto: "Notas" }).capitulo, capitulo);
    for (const capitulo of [0, 77, 98, "", "x"]) assert.equal(notaCapituloSchema.safeParse({ capitulo, notas_texto: "Notas" }).success, false);
  });
  it("omite errores y duplicados sin detener las filas válidas", () => {
    const resultado = validarNotasCapitulo([{ capitulo: "07", notas_texto: "Notas" }, { capitulo: 77, notas_texto: "Reservado" }, { capitulo: 7, notas_texto: "Duplicado" }, { capitulo: 97, notas_texto: "Más notas" }]);
    assert.deepEqual(resultado.filas.map((f) => f.capitulo), [7, 97]);
    assert.deepEqual(resultado.errores.map((e) => e.fila), [3, 4]);
  });
  it("conserva texto largo, comillas, comas y saltos de línea CSV", async () => {
    const texto = `  Notas, \"oficiales\"\n${"Texto largo. ".repeat(600)}\nNotas adicionales  `;
    const csv = `capitulo,notas_texto\r\n7,"${texto.replace(/"/g, '""')}"\r\n`;
    const resultado = await leerCsvNotasCapitulo(new File([csv], "notas.csv", { type: "text/csv" }));
    assert.equal(resultado.errores.length, 0);
    assert.equal(resultado.filas[0]?.notas_texto, texto);
  });
  it("no permite notas vacías", () => {
    assert.equal(notaCapituloSchema.safeParse({ capitulo: 7, notas_texto: " \n " }).success, false);
  });
});