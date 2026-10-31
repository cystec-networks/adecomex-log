import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agregarArchivosJuego, leerEntradasJuego, rutaArchivoJuego, esArchivoCarpeta, marcarArchivosCarpeta, type EntradaJuego } from "./juego-documentos-seleccion";

const archivo = (name: string, type = "application/pdf") => new File(["contenido"], name, { type, lastModified: 1 });
const entrada = (file: File): EntradaJuego => ({ name: file.name, isFile: true, isDirectory: false, file: (ok) => ok(file) });
const carpeta = (name: string, batches: EntradaJuego[][]): EntradaJuego => ({ name, isFile: false, isDirectory: true, createReader: () => { let n = 0; return { readEntries: (ok) => ok(batches[n++] ?? []) }; } });

describe("selección de documentos individuales y carpetas", () => {
  it("acepta varios PDF/imágenes juntos y excluye archivos ajenos", () => {
    assert.deepEqual(agregarArchivosJuego([], [archivo("factura.pdf"), archivo("bl.pdf"), archivo("certificado.png", "image/png"), archivo("nota.txt", "text/plain")]).map((f) => f.name), ["factura.pdf", "bl.pdf", "certificado.png"]);
  });
  it("lee la carpeta completa, subcarpetas y todas las tandas", async () => {
    const out = await leerEntradasJuego([carpeta("embarque", [[entrada(archivo("factura.pdf")), entrada(archivo("nota.txt", "text/plain"))], [carpeta("certificados", [[entrada(archivo("origen.jpg", ""))]])], [entrada(archivo("bl.pdf"))]])]);
    assert.deepEqual(out.files.map(rutaArchivoJuego), ["embarque/factura.pdf", "embarque/nota.txt", "embarque/certificados/origen.jpg", "embarque/bl.pdf"]);
    assert.ok(out.files.every(esArchivoCarpeta));
    assert.deepEqual(out.errores, []);
  });
  it("conserva archivos homónimos de carpetas distintas y no duplica la misma selección", async () => {
    const out = await leerEntradasJuego([carpeta("a", [[entrada(archivo("factura.pdf"))]]), carpeta("b", [[entrada(archivo("factura.pdf"))]])]);
    assert.equal(agregarArchivosJuego(out.files, out.files).length, 2);
  });
  it("un archivo ilegible no bloquea los demás", async () => {
    const malo: EntradaJuego = { name: "ilegible.pdf", isFile: true, isDirectory: false, file: (_, fail) => fail(new Error("sin acceso")) };
    const out = await leerEntradasJuego([malo, entrada(archivo("bl.pdf"))]);
    assert.deepEqual(out.files.map((f) => f.name), ["bl.pdf"]);
    assert.deepEqual(out.errores, ["No se pudo leer ilegible.pdf"]);
  });
  it("mezclar archivos y carpeta conserva el comportamiento de cada origen", () => {
    const manual = archivo("manual.pdf");
    const [folder] = marcarArchivosCarpeta([archivo("carpeta.pdf")]);
    assert.equal(esArchivoCarpeta(manual), false);
    assert.equal(esArchivoCarpeta(folder), true);
  });
});