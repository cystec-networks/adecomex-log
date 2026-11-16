import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { DuaDocumento } from "./declaracion-dua";

/** Lee el formulario DUA (incluido el DUA TEMP) solo con reglas fijas sobre el texto del PDF; nunca usa IA. */
export const leerDuaDocumentoPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ filename: z.string().max(300), base64: z.string().min(20) }).parse(data))
  .handler(async ({ data }): Promise<DuaDocumento & { texto: boolean }> => {
    const { leerDuaDocumento } = await import("./declaracion-dua");
    let text = "";
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      text = (await extractText(await getDocumentProxy(bytes), { mergePages: true })).text ?? "";
    } catch { /* PDF ilegible: se informa el motivo y se intenta con el nombre del archivo. */ }
    return { ...leerDuaDocumento(text), texto: !!text.trim() };
  });
