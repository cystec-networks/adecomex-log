import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatoTamanoArchivo } from "./documento-tamano";

describe("tamaño de documentos", () => {
  it("representa 1.2 MB y 450 KB sin descargar ni cambiar el archivo", () => {
    assert.equal(formatoTamanoArchivo(1_200_000), "1.2 MB");
    assert.equal(formatoTamanoArchivo(450_000), "450 KB");
    assert.equal(formatoTamanoArchivo(0), "0 B");
  });
  it("no inventa un tamaño cuando no está disponible", () => {
    assert.equal(formatoTamanoArchivo(undefined), null);
    assert.equal(formatoTamanoArchivo(-1), null);
    assert.equal(formatoTamanoArchivo(NaN), null);
  });
});