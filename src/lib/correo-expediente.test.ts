import { describe, expect, it } from "vitest";
import { claveCorreo, conservarPorDocumentos, extraerNumeroVuce, extraerNumerosExpediente, normalizarBl, numerosExpedienteCorreo, propuestasParaExpediente, remitenteCorresponde } from "./correo-expediente";

const ASUNTO = "4 CONT. DE HAB. CRANBERRY Detalles y el PIN TRM-1026-2551297 : REGISTRO #202610I358. : HACER VUCE 2006 - 1 - 2000 QQ HABICHUELAS CRANBERRY- LOMI / MAGUANA";

describe("número de Expediente en el correo", () => {
  it("detecta 202610I358 en el asunto real e ignora PIN y cantidades", () => {
    expect(extraerNumerosExpediente(ASUNTO)).toEqual(["202610I358"]);
  });
  it("acepta prefijos, signos y minúsculas", () => {
    expect(extraerNumerosExpediente("registro:202606i247, ver")).toEqual(["202606I247"]);
    expect(extraerNumerosExpediente("Exp. #202611E012.")).toEqual(["202611E012"]);
  });
  it("no toma números más largos ni meses inválidos", () => {
    expect(extraerNumerosExpediente("1202610I358 y 202613I001")).toEqual([]);
  });
  it("usa el cuerpo solo si el asunto no trae número", () => {
    expect(numerosExpedienteCorreo("HACER VUCE", "Ref. 202610I400", "")).toEqual({ numeros: ["202610I400"], origen: "cuerpo" });
    expect(numerosExpedienteCorreo("REGISTRO 202610I358", "Ref. 202610I400", "")).toEqual({ numeros: ["202610I358"], origen: "asunto" });
  });
});

describe("BL y permiso", () => {
  it("BL con espacio coincide con el guardado sin espacio", () => {
    expect(normalizarBl("SMLU 9221768A")).toBe(normalizarBl("SMLU9221768A"));
  });
  it("extrae el trámite VUCE", () => {
    expect(extraerNumeroVuce(ASUNTO)).toBe("TRM-1026-2551297");
  });
});

describe("remitente del Expediente", () => {
  it("misma dirección del cliente sin distinguir mayúsculas", () => {
    expect(remitenteCorresponde("importaciones@lasanjuanera.com.do", ["importaciones@lasanjuanera.com.do"], []).corresponde).toBe(true);
  });
  it("mismo dominio corporativo corresponde; dominio público no", () => {
    expect(remitenteCorresponde("compras@lasanjuanera.com.do", ["importaciones@lasanjuanera.com.do"], []).corresponde).toBe(true);
    expect(remitenteCorresponde("otro@gmail.com", ["cliente@gmail.com"], []).corresponde).toBe(false);
  });
  it("remitente ajeno no corresponde", () => {
    expect(remitenteCorresponde("x@otraempresa.com", ["importaciones@lasanjuanera.com.do"], []).corresponde).toBe(false);
  });
});

describe("datos propuestos", () => {
  it("propone solo lo que falta y avisa diferencias sin sobrescribir", () => {
    const r = propuestasParaExpediente({ bl_awb: "SMLU9221768A", numero_vuce: null, fecha_llegada_real: null },
      { bl_awb: "SMLU 9221768A", numero_vuce: "TRM-1026-2551297", eta: "2026-11-08" }, "2026-11-10");
    expect(Object.keys(r.propuestas).sort()).toEqual(["fecha_llegada_real", "numero_vuce"]);
    expect(r.advertencias).toEqual([]);
    const d = propuestasParaExpediente({ bl_awb: "AAA111111" }, { bl_awb: "BBB222222" }, "2026-11-10");
    expect(d.propuestas.bl_awb).toBeUndefined();
    expect(d.advertencias).toHaveLength(1);
  });
  it("una ETA futura nunca se propone como llegada", () => {
    expect(propuestasParaExpediente({}, { eta: "2026-12-06" }, "2026-11-10").propuestas.fecha_llegada_real).toBeUndefined();
  });
});

describe("descartes", () => {
  it("documentos de importación adjuntos no se descartan", () => {
    expect(conservarPorDocumentos("DOCUMENTOS IMPORTACIÓN MACE", ["application/pdf"], false)).toBe(true);
    expect(conservarPorDocumentos("Saludos", ["application/pdf"], true)).toBe(true);
    expect(conservarPorDocumentos("Saludos", ["application/pdf"], false)).toBe(false);
    expect(conservarPorDocumentos("DOCUMENTOS", [], true)).toBe(false);
  });
});

describe("identidad del correo", () => {
  it("usa el id de Gmail o una huella estable", async () => {
    expect(await claveCorreo({ id_mensaje: "18f", remitente: "a", asunto: "b", cuerpo: "c", adjuntos: [] })).toBe("gmail:18f");
    const a = await claveCorreo({ remitente: "A@x.com", asunto: "s", cuerpo: "c", adjuntos: ["1.pdf", "2.pdf"] });
    const b = await claveCorreo({ remitente: "a@x.com", asunto: "s", cuerpo: "c", adjuntos: ["2.pdf", "1.pdf"] });
    expect(a).toBe(b);
  });
});
