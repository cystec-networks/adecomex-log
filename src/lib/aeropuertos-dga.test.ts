import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AEROPUERTOS_DGA, esAeropuertoDga, nombreAeropuertoDga } from "./aeropuertos-dga";

describe("Aeropuertos etiquetados en el catálogo maestro de puertos DGA", () => {
  it("etiqueta exactamente los ocho aeropuertos que se usan en la plataforma", () => {
    assert.deepEqual(
      Object.keys(AEROPUERTOS_DGA).sort(),
      ["DOAZS", "DOBRX", "DOLRM", "DOPOP", "DOPUJ", "DOSDQ", "DOSNX", "DOSTI"],
    );
  });

  it("usa el nombre completo del aeropuerto como texto de ayuda", () => {
    assert.equal(
      nombreAeropuertoDga("DOSDQ"),
      "Aeropuerto Internacional Las Américas (JFPG/SDQ), Santo Domingo",
    );
    assert.equal(
      nombreAeropuertoDga("DOSNX"),
      "Aeropuerto Internacional Dr. Joaquín Balaguer (El Higüero, JBQ), Santo Domingo Norte",
    );
    assert.equal(nombreAeropuertoDga("DOAZS"), "Aeropuerto Internacional Presidente Juan Bosch - Samaná El Catey (AZS)");
  });

  it("DOJQB (HIGUERO) se queda sin etiqueta: el que se usa es DOSNX", () => {
    assert.equal(esAeropuertoDga("DOJQB"), false);
    assert.equal(nombreAeropuertoDga("DOJQB"), null);
  });

  it("no etiqueta puertos marítimos, pasos fronterizos ni códigos vacíos", () => {
    for (const codigo of ["DOPMA", "DOGUA", "", "   ", null, undefined, "no existe"]) {
      assert.equal(nombreAeropuertoDga(codigo), null, `no debería etiquetarse ${JSON.stringify(codigo)}`);
    }
  });

  it("tolera el código guardado en minúsculas o con espacios", () => {
    assert.equal(esAeropuertoDga(" dopuj "), true);
    assert.equal(nombreAeropuertoDga("dosti"), AEROPUERTOS_DGA.DOSTI);
  });
});
