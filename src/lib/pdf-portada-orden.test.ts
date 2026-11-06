import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { datosOperacionPortada, fechaHoraPortada } from "./pdf-portada-orden";

describe("Datos de portada de Orden de Compra", () => {
  it("usa el origen propio corregido, no Amberes de la cotización", () => {
    const orden = { origen: "PAISES BAJOS", cot_origen: "Amberes" } as Tables<"ordenes">;
    expect(datosOperacionPortada(orden).origen).toBe("PAISES BAJOS");
    expect(orden.cot_origen).toBe("Amberes");
  });
  it("conserva notas originales y tarifa/moneda operativas sin convertir importes", () => {
    const orden = { cot_notas: "Referencia original", notas: "Nota operativa", tarifa_propuesta: 8500, cot_tarifa_propuesta: 16000, moneda: "DOP" } as Tables<"ordenes">;
    expect(datosOperacionPortada(orden)).toMatchObject({ notas: "Referencia original", tarifa: 8500, moneda: "DOP" });
  });
  it("fecha de generación usa el día de Santo Domingo, no UTC", () => {
    expect(fechaHoraPortada(new Date("2026-11-06T02:01:00Z"))).toContain("05/11/2026");
  });
});