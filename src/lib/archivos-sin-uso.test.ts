import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { enLotes, grupoArchivoSinUso, resumenPorGrupo, totalSeleccion } from "./archivos-sin-uso";
import { rutasPaqueteRetiradas, reemplazarPaquete } from "./paquete-rectificacion";

describe("Limpiar archivos sin uso", () => {
  test("agrupa paquetes reemplazados, pedazos de correo y originales de juegos", () => {
    assert.equal(grupoArchivoSinUso("ce7d05ab-fcac-490c-8e96-5f8c627d2168/1793999766479_Paquete_Rectificacion_Tecnica_202609I345_2026-11-06.pdf"), "Paquetes reemplazados");
    assert.equal(grupoArchivoSinUso("8fc0377b-8810-41c4-b9ce-0cbea1f4f861/1792870499571_Paquete_Envio_Factura_Cliente_202609I340.pdf"), "Paquetes reemplazados");
    assert.equal(grupoArchivoSinUso("correo-recibido/783c8c45-e6fd-4a0a-a96a-2f1f7317bed4/seg_d5f79d7f_0_FACTURA.pdf"), "Pedazos de correo");
    assert.equal(grupoArchivoSinUso("correo/1bf47ab6-4c2e-4d15-af12-c25b8ab49a2d/1794398982517_0_DOCUMENTOS.pdf"), "Adjuntos de correo");
    assert.equal(grupoArchivoSinUso("ce7d05ab-fcac-490c-8e96-5f8c627d2168/juegos/dbca1774-d0ce-4dfb-8b59-c5074487ae30/x-OTD-001 CERTIFICADO.pdf"), "Originales de juegos de documentos");
    assert.equal(grupoArchivoSinUso("permisos/fbe02597-3547-4f1c-bd30-8b516ae4add1-OTD-PER-TRM-0926-2533722.pdf"), "Permisos VUCE");
  });
  test("resumen y selección suman los bytes exactos", () => {
    const filas = [
      { storage_path: "a/1_Paquete_Rectificacion_Tecnica_X.pdf", tamano: 11_406_000 },
      { storage_path: "permisos/p.pdf", tamano: 1_000 },
      { storage_path: "permisos/q.pdf", tamano: 2_000 },
    ];
    assert.deepEqual(resumenPorGrupo(filas).map((r) => [r.grupo, r.archivos, r.bytes]), [["Paquetes reemplazados", 1, 11_406_000], ["Permisos VUCE", 2, 3_000]]);
    assert.deepEqual(totalSeleccion(filas, new Set(["permisos/p.pdf", "permisos/q.pdf"])), { archivos: 2, bytes: 3_000 });
  });
  test("borrado en lotes de 100", () => {
    assert.deepEqual(enLotes(Array.from({ length: 250 }, (_, i) => i)).map((l) => l.length), [100, 100, 50]);
  });
});

describe("Paquete regenerado sin copias", () => {
  test("devuelve el archivo anterior y los duplicados, nunca el nuevo", async () => {
    const filas = [{ id: "v", storage_path: "exp/1_Paquete_viejo.pdf" }, { id: "d", storage_path: "exp/0_Paquete_dup.pdf" }];
    const rutas = await reemplazarPaquete({
      listar: async () => filas, actualizar: async () => {}, insertar: async () => {}, eliminarDuplicados: async () => {},
    }, "exp/2_Paquete_nuevo.pdf");
    assert.deepEqual(rutas, ["exp/1_Paquete_viejo.pdf", "exp/0_Paquete_dup.pdf"]);
  });
  test("primera generación no retira nada", async () => {
    const rutas = await reemplazarPaquete({ listar: async () => [], actualizar: async () => {}, insertar: async () => {}, eliminarDuplicados: async () => {} }, "exp/nuevo.pdf");
    assert.deepEqual(rutas, []);
  });
  test("ignora rutas vacías, repetidas o iguales a la nueva", () => {
    assert.deepEqual(rutasPaqueteRetiradas([{ id: "1", storage_path: "a.pdf" }, { id: "2", storage_path: "a.pdf" }, { id: "3", storage_path: null }, { id: "4", storage_path: "n.pdf" }], "n.pdf"), ["a.pdf"]);
  });
});
