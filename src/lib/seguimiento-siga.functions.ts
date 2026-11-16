import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ResultadoLecturaSiga } from "./seguimiento-siga.server";

/** Lee un PDF de Seguimiento SIGA (texto primero, modelo económico solo como respaldo). */
export const leerSeguimientoSigaDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ filename: z.string().max(300), base64: z.string().min(20) }).parse(data))
  .handler(async ({ data }): Promise<ResultadoLecturaSiga> => {
    const { leerSeguimientoSigaPdf } = await import("./seguimiento-siga.server");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    return leerSeguimientoSigaPdf(bytes, data.filename);
  });
