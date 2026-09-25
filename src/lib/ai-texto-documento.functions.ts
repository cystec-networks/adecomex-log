import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai-gateway.server";

const Input = z.object({ filename: z.string(), mime: z.string(), base64: z.string().min(20) });

/** Devuelve el título y encabezados del documento (primera página) para validar su tipo. */
export const leerEncabezadoDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const dataUrl = `data:${data.mime};base64,${data.base64}`;
    const isPdf = data.mime === "application/pdf";
    const texto = await callGateway({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Transcribe literalmente el título del documento y los encabezados/etiquetas principales de la primera página (máx. 600 caracteres). No interpretes ni traduzcas." },
        { role: "user", content: [
          { type: "text", text: "Transcribe el título y encabezados." },
          isPdf ? { type: "file", file: { filename: data.filename, file_data: dataUrl } } : { type: "image_url", image_url: { url: dataUrl } },
        ] },
      ],
    });
    return { texto };
  });
