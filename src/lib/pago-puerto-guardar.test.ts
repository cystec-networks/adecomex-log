import { mock, test, expect, beforeEach } from "bun:test";

type Row = Record<string, any>;
let docs: Row[] = [];
let costos: Row[] = [];
let expedientes: Row[] = [];
let cobros: Row[] = [];
let ecfs: Row[] = [];
let permisos: Row[] = [];
let escrituras: Array<{ tabla: string; payload: Row }> = [];
let archivos = new Set<string>();
let fallaCosto = false;
let secuencia = 0;
function tabla(nombre: string) {
  let op = "select"; let payload: Row = {}; let filters: Array<(r: Row) => boolean> = [];
  let single = false;
  const rows = () => ({ documentos: docs, costos_producto: costos, expedientes, facturas: cobros, facturas_ecf: ecfs, permisos }[nombre] ?? []);
  const api = {
    select: (_campos?: string) => api,
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return api; },
    is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return api; },
    neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return api; },
    in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return api; },
    order: () => api, limit: () => api,
    single: () => { single = true; return api; },
    maybeSingle: () => { single = true; return api; },
    update: (p: Row) => { op = "update"; payload = p; return api; },
    insert: (p: Row) => { op = "insert"; payload = p; return api; },
    delete: () => { op = "delete"; return api; },
    then: (resolve: (v: any) => unknown) => {
      if (op !== "select") escrituras.push({ tabla: nombre, payload: { ...payload } });
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
const { guardarComprobantePuerto, guardarCostoDocumentoPuerto } = await import("./pago-puerto-guardar");
beforeEach(() => { docs = []; costos = []; expedientes = []; cobros = []; ecfs = []; permisos = []; escrituras = []; archivos = new Set(); fallaCosto = false; });
test("VUCE desde Documentos actualiza una sola línea por permiso con ambos comprobantes", async () => {
  permisos.push({ expediente_id: "exp", numero: "TRM-0926-2533722" });
  const draft = { tipo: "vuce_pin" as const, monto: "5800", moneda: "DOP", fecha: "", referencia: "20260924F07D3F40", concepto: "Permiso VUCE", permiso_numero: "TRM-0926-2533722" };
  await guardarCostoDocumentoPuerto("exp", "OTD-010", draft);
  await guardarCostoDocumentoPuerto("exp", "OTD-011", { ...draft, tipo: "vuce_recibo", fecha: "2026-09-25" });
  expect(costos).toHaveLength(1); expect(costos[0].monto_real).toBe(5800);
  expect(costos[0].observaciones).toContain("2026-09-25"); expect(costos[0].observaciones).toContain("PIN VUCE SIGA: OTD-010"); expect(costos[0].observaciones).toContain("Recibo VUCE SIGA: OTD-011");
  await guardarCostoDocumentoPuerto("exp", "OTD-010", { ...draft, monto: "6000" });
  expect(costos).toHaveLength(1); expect(costos[0].monto_real).toBe(6000); expect(costos[0].observaciones).toContain("2026-09-25"); expect(docs).toHaveLength(0);
});
test("VUCE Escanear pago recibe dos PDFs pero crea un solo costo", async () => {
  permisos.push({ expediente_id: "exp", numero: "TRM-0926-2533722" });
  const draft = { tipo: "vuce_pin" as const, monto: "5800", moneda: "DOP", fecha: "", referencia: "20260924F07D3F40", concepto: "Permiso VUCE", permiso_numero: "TRM-0926-2533722" };
  await guardarComprobantePuerto("exp", new File(["pin"], "OTD-pin.pdf"), draft);
  await guardarComprobantePuerto("exp", new File(["recibo"], "OTD-recibo.pdf"), { ...draft, tipo: "vuce_recibo", fecha: "2026-09-25" }, true);
  expect(docs).toHaveLength(2); expect(costos).toHaveLength(1); expect(costos[0].monto_real).toBe(5800);
});
test("Recibo VUCE primero (sin trámite) se guarda con su PIN y el PIN posterior lo vincula retroactivamente", async () => {
  permisos.push({ expediente_id: "exp", numero: "TRM-0926-2533722" });
  const recibo = { tipo: "vuce_recibo" as const, monto: "5800", moneda: "DOP", fecha: "2026-09-25", referencia: "20260924F07D3F40", concepto: "Permiso VUCE", permiso_numero: "" };
  await guardarCostoDocumentoPuerto("exp", "OTD-011", recibo);
  expect(costos).toHaveLength(1);
  expect(costos[0].observaciones).toContain("PIN/Referencia: 20260924F07D3F40");
  expect(costos[0].observaciones).toContain("Recibo VUCE SIGA: OTD-011");
  expect(costos[0].observaciones).not.toContain("Permiso VUCE:");
  const pin = { tipo: "vuce_pin" as const, monto: "5800", moneda: "DOP", fecha: "", referencia: "20260924F07D3F40", concepto: "Permiso VUCE", permiso_numero: "TRM-0926-2533722" };
  await guardarCostoDocumentoPuerto("exp", "OTD-010", pin);
  expect(costos).toHaveLength(1);
  expect(costos[0].observaciones).toContain("Permiso VUCE: TRM-0926-2533722");
  expect(costos[0].observaciones).toContain("PIN VUCE SIGA: OTD-010");
  expect(costos[0].observaciones).toContain("Recibo VUCE SIGA: OTD-011");
  expect(costos[0].observaciones).toContain("Fecha de pago: 2026-09-25");
  expect(costos[0].monto_real).toBe(5800);
});
test("Recibo VUCE después del PIN hereda el trámite por el mismo PIN sin pedirlo manualmente", async () => {
  permisos.push({ expediente_id: "exp", numero: "TRM-0926-2533722" });
  const pin = { tipo: "vuce_pin" as const, monto: "5800", moneda: "DOP", fecha: "", referencia: "20260924F07D3F40", concepto: "Permiso VUCE", permiso_numero: "TRM-0926-2533722" };
  await guardarCostoDocumentoPuerto("exp", "OTD-010", pin);
  const recibo = { tipo: "vuce_recibo" as const, monto: "5800", moneda: "DOP", fecha: "2026-09-25", referencia: "20260924F07D3F40", concepto: "Permiso VUCE", permiso_numero: "" };
  await guardarCostoDocumentoPuerto("exp", "OTD-011", recibo);
  expect(costos).toHaveLength(1);
  expect(costos[0].observaciones).toContain("Permiso VUCE: TRM-0926-2533722");
  expect(costos[0].observaciones).toContain("Recibo VUCE SIGA: OTD-011");
  expect(costos[0].observaciones).toContain("Fecha de pago: 2026-09-25");
});
test("Recibo VUCE sin PIN ni trámite sigue sin guardarse", async () => {
  await expect(guardarCostoDocumentoPuerto("exp", "OTD-011", { tipo: "vuce_recibo", monto: "5800", moneda: "DOP", fecha: "2026-09-25", referencia: "", concepto: "Permiso VUCE", permiso_numero: "" })).rejects.toThrow("no se asumirá un vínculo");
  expect(escrituras).toHaveLength(0);
});
test("VUCE sin permiso coincidente no escribe costo ni sube PDF", async () => {
  await expect(guardarComprobantePuerto("exp", new File(["pin"], "OTD-pin.pdf"), { tipo: "vuce_pin", monto: "5800", moneda: "DOP", fecha: "", referencia: "PIN", concepto: "Permiso VUCE", permiso_numero: "TRM-OTRO" })).rejects.toThrow("no se asumirá un vínculo");
  expect(escrituras).toHaveLength(0); expect(archivos.size).toBe(0);
});
for (const tipo of ["almacenaje", "contenedor", "cargos_locales"] as const) {
  test(`${tipo}: reemplaza la casilla tradicional y un segundo pago no duplica documento ni costo`, async () => {
    const casilla = tipo === "almacenaje" ? "Factura Pago de Almacenaje" : tipo === "cargos_locales" ? "Factura Pago Cargos Locales" : "Recibo Pago de Contenedor";
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
test("Gestión Aduanal reemplaza PDF de e-CF y costo sin tocar cobros ni importes fiscales", async () => {
  expedientes.push({ id: "exp", factura_ecf_id: "ecf" });
  ecfs.push({ id: "ecf", encf: "E310000000335", pdf_url: "original.pdf", monto_total: 11800, total_itbis: 1800 });
  cobros.push({ id: "cobro", expediente_id: "exp", factura_ecf_id: "ecf", monto: 10000, itbis: 1800, estado: "pendiente" });
  const original = JSON.stringify(cobros);
  const draft = { tipo: "gestion_aduanal" as const, monto: "10000", moneda: "DOP", fecha: "2026-10-24", referencia: "E310000000335", concepto: "Gestión Aduanal" };
  const file = new File(["pdf"], "OTD-gestion.pdf");
  await guardarComprobantePuerto("exp", file, draft);
  expect(costos[0].monto_real).toBe(10000); expect(costos[0].concepto).toBe("Gestión Aduanal");
  expect(costos[0].observaciones).toContain("E310000000335"); expect(costos[0].observaciones).toContain("2026-10-24");
  expect(archivos.has(ecfs[0].pdf_url)).toBe(true);
  const primeraRuta = ecfs[0].pdf_url;
  await guardarComprobantePuerto("exp", file, { ...draft, monto: "12500" });
  expect(costos).toHaveLength(1); expect(costos[0].monto_real).toBe(12500); expect(ecfs[0].pdf_url === primeraRuta).toBe(false);
  expect(docs).toHaveLength(0); expect(JSON.stringify(cobros)).toBe(original);
  expect(ecfs[0].monto_total).toBe(11800); expect(ecfs[0].total_itbis).toBe(1800);
  expect(escrituras.filter((w) => w.tabla === "facturas_ecf").every((w) => Object.keys(w.payload).join() === "pdf_url")).toBe(true);
  expect(escrituras.some((w) => w.tabla === "facturas")).toBe(false);
});
test("sin e-CF correspondiente guarda costo y avisa sin crear factura ni PDF", async () => {
  ecfs.push({ id: "otra", encf: "E310000000335", monto_total: 11800 });
  const r = await guardarComprobantePuerto("exp", new File(["pdf"], "OTD-gestion.pdf"), { tipo: "gestion_aduanal", monto: "10000", moneda: "DOP", fecha: "", referencia: "E310000000335", concepto: "Gestión Aduanal" });
  expect(r.aviso).toContain("no se adjuntó el PDF ni se creó una factura"); expect(costos).toHaveLength(1); expect(archivos.size).toBe(0); expect(ecfs).toHaveLength(1);
});
test("NCF distinto no reemplaza el PDF de otra factura vinculada", async () => {
  expedientes.push({ id: "exp", factura_ecf_id: "ecf" }); ecfs.push({ id: "ecf", encf: "E310000000111", pdf_url: "original.pdf" });
  const r = await guardarComprobantePuerto("exp", new File(["pdf"], "OTD-gestion.pdf"), { tipo: "gestion_aduanal", monto: "10000", moneda: "DOP", fecha: "", referencia: "E310000000335", concepto: "Gestión Aduanal" });
  expect(Boolean(r.aviso)).toBe(true); expect(ecfs[0].pdf_url).toBe("original.pdf");
});
test("fallo de costo Gestión Aduanal restaura adjunto e-CF", async () => {
  expedientes.push({ id: "exp", factura_ecf_id: "ecf" }); ecfs.push({ id: "ecf", encf: "E310000000335", pdf_url: "original.pdf" }); fallaCosto = true;
  await expect(guardarComprobantePuerto("exp", new File(["pdf"], "OTD-gestion.pdf"), { tipo: "gestion_aduanal", monto: "10000", moneda: "DOP", fecha: "", referencia: "E310000000335", concepto: "Gestión Aduanal" })).rejects.toThrow("falló costo");
  expect(ecfs[0].pdf_url).toBe("original.pdf"); expect(archivos.size).toBe(0);
});