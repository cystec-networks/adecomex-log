import { describe, expect, it } from "vitest";

import { normalizarClasificacion, novedadEnPanel } from "./novedades-comercio";
import { filtrarNovedadesPanel, ordenarNovedadesPanel, type NovedadPanel } from "./novedades-panel";

// 8 de noviembre de 2026, 11:00 en Santo Domingo.
const HOY = new Date("2026-11-08T15:00:00Z");

describe("novedades relevantes en el Panel", () => {
  it("solo muestra relevancia Alta y Media", () => {
    const base = { fecha_publicacion: "2026-11-07", fecha_captura: "2026-11-07T12:00:00Z" };
    expect(novedadEnPanel({ ...base, relevancia: "Alta" }, HOY, false)).toBe(true);
    expect(novedadEnPanel({ ...base, relevancia: "Media" }, HOY, false)).toBe(true);
    expect(novedadEnPanel({ ...base, relevancia: "Baja" }, HOY, false)).toBe(false);
    expect(novedadEnPanel({ ...base, relevancia: null }, HOY, false)).toBe(false);
  });

  it("cubre los últimos 7 días por fecha de publicación; un aviso viejo recién registrado no aparece", () => {
    const n = (fecha_publicacion: string | null, fecha_captura = "2026-11-08T12:00:00Z") => ({
      relevancia: "Alta",
      fecha_publicacion,
      fecha_captura,
    });
    expect(novedadEnPanel(n("2026-11-01"), HOY, false)).toBe(true);
    expect(novedadEnPanel(n("2026-10-31"), HOY, false)).toBe(false);
    expect(novedadEnPanel(n("2025-03-10"), HOY, false)).toBe(false);
  });

  it("sin fecha de publicación usa el día de registro en hora de Santo Domingo", () => {
    const sinFecha = (fecha_captura: string) => ({ relevancia: "Media", fecha_publicacion: null, fecha_captura });
    expect(novedadEnPanel(sinFecha("2026-11-02T03:00:00Z"), HOY, false)).toBe(true); // 1/11 en RD
    expect(novedadEnPanel(sinFecha("2026-11-01T03:00:00Z"), HOY, false)).toBe(false); // 31/10 en RD
  });

  it("una novedad marcada como vista deja de aparecer", () => {
    expect(
      novedadEnPanel({ relevancia: "Alta", fecha_publicacion: "2026-11-08", fecha_captura: "2026-11-08T12:00:00Z" }, HOY, true),
    ).toBe(false);
  });

  it("ordena Alta antes que Media y luego la más reciente", () => {
    const n = (id: string, relevancia: string, fecha: string): NovedadPanel => ({
      id,
      titulo: id,
      fuente_nombre: "DGA",
      url: `https://x/${id}`,
      fecha_publicacion: fecha,
      fecha_captura: `${fecha}T12:00:00Z`,
      impacto: "Otro",
      sectores: ["General"],
      relevancia,
      enlace_estado: null,
      enlace_es_pdf: null,
      enlace_mensaje: null,
    });
    const r = ordenarNovedadesPanel([n("m1", "Media", "2026-11-08"), n("a1", "Alta", "2026-11-02"), n("a2", "Alta", "2026-11-05")]);
    expect(r.map((x) => x.id)).toEqual(["a2", "a1", "m1"]);
  });

  it("la clasificación de la IA se limita a los catálogos", () => {
    expect(normalizarClasificacion({ impacto: "Tasas", sectores: ["Lácteos", "Inventado", "Lácteos"], relevancia: "Alta" })).toEqual({
      impacto: "Tasas",
      sectores: ["Lácteos"],
      relevancia: "Alta",
    });
    expect(normalizarClasificacion({ impacto: "X", sectores: [], relevancia: "Urgente" })).toEqual({
      impacto: "Otro",
      sectores: ["General"],
      relevancia: "Baja",
    });
  });
});

describe("relevancia del Panel y criterio de «Alta»", () => {
  const n = (id: string, relevancia: string): NovedadPanel => ({
    id,
    titulo: id,
    fuente_nombre: "VUCE",
    url: `https://x/${id}`,
    fecha_publicacion: null,
    fecha_captura: "2026-11-08T12:00:00Z",
    impacto: "Permisos",
    sectores: ["General"],
    relevancia,
    enlace_estado: null,
    enlace_es_pdf: null,
    enlace_mensaje: null,
  });

  it("por defecto solo muestra Alta; con la opción, también Media", () => {
    const lista = [n("a", "Alta"), n("m", "Media")];
    expect(filtrarNovedadesPanel(lista, false).map((x) => x.id)).toEqual(["a"]);
    expect(filtrarNovedadesPanel(lista, true).map((x) => x.id)).toEqual(["a", "m"]);
  });

  const alta = {
    relevancia: "Alta",
    impacto: "Arancel/Impuestos",
    sectores: ["Lácteos"],
    naturaleza: "cambio_obligatorio",
    vigencia: "vigente",
    afecta_sectores_adecomex: true,
  };

  it("conserva Alta para un cambio obligatorio vigente o por entrar en vigor que afecta a los sectores", () => {
    expect(normalizarClasificacion(alta).relevancia).toBe("Alta");
    expect(normalizarClasificacion({ ...alta, vigencia: "por_entrar_en_vigor" }).relevancia).toBe("Alta");
  });

  it("baja a Media un aviso informativo o listado aunque la IA diga Alta", () => {
    expect(normalizarClasificacion({ ...alta, naturaleza: "informativo" }).relevancia).toBe("Media");
  });

  it("baja a Media lo que no está vigente ni por entrar en vigor", () => {
    expect(normalizarClasificacion({ ...alta, vigencia: "sin_aplicacion" }).relevancia).toBe("Media");
  });

  it("baja a Media lo que no afecta a los sectores de ADECOMEX", () => {
    expect(normalizarClasificacion({ ...alta, afecta_sectores_adecomex: false }).relevancia).toBe("Media");
  });

  it("baja a Media si el impacto es «Otro»", () => {
    expect(normalizarClasificacion({ ...alta, impacto: "Otro" }).relevancia).toBe("Media");
  });

  it("no sube nunca la relevancia: Media y Baja se mantienen", () => {
    expect(normalizarClasificacion({ ...alta, relevancia: "Baja" }).relevancia).toBe("Baja");
    expect(normalizarClasificacion({ ...alta, relevancia: "Media" }).relevancia).toBe("Media");
  });
});
