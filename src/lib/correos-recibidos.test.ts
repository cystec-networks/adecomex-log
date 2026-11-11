import { describe, expect, it } from "vitest";
import { correoAtascado, DIAS_ADJUNTOS_DESCARTADOS, DIAS_REGISTRO_DESCARTADOS, diasRestantes, esFalloCorreo, ordenarDescartados, prioridadDescarte, rutasCopiasCorreo } from "./correos-recibidos";

const ahora = Date.parse("2026-11-10T12:00:00Z");
describe("alertas de correos recibidos", () => {
  it("un correo procesando más de 10 minutos cuenta como fallo", () => {
    expect(correoAtascado({ resultado: "procesando", ultimo_intento_at: "2026-11-10T11:49:00Z" }, ahora)).toBe(true);
    expect(correoAtascado({ resultado: "procesando", ultimo_intento_at: "2026-11-10T11:55:00Z" }, ahora)).toBe(false);
  });
  it("error siempre es fallo; resultados correctos nunca", () => {
    expect(esFalloCorreo({ resultado: "error", ultimo_intento_at: "2026-11-10T11:59:00Z" }, ahora)).toBe(true);
    for (const resultado of ["creada", "adjuntada", "descartada", "actualizada"]) expect(esFalloCorreo({ resultado, ultimo_intento_at: "2026-11-10T10:00:00Z" }, ahora)).toBe(false);
  });
});

describe("retención y orden del registro", () => {
  const base = { motivo: null, adjuntos_respaldo: [], pdfs_en_gmail: null, ultimo_intento_at: "2026-11-10T00:00:00Z" } as const;
  it("los adjuntos de un descartado duran 30 días y la línea 90", () => {
    const desde = "2026-11-01T12:00:00Z";
    expect(diasRestantes(desde, DIAS_ADJUNTOS_DESCARTADOS, Date.parse("2026-11-11T12:00:00Z"))).toBe(20);
    expect(diasRestantes(desde, DIAS_REGISTRO_DESCARTADOS, Date.parse("2026-11-11T12:00:00Z"))).toBe(80);
    expect(diasRestantes(desde, DIAS_ADJUNTOS_DESCARTADOS, Date.parse("2026-12-15T12:00:00Z"))).toBe(0);
  });
  it("descartadas: con PDF primero, sin PDF después, remitentes ignorados al final", () => {
    const filas = [
      { ...base, id: "ign", descarte_categoria: "ignorado", pdfs_en_gmail: 2 },
      { ...base, id: "sinpdf", descarte_categoria: "sin_pdf" },
      { ...base, id: "conpdf", descarte_categoria: "sin_documentos", adjuntos_respaldo: [{ storage_path: "x" }] },
    ];
    expect(ordenarDescartados(filas as any).map((f: any) => f.id)).toEqual(["conpdf", "sinpdf", "ign"]);
    expect(prioridadDescarte({ ...base, descarte_categoria: null, motivo: "Remitente ignorado (dph.com.do): …" } as any)).toBe(2);
  });
  it("quitar del registro solo borra las copias propias del correo", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const rutas = rutasCopiasCorreo({ id, adjuntos_respaldo: [{ storage_path: `correo-recibido/${id}/0_a.pdf` }, { storage_path: "correo/otra/b.pdf" }], conflictos: [{ storage_path: `correo-recibido/${id}/casilla_0_c.pdf` }, { storage_path: "exp/d.pdf" }] });
    expect(rutas).toEqual([`correo-recibido/${id}/0_a.pdf`, `correo-recibido/${id}/casilla_0_c.pdf`]);
  });
});

describe("descartes antiguos de remitentes del catálogo", () => {
  it("un descarte manual de dph.com.do va al grupo de remitentes ignorados", () => {
    const f = { descarte_categoria: "manual", motivo: "Limpieza", adjuntos_respaldo: [{ storage_path: "x" }], pdfs_en_gmail: null, ultimo_intento_at: "", remitente_correo: "atencionalcliente@dph.com.do" };
    expect(prioridadDescarte(f as any, ["dph.com.do"])).toBe(2);
    expect(prioridadDescarte(f as any, [])).toBe(0);
  });
});
