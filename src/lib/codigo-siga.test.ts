import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prefijosAceptados, validarNombreSiga } from "./codigo-siga";

describe("Prefijos SIGA aceptados al subir documentos", () => {
  it("Permiso VUCE, Certificado Sanitario/Fitosanitario y Certificado de análisis aceptan PER- u OTD-", () => {
    for (const tipo of ["Permiso VUCE previo", "Certificado Sanitario/Fitosanitario", "Certificado de análisis"]) {
      assert.deepEqual(prefijosAceptados(tipo), ["PER", "OTD"], tipo);
      for (const pref of ["PER", "OTD"]) {
        const v = validarNombreSiga(`${pref}-003.pdf`, prefijosAceptados(tipo));
        assert.equal(v.ok, true, `${tipo} debería aceptar ${pref}-`);
        assert.equal("advertencia" in v ? v.advertencia : undefined, undefined, `${tipo} con ${pref}- no debe avisar`);
      }
    }
  });

  it("rechaza un prefijo que no es válido para esos tres tipos y menciona los dos válidos", () => {
    for (const tipo of ["Permiso VUCE previo", "Certificado Sanitario/Fitosanitario", "Certificado de análisis"]) {
      const v = validarNombreSiga("FAC-001.pdf", prefijosAceptados(tipo));
      assert.equal(v.ok, false, `${tipo} no debe aceptar FAC-`);
      assert.match((v as { error: string }).error, /PER- u OTD-/, tipo);
    }
  });

  it("los demás tipos conservan un solo prefijo", () => {
    assert.deepEqual(prefijosAceptados("Factura comercial"), ["FAC"]);
    assert.deepEqual(prefijosAceptados("Bill of Lading"), ["DOE"]);
    assert.deepEqual(prefijosAceptados("Guía aérea"), ["DOE"]);
    assert.deepEqual(prefijosAceptados("Certificado de origen"), ["CEO"]);
    assert.deepEqual(prefijosAceptados("Lista de empaque"), ["OTD"]);
    assert.deepEqual(prefijosAceptados("Declaración Única Aduanera (DUA)"), ["OTD"]);
    assert.deepEqual(prefijosAceptados("Reporte de Liquidación de Impuestos"), ["OTD"]);
    assert.deepEqual(prefijosAceptados("Otro"), ["OTD"]);

    assert.equal(validarNombreSiga("FAC-001.pdf", prefijosAceptados("Factura comercial")).ok, true);
    assert.equal(validarNombreSiga("DOE-001.pdf", prefijosAceptados("Factura comercial")).ok, false);
    assert.equal(validarNombreSiga("OTD-001.pdf", prefijosAceptados("Bill of Lading")).ok, false);
    assert.equal(validarNombreSiga("PER-001.pdf", prefijosAceptados("Certificado de origen")).ok, false);
  });

  it("un archivo sin prefijo SIGA se sube con aviso, no se rechaza", () => {
    const v = validarNombreSiga("documentos.pdf", prefijosAceptados("Permiso VUCE previo"));
    assert.equal(v.ok, true);
    assert.match((v as { advertencia?: string }).advertencia ?? "", /prefijo de codificación SIGA/);
  });
});
