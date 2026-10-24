/// <reference types="bun" />
import { mock, test, expect, beforeEach } from "bun:test";

type Row = Record<string, any>;
let docs: Row[] = [];
let costos: Row[] = [];
let archivos = new Set<string>();
let fallaCosto = false;
let secuencia = 0;
function tabla(nombre: string) {
  let op = "select"; let payload: Row = {}; let filters: Array<(r: Row) => boolean> = [];
  let single = false;
  const rows = () => nombre === "documentos" ? docs : costos;
  const api = {
    select: (_campos?: string) => api,
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return api; },
    in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return api; },
    order: () => api, limit: () => api,
    single: () => { single = true; return api; },
    update: (p: Row) => { op = "update"; payload = p; return api; },
    insert: (p: Row) => { op = "insert"; payload = p; return api; },
    delete: () => { op = "delete"; return api; },
    then: (resolve: (v: any) => unknown) => {
      if (nombre === "costos_producto" && fallaCosto && op !== "select") return Promise.resolve({ data: null, error: new Error("falló costo") }).then(resolve);
      let selected = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "insert") { const r = { id: `id-${++secuencia}`, ...payload }; rows().push(r); selected = [r]; }
      if (op === "update") selected.forEach((r) => Object.assign(r, payload));
      if (op === "delete") { const remaining = rows().filter((r) => !selected.includes(r)); if (nombre === "documentos") docs = remaining; else costos = remaining; }
      return Promise.resolve({ data: single ? selected[0] : selected.map((r) => ({ ...r })), error: null }).then(resolve);
    },
  };
  return api;
}
mock.module("@/integrations/supabase/client", () => ({ supabase: {
  from: tabla,
  storage: { from: () => ({ upload: async (path: string) => { archivos.add(path); return { error: null }; }, remove: async (paths: string[]) => { paths.forEach((p) => archivos.delete(p)); return { error: null }; } }) },
} }));
mock.module("./codigo-siga", () => ({ sha256File: async () => "hash", siguienteCodigoSiga: async () => "OTD-001", validarNombreSiga: () => ({ ok: true }) }));
const { guardarComprobantePuerto } = await import("./pago-puerto-guardar");
beforeEach(() => { docs = []; costos = []; archivos = new Set(); fallaCosto = false; });
for (const tipo of ["almacenaje", "contenedor"] as const) {
  test(`${tipo}: reemplaza la casilla tradicional y un segundo pago no duplica documento ni costo`, async () => {
    const casilla = tipo === "almacenaje" ? "Factura Pago de Almacenaje" : "Recibo Pago de Contenedor";
    docs.push({ id: "tradicional", expediente_id: "exp", tipo: casilla, codigo_siga: "OTD-012", storage_path: "anterior.pdf", estado: "aprobado", fecha_recepcion: "2026-10-01" });
    archivos.add("anterior.pdf");
    const file = new File(["pdf"], "OTD-pago.pdf", { type: "application/pdf" });
    const draft = { tipo, monto: "2500.50", moneda: "DOP", fecha: "2026-10-24", referencia: tipo === "almacenaje" ? "DPW001" : "DPH002", concepto: tipo === "almacenaje" ? "Almacenaje — DPW" : "Depósito de Contenedor — DPH" };
    await guardarComprobantePuerto("exp", file, draft);
    expect(docs).toHaveLength(1); expect(docs[0].id).toBe("tradicional"); expect(docs[0].codigo_siga).toBe("OTD-012"); expect(docs[0].estado).toBe("recibido"); expect(docs[0].tipo).toBe(casilla);
    expect(costos).toHaveLength(1); expect(costos[0].monto_real).toBe(2500.50); expect(costos[0].observaciones).toContain(draft.referencia); expect(costos[0].observaciones).toContain("2026-10-24");
    await guardarComprobantePuerto("exp", file, { ...draft, monto: "3100.25" });
    expect(docs).toHaveLength(1); expect(costos).toHaveLength(1); expect(costos[0].monto_real).toBe(3100.25); expect(archivos.size).toBe(1);
  });
}
test("costo fallido restaura el PDF previo y no deja una carga incompleta", async () => {
  docs.push({ id: "previo", expediente_id: "exp", tipo: "Factura Pago de Almacenaje", codigo_siga: "OTD-009", storage_path: "original.pdf", estado: "aprobado", fecha_recepcion: "2026-10-01" });
  archivos.add("original.pdf"); fallaCosto = true;
  await expect(guardarComprobantePuerto("exp", new File(["pdf"], "OTD-pago.pdf"), { tipo: "almacenaje", monto: "1234", moneda: "DOP", fecha: "", referencia: "", concepto: "Almacenaje" })).rejects.toThrow("falló costo");
  expect(docs[0].storage_path).toBe("original.pdf"); expect(docs[0].estado).toBe("aprobado"); expect(costos).toHaveLength(0); expect([...archivos]).toEqual(["original.pdf"]);
});