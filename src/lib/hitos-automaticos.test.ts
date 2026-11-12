import { describe, expect, it } from "vitest";
import { esHitoAutomatico, etiquetaHitoAutomatico, notaHitoAutomatico, PARCHE_EDICION_MANUAL, textoHitoAutomatico } from "./hitos-automaticos";
import { describirAuditoria } from "./documento-versiones";

// Fechas sin hora se guardan al mediodía de Santo Domingo (16:00 UTC).
const DIA = "2026-10-16T16:00:00Z";

describe("hitos automáticos del Checklist", () => {
  it("hito 2: la fecha del PDF VUCE se muestra como solicitud registrada, sin hora", () => {
    expect(textoHitoAutomatico({ auto_origen: "vuce_pdf", auto_fecha: DIA, auto_detalle: { permiso: "TRM-1026-2561110" } }))
      .toBe("Solicitud registrada en VUCE el 16/10/2026 (PDF del permiso TRM-1026-2561110)");
    expect(textoHitoAutomatico({ auto_origen: "vuce_ficha", auto_fecha: DIA, auto_detalle: { permiso: "TRM-1" } }))
      .toBe("Fecha de Solicitud de la ficha del permiso TRM-1: 16/10/2026");
    expect(textoHitoAutomatico({ auto_origen: "vuce_carga", auto_fecha: "2026-10-16T13:30:00Z", auto_detalle: { codigo_siga: "PER-001" } }))
      .toBe("PDF del permiso VUCE (PER-001) cargado el 16/10/2026 09:30");
    expect(etiquetaHitoAutomatico({ auto_origen: "vuce_pdf" })).toBe("Automático");
  });

  it("hito 4: etiqueta «Correo preparado» y aclara que no confirma el envío", () => {
    const h = { auto_origen: "correo_dga", auto_fecha: "2026-11-12T19:10:00Z", auto_detalle: { usuario: "Francisco López" } };
    expect(etiquetaHitoAutomatico(h)).toBe("Correo preparado");
    expect(textoHitoAutomatico(h)).toBe("Correo a DGA preparado el 12/11/2026 15:10 por Francisco López");
    expect(notaHitoAutomatico(h)).toContain("no confirma");
  });

  it("hito 7: muestra el gestor elegido y quién registró el envío", () => {
    expect(textoHitoAutomatico({ auto_origen: "gestor", auto_fecha: "2026-11-12T19:10:00Z", auto_detalle: { gestor: "MARCOS BERAS", usuario: "Ana" } }))
      .toBe("Enviado al gestor MARCOS BERAS el 12/11/2026 15:10 · registrado por Ana");
    expect(etiquetaHitoAutomatico({ auto_origen: "gestor" })).toBe("Automático");
  });

  it("hito 8: etiqueta «Emisión e-CF» con el e-NCF y la fecha de emisión", () => {
    const h = { auto_origen: "ecf", auto_fecha: DIA, auto_detalle: { encf: "E310000000123" } };
    expect(etiquetaHitoAutomatico(h)).toBe("Emisión e-CF");
    expect(textoHitoAutomatico(h)).toBe("Emisión de la e-CF E310000000123 el 16/10/2026");
  });

  it("una fecha manual nunca lleva etiqueta y editar a mano borra el origen automático", () => {
    expect(esHitoAutomatico({ auto_origen: "manual", auto_fecha: null })).toBe(false);
    expect(esHitoAutomatico({ auto_origen: "ecf", auto_fecha: DIA })).toBe(true);
    expect(PARCHE_EDICION_MANUAL).toMatchObject({ auto_origen: "manual", auto_fecha: null, auto_detalle: null, auto_ref_id: null });
  });

  it("Auditoría describe la fecha automática y el envío al gestor", () => {
    expect(describirAuditoria({ entidad: "expedientes", accion: "hito_automatico", cambios: { nombre: "Factura de venta enviada al cliente", fecha: "2026-10-16", origen: "ecf" } }))
      .toBe("Fecha automática del hito «Factura de venta enviada al cliente»: 16/10/2026 · emisión e-CF");
    expect(describirAuditoria({ entidad: "expedientes", accion: "enviado_gestor", cambios: { gestor: "MARCOS BERAS" } }))
      .toBe("Expediente enviado al gestor MARCOS BERAS");
  });
});
