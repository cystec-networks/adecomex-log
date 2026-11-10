import { describe, expect, it } from "vitest";
import { AVISO_POSIBLE_SEGUIMIENTO, claveCorreo, decidirCorreoSinExpediente, esDocumentoAdjunto, extraerNumeroVuce, extraerNumerosExpediente, normalizarBl, numerosExpedienteCorreo, propuestasParaExpediente, remitenteCorresponde } from "./correo-expediente";

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
  const MACE = "DOCUMENTOS IMPORTACIÓN MACE\nAdjunto documentos importación Mace de UPL, para Agrodetalles.\nNúmero de trámite VUCE TRM-1126-2587885.\nFecha de llegada 11/011/2026";
  const base = { esSolicitudNueva: false, dudaIa: false, motivoIa: "Remite documentos con trámite VUCE ya identificado", documentos: 0, adjuntosRecibidos: 0, texto: "Gracias, recibido." };

  it("un correo con documentos de importación adjuntos nunca se descarta: crea solicitud con «Posible seguimiento»", () => {
    const d = decidirCorreoSinExpediente({ ...base, documentos: 3, adjuntosRecibidos: 3, texto: MACE });
    expect(d.descartar).toBe(false);
    expect(!d.descartar && d.avisos[0]?.startsWith(AVISO_POSIBLE_SEGUIMIENTO)).toBe(true);
  });
  it("si el correo anuncia adjuntos que no llegaron (caso MACE real), no se descarta", () => {
    const d = decidirCorreoSinExpediente({ ...base, texto: MACE });
    expect(d.descartar).toBe(false);
  });
  it("aunque la IA la vea como solicitud nueva, avisa de los adjuntos anunciados que no llegaron", () => {
    const d = decidirCorreoSinExpediente({ ...base, esSolicitudNueva: true, texto: MACE });
    expect(!d.descartar && d.avisos.some((a) => a.includes("no llegó ningún archivo"))).toBe(true);
  });
  it("si Gmail tenía más adjuntos que los recibidos, no se descarta", () => {
    expect(decidirCorreoSinExpediente({ ...base, adjuntosEnGmail: 4 }).descartar).toBe(false);
  });
  it("si la IA duda entre seguimiento y solicitud nueva, se crea con aviso", () => {
    const d = decidirCorreoSinExpediente({ ...base, dudaIa: true });
    expect(!d.descartar && d.avisos[0]?.startsWith(AVISO_POSIBLE_SEGUIMIENTO)).toBe(true);
  });
  it("solo se descarta sin documentos, sin adjuntos anunciados y sin dudas", () => {
    const d = decidirCorreoSinExpediente(base);
    expect(d.descartar).toBe(true);
  });
  it("crear desde el registro nunca descarta", () => {
    expect(decidirCorreoSinExpediente({ ...base, forzado: true }).descartar).toBe(false);
  });
  it("un logo de firma no cuenta como documento; un PDF o un escaneo sí", () => {
    expect(esDocumentoAdjunto({ nombre: "image001.png", mime: "image/png", bytes: 4_000 })).toBe(false);
    expect(esDocumentoAdjunto({ nombre: "factura.jpg", mime: "image/jpeg", bytes: 350_000 })).toBe(true);
    expect(esDocumentoAdjunto({ nombre: "BL.pdf", mime: "application/pdf", bytes: 1_000 })).toBe(true);
    expect(esDocumentoAdjunto({ nombre: "packing.xlsx", mime: "application/octet-stream", bytes: 9_000 })).toBe(true);
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
