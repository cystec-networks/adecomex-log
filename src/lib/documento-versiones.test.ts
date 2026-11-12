import { describe, expect, it } from "vitest";
import { describirAuditoria, etiquetaActualizado, fmtFechaHora, fueReemplazado, tooltipActualizado } from "./documento-versiones";

describe("documento-versiones", () => {
  it("formatea la última actualización como dd/mm/aaaa hh:mm en hora de Santo Domingo", () => {
    // 16:05 UTC = 12:05 en Santo Domingo (UTC-4)
    expect(fmtFechaHora("2026-11-12T16:05:00Z")).toBe("12/11/2026 12:05");
    expect(etiquetaActualizado({ actualizado_en: "2026-11-12T03:30:00Z" })).toBe("Actualizado 11/11/2026 23:30");
  });

  it("solo los documentos reemplazados muestran la etiqueta", () => {
    expect(fueReemplazado({ actualizado_en: null })).toBe(false);
    expect(fueReemplazado({ actualizado_en: "2026-11-12T16:05:00Z" })).toBe(true);
  });

  it("el tooltip indica quién reemplazó y si vino de un correo", () => {
    const doc = { actualizado_en: "2026-11-12T16:05:00Z", actualizado_por: "u1", actualizado_origen: "correo" };
    expect(tooltipActualizado(doc, { u1: "Ana Pérez" })).toBe("Reemplazado por Ana Pérez (desde correo) el 12/11/2026 12:05");
  });

  it("la Bitácora describe el reemplazo con documento y código SIGA", () => {
    expect(describirAuditoria({ entidad: "documentos", accion: "documento_reemplazado", cambios: { tipo: "Bill of Lading", codigo_siga: "BL-001", origen: "manual" } }))
      .toBe("Documento reemplazado: Bill of Lading (BL-001)");
    expect(describirAuditoria({ entidad: "expedientes", accion: "editado" })).toBe("editado");
  });
});
