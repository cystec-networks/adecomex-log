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

  it("hito 3: Certificado de Origen DGA con código, hora de subida y quién lo originó", () => {
    const h = { auto_origen: "certificado_dga", auto_fecha: "2026-10-26T02:39:00Z", auto_detalle: { codigo_siga: "CEO-002", evento: "subido", usuario: "Correo automático" } };
    expect(esHitoAutomatico(h)).toBe(true);
    expect(etiquetaHitoAutomatico(h)).toBe("Automático");
    // Hora real de subida en Santo Domingo: 25/10 22:39, no el día UTC.
    expect(textoHitoAutomatico(h)).toBe("Certificado de Origen DGA (CEO-002) subido el 25/10/2026 22:39 por Correo automático");
    expect(textoHitoAutomatico({ ...h, auto_detalle: { evento: "marcado_recibido", usuario: "Ana" } }))
      .toBe("Certificado de Origen DGA marcado recibido el 25/10/2026 22:39 por Ana");
  });

  it("Auditoría: autocompletado del hito 3 y documento eliminado sin borrar la fecha", () => {
    expect(describirAuditoria({ entidad: "expedientes", accion: "hito_automatico", cambios: { nombre: "Preferencia arancelaria presentada en SIGA (si aplica)", fecha: "2026-10-25", origen: "certificado_dga", detalle: { codigo_siga: "CEO-002", usuario: "Francisco López" } } }))
      .toBe("Fecha automática del hito «Preferencia arancelaria presentada en SIGA (si aplica)»: 25/10/2026 · Certificado de Origen DGA (CEO-002) · Francisco López");
    expect(describirAuditoria({ entidad: "expedientes", accion: "hito_documento_origen_eliminado", cambios: { nombre: "Preferencia arancelaria presentada en SIGA (si aplica)", fecha: "2026-10-25", tipo: "Certificado de Origen DGA", codigo_siga: "CEO-002", motivo: "eliminado" } }))
      .toBe("Certificado de Origen DGA (CEO-002) se eliminó; la fecha del hito «Preferencia arancelaria presentada en SIGA (si aplica)» (25/10/2026) se conserva");
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
