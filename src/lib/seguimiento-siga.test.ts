import { describe, expect, it } from "vitest";
import { coincideBlHijo, decidirSeguimientoSiga, diferenciasAlertaSiga, esAutomaticoSiga, fechaHoraSiga, leerSeguimientoSiga, resolverAreaSiga, validarSeguimientoSiga, type SeguimientoSiga } from "./seguimiento-siga";

const TEXTO = `--- Página 1 ---
DIRECCION GENERAL DE ADUANAS
Estado de Desaduanización
Doc.Embarque Hijo: | HBLIWF10012026 | Doc.Embarque Madre: | MEDUXX772205
No. Control de Carga: | 10150-CC01-2611-000321 | Fecha de Llegada: | 10/11/2026 14:35
Buque: | MSC ANNA | Viaje: | NA645R | Bandera: | PANAMA
Empresa Transportista: | MEDITERRANEAN SHIPPING COMPANY
Terminal/Localización: | DP WORLD CAUCEDO | Administración: | ADMINISTRACION MULTIMODAL CAUCEDO
Consignatario: | AGROLACTEOS IMANFA SRL | RNC: | 130123456
Puerto de Desembarque: | DOCAU - CAUCEDO
Peso Bruto (KG): | 1,980.50 | Cantidad de Bultos: | 40
Descripción: | LECHE DESCREMADA EN POLVO
Proceso | No. Solicitud | Fecha | Estado
Manifiesto Madre | 10150-MA01-2611-000111 | 09/11/2026 08:10 | Aprobado
Manifiesto Consolidado | 10150-MC01-2611-000222 | 09/11/2026 09:30 | Aprobado
Entrada | 10150-EN01-2611-000333 | 10/11/2026 15:00 | Registrado
Transportación | 10150-TR01-2611-000444 | 11/11/2026 07:45 | Pendiente`;

describe("Seguimiento SIGA: lectura con reglas fijas", () => {
  const d = leerSeguimientoSiga(TEXTO)!;
  it("separa BL hijo y BL madre", () => { expect(d.bl_hijo).toBe("HBLIWF10012026"); expect(d.bl_madre).toBe("MEDUXX772205"); });
  it("lee llegada con hora local", () => expect(d.fecha_llegada).toBe("2026-11-10T14:35"));
  it("lee datos del bloque SIGA", () => {
    expect(d.control_carga).toBe("10150-CC01-2611-000321");
    expect(d.buque).toBe("MSC ANNA"); expect(d.viaje).toBe("NA645R"); expect(d.bandera).toBe("PANAMA");
    expect(d.empresa_transportista).toBe("MEDITERRANEAN SHIPPING COMPANY");
    expect(d.terminal).toBe("DP WORLD CAUCEDO"); expect(d.administracion).toBe("ADMINISTRACION MULTIMODAL CAUCEDO");
  });
  it("lee peso, bultos, cliente y puerto", () => {
    expect(d.peso_bruto).toBe(1980.5); expect(d.bultos).toBe(40);
    expect(d.consignatario).toBe("AGROLACTEOS IMANFA SRL"); expect(d.consignatario_rnc).toBe("130123456");
    expect(d.puerto_desembarque).toBe("DOCAU - CAUCEDO");
  });
  it("lee los cuatro procesos con número y fecha", () => {
    expect(d.procesos.map((p) => [p.proceso, p.numero_solicitud, p.fecha])).toEqual([
      ["manifiesto_madre", "10150-MA01-2611-000111", "2026-11-09T08:10"],
      ["manifiesto_consolidado", "10150-MC01-2611-000222", "2026-11-09T09:30"],
      ["entrada", "10150-EN01-2611-000333", "2026-11-10T15:00"],
      ["transportacion", "10150-TR01-2611-000444", "2026-11-11T07:45"],
    ]);
  });
  it("sin BL hijo no hay lectura (decide el respaldo)", () => expect(leerSeguimientoSiga(TEXTO.replace(/Doc\.Embarque Hijo: \| HBLIWF10012026 \| /, ""))).toBeNull());
  it("otro documento no se lee", () => expect(leerSeguimientoSiga("COMMERCIAL INVOICE\nBuque: X")).toBeNull());
  it("fecha con a.m./p.m.", () => expect(fechaHoraSiga("10/11/2026 02:35 p.m.")).toBe("2026-11-10T14:35"));
});

const base: SeguimientoSiga = { ...leerSeguimientoSiga(TEXTO)! };

describe("Seguimiento SIGA: emparejamiento solo por BL hijo, cliente y puerto", () => {
  const exp = { bl_awb: "HBLIWF10012026", puerto_arribo: "CAUCEDO", puerto_arribo_codigo: "DOCAU" };
  it("acepta cuando BL hijo, cliente y puerto coinciden", () => expect(validarSeguimientoSiga(exp, [{ nombre: "Agrolacteos Imanfa, S.R.L.", rnc: null }], base).ok).toBe(true));
  it("el BL madre nunca empareja (LCL)", () => {
    const v = validarSeguimientoSiga({ ...exp, bl_awb: "MEDUXX772205" }, [{ nombre: "AGROLACTEOS IMANFA SRL" }], base);
    expect(v.ok).toBe(false); expect(v.bl).toBe("no_coincide");
  });
  it("cliente distinto bloquea", () => expect(validarSeguimientoSiga(exp, [{ nombre: "BIOAGRO INTERNACIONAL SRL", rnc: "101000000" }], base).ok).toBe(false));
  it("el cliente endosado también vale", () => expect(validarSeguimientoSiga(exp, [{ nombre: "BIOAGRO SRL" }, { nombre: "OTRA", rnc: "130123456" }], base).cliente).toBe("coincide"));
  it("puerto distinto bloquea", () => expect(validarSeguimientoSiga({ ...exp, puerto_arribo: "HAINA ORIENTAL", puerto_arribo_codigo: "DOHAI" }, [{ nombre: "AGROLACTEOS IMANFA" }], base).ok).toBe(false));
  it("BL con espacios o varios BL", () => { expect(coincideBlHijo("HBL IWF-10012026", "HBLIWF10012026")).toBe(true); expect(coincideBlHijo("MEDU1 / HBLIWF10012026", "HBLIWF10012026")).toBe(true); });
});

describe("Seguimiento SIGA: solo completa vacíos y avisa diferencias", () => {
  it("completa llegada (con hora), datos SIGA, peso y bultos vacíos", () => {
    const d = decidirSeguimientoSiga({ estado: "en_transito" }, base);
    expect(d.cambios).toMatchObject({ fecha_llegada_real: "2026-11-10", siga_fecha_llegada: "2026-11-10T14:35:00-04:00", siga_control_carga: "10150-CC01-2611-000321", siga_bl_madre: "MEDUXX772205", peso_bruto: 1980.5, cantidad_bultos: 40 });
    expect(d.sugerirEstado).toBe("manifestado");
  });
  it("nunca toca Naviera ni descripción", () => {
    const d = decidirSeguimientoSiga({ naviera: "", descripcion_mercancia: "" }, base);
    expect(d.cambios).not.toHaveProperty("naviera"); expect(d.cambios).not.toHaveProperty("descripcion_mercancia");
  });
  it("no sobrescribe manuales y avisa diferencias de llegada, peso, bultos y descripción", () => {
    const exp = { fecha_llegada_real: "2026-11-09", peso_bruto: 2000, cantidad_bultos: 41, descripcion_mercancia: "FUNDAS DE QUESO", siga_buque: "MSC ANNA" };
    const d = decidirSeguimientoSiga(exp, base);
    expect(d.cambios).not.toHaveProperty("fecha_llegada_real"); expect(d.cambios).not.toHaveProperty("peso_bruto");
    expect(d.cambios).not.toHaveProperty("cantidad_bultos"); expect(d.cambios).not.toHaveProperty("siga_buque");
    expect(diferenciasAlertaSiga(exp, base).map((x) => x.campo)).toEqual(["fecha_llegada_real", "peso_bruto", "cantidad_bultos", "descripcion_mercancia"]);
  });
  it("no sugiere etapa si ya pasó de En tránsito", () => expect(decidirSeguimientoSiga({ estado: "presentar", fecha_llegada_real: "2026-11-10" }, base).sugerirEstado).toBeNull());
  it("Administración alimenta el Área solo con coincidencia única del catálogo", () => {
    const areas = [{ area: "ADMINISTRACION MULTIMODAL CAUCEDO", codigo: "10150" }, { area: "ADMINISTRACION HAINA ORIENTAL", codigo: "10030" }];
    expect(resolverAreaSiga("ADMINISTRACION MULTIMODAL CAUCEDO", areas)).toEqual({ nombre: "ADMINISTRACION MULTIMODAL CAUCEDO", codigo: "10150" });
    expect(resolverAreaSiga("CAUCEDO", areas)).toBeNull();
  });
  it("etiqueta Automático (SIGA) desaparece si el usuario cambia el valor", () => {
    const exp = { peso_bruto: 1980.5, siga_auto: { peso_bruto: { valor: 1980.5 } } };
    expect(esAutomaticoSiga(exp, "peso_bruto")).toBe(true);
    expect(esAutomaticoSiga(exp, "peso_bruto", "2000")).toBe(false);
  });
});

import { tipoAdjuntoCorreo, TIPOS_ADJUNTO_CORREO, TIPOS_SOLO_EXPEDIENTE_CORREO } from "./correo-solicitud";
import { tipoPorEncabezado } from "./lectura-texto";
import { buildImportDUAXml } from "./siga-xml";
import { TIPO_SEGUIMIENTO_SIGA } from "./seguimiento-siga";

describe("Seguimiento SIGA por correo y en el XML de la DUA", () => {
  it("se reconoce por el título sin IA", () => expect(tipoPorEncabezado(TEXTO)).toBe(TIPO_SEGUIMIENTO_SIGA));
  it("solo va a un Expediente existente; nunca crea solicitud", () => {
    expect(TIPOS_SOLO_EXPEDIENTE_CORREO.includes(TIPO_SEGUIMIENTO_SIGA)).toBe(true);
    expect((TIPOS_ADJUNTO_CORREO as readonly string[]).includes(TIPO_SEGUIMIENTO_SIGA)).toBe(false);
    expect(tipoAdjuntoCorreo("Estado de Desaduanización")).toBe(TIPO_SEGUIMIENTO_SIGA);
  });
  it("el XML usa No. Control de Carga (CargoControlNo) y BL madre (ManifestNo)", () => {
    const xml = buildImportDUAXml({ bl_awb: "HBL1", siga_control_carga: "10150-CC01-2611-000321", siga_bl_madre: "MEDUXX772205", clientes: { nombre: "X", rnc: "1" } }, [], {} as never);
    expect(xml).toContain("<CargoControlNo>10150-CC01-2611-000321</CargoControlNo>");
    expect(xml).toContain("<ManifestNo>MEDUXX772205</ManifestNo>");
  });
});
