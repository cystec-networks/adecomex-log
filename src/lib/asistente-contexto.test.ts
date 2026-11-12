import { describe, expect, it } from "vitest";
import { fichasRelacionadas, pideRecientes, seleccionarContexto, type NovedadBuscada } from "./asistente-contexto";
import type { FichaNormativa, FragmentoContexto } from "./normativa";

const nov = (i: number, similitud: number, extra: Partial<NovedadBuscada> = {}): NovedadBuscada => ({
  titulo: `Novedad ${i}`, resumen: "r", fecha_publicacion: `2026-11-${String(i).padStart(2, "0")}`, fecha_captura: `2026-11-${String(i).padStart(2, "0")}T12:00:00Z`,
  fuente_nombre: "DGA", url: `https://x/${i}`, categoria: "Aduanas", similitud, ...extra,
});
const frag = (i: number, similitud: number): FragmentoContexto => ({
  documento_id: `d${i}`, titulo: `Ley ${i}`, tipo: "Ley", numero: null, fecha_emision: null, estado_vigencia: "vigente",
  fuente_url: null, pagina_inicio: 1, pagina_fin: 1, articulo: null, contenido: "texto", similitud,
});

describe("contexto del asistente", () => {
  it("envía como máximo 5 resultados entre novedades y normativa", () => {
    const r = seleccionarContexto({
      pregunta: "requisitos del régimen de admisión temporal",
      novedades: [1, 2, 3, 4, 5].map((i) => nov(i, 0.6 + i / 100)),
      fragmentos: [1, 2, 3, 4, 5].map((i) => frag(i, 0.7 + i / 100)),
    });
    expect(r.novedades.length + r.fragmentos.length).toBe(5);
    expect(r.fragmentos.map((f) => f.documento_id)).toEqual(["d5", "d4", "d3", "d2", "d1"]);
  });
  it("descarta resultados sin relación con la pregunta", () => {
    // Valores medidos: una novedad fuera de tema quedó en 0,58 y un fragmento ajeno en 0,48.
    const r = seleccionarContexto({ pregunta: "plazo de presentación de la declaración", novedades: [nov(1, 0.58)], fragmentos: [frag(1, 0.48)] });
    expect(r.novedades).toEqual([]);
    expect(r.fragmentos).toEqual([]);
  });
  it("«últimas novedades» devuelve las 5 más recientes, filtrando por la institución nombrada", () => {
    expect(pideRecientes("¿Cuáles son las últimas novedades?")).toBe(true);
    const recientes = [1, 2, 3, 4, 5, 6, 7].map((i) => nov(i, 0, { fuente_nombre: i % 2 ? "DGA" : "VUCE" }));
    const todas = seleccionarContexto({ pregunta: "¿Cuáles son las últimas novedades?", novedades: [], fragmentos: [], recientes });
    expect(todas.novedades.map((n) => n.url)).toEqual(["https://x/7", "https://x/6", "https://x/5", "https://x/4", "https://x/3"]);
    const vuce = seleccionarContexto({ pregunta: "últimas novedades de VUCE", novedades: [], fragmentos: [], recientes });
    expect(vuce.novedades.map((n) => n.url)).toEqual(["https://x/6", "https://x/4", "https://x/2"]);
  });
  it("solo envía las fichas de documentos citados o nombrados", () => {
    const ficha = (id: string, titulo: string, numero: string | null = null) => ({ id, titulo, numero, tipo: "Ley", numero_detectado: false, fecha_emision: null, fecha_emision_detectada: false, estado_vigencia: "vigente", procesamiento_estado: "listo", fragmentos_total: 1, fragmentos_listos: 1, fuente_url: null }) as FichaNormativa & { id: string };
    const fichas = [ficha("d1", "Ley de Aduanas", "168-21"), ficha("d2", "Reglamento de Origen"), ficha("d3", "Norma General de Valoración")];
    expect(fichasRelacionadas(fichas, "¿Qué fecha tiene la ley 168-21?", [])!.map((f) => f.id)).toEqual(["d1"]);
    expect(fichasRelacionadas(fichas, "pregunta cualquiera", ["d3"])!.map((f) => f.id)).toEqual(["d3"]);
  });
});
