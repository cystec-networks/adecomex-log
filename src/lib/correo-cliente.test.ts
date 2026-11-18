import { expect, test } from "bun:test";
import { analizarClienteCorreo, nombreParaCatalogo, clientesDelRemitente, clientesEnAsunto, clientesParecidos, nombreAsuntoCuerpo, nombreComparable } from "./correo-cliente";

const CLIENTES = [
  { id: "maguana", nombre: "PROCESADORA DE GRANOS MAGUANA SRL", email: "IMPORTACIONES@LASANJUANERA.COM.DO" },
  { id: "ativa", nombre: "ATIVA MATERIA PRIMAS S R L", email: "enunez@ativa.com.do" },
  { id: "bioagro", nombre: "BIOAGRO INTERNACIONAL SRL", email: "mdelosantos@bioagro-int.com" },
  { id: "bioquimica", nombre: "BIOQUIMICA INTERNACIONAL SRL", email: "mdelosantos@bioagro-int.com" },
  { id: "samira", nombre: "AGROINDUSTRIAL SAMIRA SRL", email: "ssamiraimportaciones@gmail.com" },
  { id: "sadoca", nombre: "SADOCA TRADING SAS", email: null },
];

test("comparación sin mayúsculas, acentos, puntos, comas ni forma societaria", () => {
  expect(nombreComparable("Procesadora De Granos Maguana, S.R.L.")).toBe("PROCESADORA DE GRANOS MAGUANA");
  expect(nombreComparable("ATIVA MATERIA PRIMAS S R L")).toBe("ATIVA MATERIA PRIMAS");
  expect(nombreComparable("Sadoca Trading, S.A.S.")).toBe("SADOCA TRADING");
  expect(nombreComparable("Pinturas Popular, S.A.")).toBe("PINTURAS POPULAR");
});

test("documento con otra escritura del mismo cliente: coincidencia exacta primero", () => {
  const p = clientesParecidos("Procesadora De Granos Maguana, S.R.L.", CLIENTES);
  expect(p[0].cliente.id).toBe("maguana");
  expect(p[0].exacta).toBe(true);
});

test("IFZ COMERCIAL, S.R.L. no se parece a ningún cliente registrado", () => {
  expect(clientesParecidos("IFZ COMERCIAL, S.R.L.", CLIENTES)).toHaveLength(0);
});

test("remitente: correo registrado en la ficha del cliente", () => {
  const r = clientesDelRemitente("importaciones@lasanjuanera.com.do", CLIENTES);
  expect(r.map((x) => [x.cliente.id, x.por])).toEqual([["maguana", "correo"]]);
});

test("remitente con correo compartido por varios clientes: todos como opciones", () => {
  expect(clientesDelRemitente("mdelosantos@bioagro-int.com", CLIENTES).map((x) => x.cliente.id)).toEqual(["bioagro", "bioquimica"]);
});

test("remitente de un correo público no se asocia por dominio", () => {
  expect(clientesDelRemitente("otra.persona@gmail.com", CLIENTES)).toHaveLength(0);
});

test("asunto: cliente mencionado por su palabra distintiva", () => {
  expect(clientesEnAsunto("HACER VUCE PROFORMA 52073 Maguana / Cranberry Beans", CLIENTES).map((c) => c.id)).toEqual(["maguana"]);
  expect(clientesEnAsunto("HACER VUCE POR IFZ COMERCIAL HAB. NEGRAS", CLIENTES)).toHaveLength(0);
});

test("nombre sugerido por asunto/cuerpo se toma del aviso guardado", () => {
  expect(nombreAsuntoCuerpo(["Cliente: verificar: el asunto/cuerpo sugiere un valor distinto (Madelys Gerónimo); se usó el del documento adjunto (IFZ COMERCIAL, S.R.L.)"])).toBe("Madelys Gerónimo");
});

test("La Sanjuanera frente a IFZ COMERCIAL: empresas distintas y ambas opciones", () => {
  const a = analizarClienteCorreo({
    cliente_id: null, cliente_nombre: "IFZ COMERCIAL, S.R.L.", remitente_correo: "importaciones@lasanjuanera.com.do",
    asunto: "HACER VUCE POR IFZ COMERCIAL HAB. NEGRAS", advertencias: [],
  }, CLIENTES);
  expect(a.documento.coincidencia).toBe(null);
  expect(a.asunto.mencionaDocumento).toBe(true);
  expect(a.empresasDistintas).toBe(true);
  expect(a.opciones.map((o) => [o.fuente, o.cliente?.id ?? null])).toEqual([["documento", null], ["remitente", "maguana"]]);
});

test("documento y remitente del mismo cliente: no hay conflicto", () => {
  const a = analizarClienteCorreo({
    cliente_id: "maguana", cliente_nombre: "PROCESADORA DE GRANOS MAGUANA, S.R.L.", remitente_correo: "importaciones@lasanjuanera.com.do", asunto: "", advertencias: [],
  }, CLIENTES);
  expect(a.empresasDistintas).toBe(false);
  expect(a.opciones).toHaveLength(1);
});

test("nombre propuesto para crear el cliente sigue el estilo del catálogo", () => {
  expect(nombreParaCatalogo("IFZ COMERCIAL, S.R.L.")).toBe("IFZ COMERCIAL SRL");
  expect(nombreParaCatalogo("Sadoca Trading, S.A.S.")).toBe("SADOCA TRADING SAS");
  expect(nombreParaCatalogo("Pinturas Popular, S.A.")).toBe("PINTURAS POPULAR SA");
});
