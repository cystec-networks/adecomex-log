import { describe, expect, it } from "vitest";
import { desgloseCandidatos, ejemplosCandidatos, fuenteCandidato, type CandidatoHito } from "./hitos-lote";
import { notaHitoAutomatico } from "./hitos-automaticos";
import { describirAuditoria } from "./documento-versiones";

const c = (numero: string, hito_codigo: string, estado_expediente: string, origen = "ecf", detalle: unknown = {}): CandidatoHito =>
  ({ hito_id: `${numero}-${hito_codigo}`, expediente_id: numero, numero, estado_expediente, hito_codigo, origen, evento_fecha: "2026-11-11T16:00:00Z", fecha: "2026-11-11", detalle, fecha_programada: null });

describe("lote retroactivo de hitos", () => {
  it("desglosa por hito y por estado del Expediente", () => {
    const d = desgloseCandidatos([c("A", "factura_venta_enviada", "facturar"), c("B", "factura_venta_enviada", "presentar"), c("C", "documentos_recibidos", "facturar", "documentos")]);
    expect(d.total).toBe(3);
    expect(d.filas.find((f) => f.hito === "factura_venta_enviada")).toMatchObject({ total: 2, porEstado: { facturar: 1, presentar: 1 } });
    expect(d.filas.find((f) => f.hito === "documentos_recibidos")?.total).toBe(1);
  });

  it("muestra hasta 10 ejemplos por hito, los más recientes primero", () => {
    const muchos = Array.from({ length: 12 }, (_, i) => c(`2026${String(i).padStart(2, "0")}`, "solicitud_oficio_dga", "facturar", "correo_dga"));
    const ej = ejemplosCandidatos(muchos);
    expect(ej).toHaveLength(10);
    expect(ej[0].numero).toBe("202611");
  });

  it("explica de dónde sale cada fecha", () => {
    expect(fuenteCandidato({ origen: "vuce_ficha", detalle: { permiso: "TRM-1" } })).toBe("Fecha de Solicitud de la ficha · TRM-1");
    expect(fuenteCandidato({ origen: "ecf", detalle: { encf: "E310000000405" } })).toBe("Emisión e-CF · E310000000405");
  });

  it("las fechas del lote llevan la nota «completado retroactivamente» en la etiqueta y en Auditoría", () => {
    expect(notaHitoAutomatico({ auto_origen: "documentos", auto_detalle: { retroactivo: true } })).toBe("Completado retroactivamente.");
    expect(describirAuditoria({ entidad: "expedientes", accion: "hito_automatico", cambios: { nombre: "Documentos digitales recibidos", fecha: "2026-10-28", origen: "documentos", detalle: { retroactivo: true } } }))
      .toBe("Fecha automática del hito «Documentos digitales recibidos»: 28/10/2026 · primera carga de documentos (completado retroactivamente)");
  });
});
