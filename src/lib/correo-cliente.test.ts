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

import { avisoInformativoCorreo, clienteAlRecibirCorreo, expedientesInexistentes, motivoSinAvisoInformativo } from "./correo-cliente";

const SANJUANERA = "importaciones@lasanjuanera.com.do";
const CON_IFZ = [...CLIENTES, { id: "ifz", nombre: "IFZ COMERCIAL SRL", email: null }];
const RECORDADO_IFZ = [{ correo: SANJUANERA, cliente_id: "ifz", empresa_documento: "IFZ COMERCIAL" }];

test("al recibir: el documento identifica con la comparación flexible del Expediente", () => {
  expect(clienteAlRecibirCorreo("Procesadora De Granos Maguana, S.R.L.", SANJUANERA, CLIENTES, [])).toEqual({ cliente: CLIENTES[0], por: "documento" });
});

test("al recibir: el remitente solo no identifica al cliente", () => {
  expect(clienteAlRecibirCorreo("IFZ COMERCIAL, S.R.L.", SANJUANERA, CLIENTES, [])).toBe(null);
});

test("al recibir: mismas palabras en otro orden no identifican (requiere elección)", () => {
  expect(clienteAlRecibirCorreo("Granos Maguana Procesadora SRL", SANJUANERA, CLIENTES, [])).toBe(null);
  expect(clientesParecidos("Granos Maguana Procesadora SRL", CLIENTES)[0].cliente.id).toBe("maguana");
});

test("al recibir: decisión recordada para el mismo remitente y la misma empresa del documento", () => {
  const otraFicha = [...CLIENTES, { id: "ifz", nombre: "IFZ DOMINICANA SRL", email: null }];
  expect(clienteAlRecibirCorreo("IFZ Comercial, S.R.L.", "Departamento <Importaciones@LaSanjuanera.com.do>", otraFicha, RECORDADO_IFZ)?.por).toBe("recordado");
  expect(clienteAlRecibirCorreo("IFZ Comercial, S.R.L.", "otro@lasanjuanera.com.do", otraFicha, RECORDADO_IFZ)).toBe(null);
  expect(clienteAlRecibirCorreo("OTRA EMPRESA SRL", SANJUANERA, otraFicha, RECORDADO_IFZ)).toBe(null);
});

test("correo asociado a dos empresas relacionadas: sin conflicto y cliente del documento primero", () => {
  const a = analizarClienteCorreo({ cliente_id: "ifz", cliente_nombre: "IFZ COMERCIAL, S.R.L.", remitente_correo: SANJUANERA, asunto: "", advertencias: [] }, CON_IFZ, RECORDADO_IFZ);
  expect(a.empresasDistintas).toBe(false);
  expect(a.remitente.clientes.map((r) => [r.cliente.id, r.por])).toEqual([["maguana", "correo"], ["ifz", "asociado"]]);
  expect(a.opciones[0].cliente?.id).toBe("ifz");
});

test("sin decisión recordada: documento y remitente distintos se ofrecen ambos para elegir", () => {
  const a = analizarClienteCorreo({ cliente_id: "ifz", cliente_nombre: "IFZ COMERCIAL, S.R.L.", remitente_correo: SANJUANERA, asunto: "", advertencias: [] }, CON_IFZ, []);
  expect(a.empresasDistintas).toBe(true);
  expect(a.opciones.map((o) => [o.fuente, o.cliente?.id])).toEqual([["documento", "ifz"], ["remitente", "maguana"]]);
});

test("Expediente del asunto que no existe: aviso informativo, no alerta ni parte del «creada»", () => {
  const aviso = "El asunto menciona el Expediente 202610I380, que no existe en la plataforma.";
  expect(avisoInformativoCorreo(aviso)).toBe(true);
  expect(avisoInformativoCorreo("Cliente: verificar: el asunto/cuerpo sugiere un valor distinto (X); se usó el del documento adjunto (Y)")).toBe(false);
  expect(expedientesInexistentes([aviso])).toEqual({ origen: "asunto", numeros: "202610I380" });
  expect(motivoSinAvisoInformativo(`Solicitud nueva creada: 2 documentos de importación. ${aviso}`)).toBe("Solicitud nueva creada: 2 documentos de importación");
});
