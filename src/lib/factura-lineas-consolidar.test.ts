import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidarLineasFactura } from "./factura-expediente-arancel";

const leche = (cantidad: number, desc = "LECHE EN POLVO DESCREMADA (B. TEMP.) 25 kg") => ({
  descripcion: desc, codigo_arancelario: "0402.10.90", cantidad, unidad: "TM", peso: cantidad * 1000, valor_fob: cantidad * 3570,
});

test("siete sub-lotes del mismo producto se consolidan en una fila de 66 t", () => {
  const r = consolidarLineasFactura([2, 7, 14, 17.025, 4.975, 3, 18].map((c) => leche(c)));
  assert.equal(r.length, 1);
  assert.equal(r[0].cantidad, 66);
  assert.equal(r[0].peso, 66000);
  assert.equal(r[0].valor_fob, 235620);
});

test("variaciones menores de texto se consideran el mismo producto", () => {
  const r = consolidarLineasFactura([leche(2), leche(3, "Leche en polvo descremada B TEMP 25 KG")]);
  assert.equal(r.length, 1);
  assert.equal(r[0].cantidad, 5);
});

test("código o descripción distintos quedan en filas separadas", () => {
  const r = consolidarLineasFactura([leche(2), { ...leche(3), codigo_arancelario: "0402.21.10" }, leche(4, "LECHE ENTERA 25 kg")]);
  assert.equal(r.length, 3);
});
