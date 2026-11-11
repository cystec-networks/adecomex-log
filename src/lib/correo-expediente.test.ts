import { describe, expect, it } from "vitest";
import { AVISO_CREADA_MANUAL, claveCorreo, decidirCorreo, esDocumentoImportacion, esPdfAdjunto, extraerNumeroVuce, normalizarPatronRemitente, pdfsFaltantes, remitenteIgnorado, extraerNumerosExpediente, normalizarBl, numerosExpedienteCorreo, propuestasParaExpediente, remitenteCorresponde } from "./correo-expediente";

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

describe("solo PDF de importación crean solicitud", () => {
  const TIPOS = ["Factura comercial", "Packing list", "Bill of Lading", "Permiso VUCE previo"];
  const base = { pdfs: 0, documentos: null as number | null };

  it("solo cuentan los PDF: imágenes, capturas y logos de firma no", () => {
    expect(esPdfAdjunto({ nombre: "image001.png", mime: "image/png" })).toBe(false);
    expect(esPdfAdjunto({ nombre: "captura.jpg", mime: "image/jpeg" })).toBe(false);
    expect(esPdfAdjunto({ nombre: "packing.xlsx", mime: "application/octet-stream" })).toBe(false);
    expect(esPdfAdjunto({ nombre: "BL.PDF", mime: "" })).toBe(true);
    expect(esPdfAdjunto({ nombre: "documento", mime: "application/pdf" })).toBe(true);
  });
  it("«Otros documentos» no es documento de importación; Permiso VUCE previo sí", () => {
    expect(esDocumentoImportacion({ tipo: "Otro" }, TIPOS)).toBe(false);
    expect(esDocumentoImportacion({ tipo: null }, TIPOS)).toBe(false);
    expect(esDocumentoImportacion({ tipo: "Permiso VUCE previo" }, TIPOS)).toBe(true);
    expect(esDocumentoImportacion({ tipo: "Otro", combinado: { paginas: 12 } }, TIPOS)).toBe(true);
  });
  it("ticket DPH, respuesta DGA o confirmación con imagen (sin PDF) se descartan", () => {
    const d = decidirCorreo({ ...base });
    expect(d.accion).toBe("descartar");
  });
  it("estado de cuenta en PDF clasificado «Otro» se descarta con su motivo", () => {
    const d = decidirCorreo({ pdfs: 1, documentos: 0, otros: ["ESTADO DE CUENTA.pdf"] });
    expect(d.accion === "descartar" && d.motivo.includes("Otros documentos")).toBe(true);
  });
  it("MACE nuevo con PDF de importación (aunque traiga trámite VUCE no registrado) crea solicitud", () => {
    expect(decidirCorreo({ pdfs: 3, documentos: null }).accion).toBe("leer");
    expect(decidirCorreo({ pdfs: 3, documentos: 2 })).toEqual({ accion: "crear", avisos: [] });
  });
  it("correo del Expediente 202610I358 con PDF de importación se adjunta, nunca crea solicitud", () => {
    expect(decidirCorreo({ pdfs: 2, documentos: 2, expediente: "202610I358" }).accion).toBe("adjuntar");
  });
  it("correo de un Expediente sin documentos de importación se descarta sin tocarlo", () => {
    const d = decidirCorreo({ pdfs: 0, documentos: null, expediente: "202610I358" });
    expect(d.accion === "descartar" && d.motivo.includes("no se agregó nada")).toBe(true);
    expect(decidirCorreo({ pdfs: 1, documentos: 0, expediente: "202610I358" }).accion).toBe("descartar");
  });
  it("remitente ignorado se descarta aunque traiga PDF", () => {
    const d = decidirCorreo({ pdfs: 2, documentos: null, ignorado: "dph.com.do" });
    expect(d.accion === "descartar" && d.motivo.includes("dph.com.do")).toBe(true);
  });
  it("PDF que Gmail tenía y no llegaron: error, nunca descarte", () => {
    const faltantes = pdfsFaltantes({ pdfsEnGmail: 3, pdfsRecibidos: 0, omitidos: [] });
    expect(faltantes?.reintentar).toBe(true);
    expect(decidirCorreo({ pdfs: 0, documentos: null, faltantes }).accion).toBe("error");
  });
  it("un PDF omitido por tamaño no se reintenta (volvería a omitirse), pero tampoco se descarta", () => {
    const f = pdfsFaltantes({ pdfsEnGmail: 2, pdfsRecibidos: 1, omitidos: [{ nombre: "BL.pdf", motivo: "supera 15 MB" }] });
    expect(f?.reintentar).toBe(false);
    expect(pdfsFaltantes({ pdfsEnGmail: null, pdfsRecibidos: 1, omitidos: [{ nombre: "BL.pdf", motivo: "base64 inválido", buzon: false }] })?.reintentar).toBe(true);
    expect(pdfsFaltantes({ pdfsEnGmail: null, pdfsRecibidos: 0, omitidos: [{ nombre: "logo.png", motivo: "pequeño" }] })).toBeNull();
    expect(pdfsFaltantes({ pdfsEnGmail: 2, pdfsRecibidos: 2, omitidos: [] })).toBeNull();
  });
  it("un PDF ilegible sin otros documentos se reintenta en vez de descartarse", () => {
    expect(decidirCorreo({ pdfs: 1, documentos: 0, ilegibles: ["BL.pdf"] }).accion).toBe("error");
  });
  it("crear desde el registro: lee los PDF y nunca descarta", () => {
    expect(decidirCorreo({ forzado: true, pdfs: 1, documentos: null, ignorado: "dph.com.do" }).accion).toBe("leer");
    expect(decidirCorreo({ forzado: true, pdfs: 0, documentos: null })).toEqual({ accion: "crear", avisos: [AVISO_CREADA_MANUAL] });
  });
});

describe("remitentes ignorados", () => {
  const catalogo = ["dph.com.do", "aduanas.gob.do", "avisos@naviera.com"];
  it("coincide dominio y subdominios, no dominios parecidos", () => {
    expect(remitenteIgnorado("tickets@dph.com.do", catalogo)).toBe("dph.com.do");
    expect(remitenteIgnorado("no-reply@sistema.aduanas.gob.do", catalogo)).toBe("aduanas.gob.do");
    expect(remitenteIgnorado("ventas@nodph.com.do", catalogo)).toBeNull();
    expect(remitenteIgnorado("avisos@naviera.com", catalogo)).toBe("avisos@naviera.com");
    expect(remitenteIgnorado("ventas@naviera.com", catalogo)).toBeNull();
  });
  it("normaliza lo escrito en el catálogo", () => {
    expect(normalizarPatronRemitente(" @DPH.com.do ")).toBe("dph.com.do");
    expect(normalizarPatronRemitente("https://www.aduanas.gob.do/x")).toBe("aduanas.gob.do");
    expect(normalizarPatronRemitente("Persona@Banco.com")).toBe("persona@banco.com");
    expect(normalizarPatronRemitente("banco")).toBeNull();
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
