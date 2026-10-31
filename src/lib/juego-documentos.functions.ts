import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Each request contains one page only: combined files never hold a gateway request open.
export const clasificarPaginaJuego = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ expedienteId: z.string().uuid(), nombre: z.string().max(250), base64: z.string().min(20).max(28_000_000), exigirConfianza: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: expediente, error } = await context.supabase.from("expedientes").select("id").eq("id", data.expedienteId).maybeSingle();
    if (error || !expediente) throw new Error("No se puede acceder al expediente");
    const { clasificarPaginaEscaneada } = await import("./correo-adjunto-lectura.server");
    return { tipo: await clasificarPaginaEscaneada(data.nombre, data.base64, data.exigirConfianza) };
  });

export const leerEncabezadosJuego = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ expedienteId: z.string().uuid(), storagePath: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${data.expedienteId}/juegos/`)) throw new Error("Archivo fuera del expediente");
    const { data: expediente, error } = await context.supabase.from("expedientes").select("id").eq("id", data.expedienteId).maybeSingle();
    if (error || !expediente) throw new Error("No se puede acceder al expediente");
    const { data: blob, error: downloadError } = await context.supabase.storage.from("documentos").download(data.storagePath);
    if (downloadError || !blob) throw new Error("No se pudo leer el PDF");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const proxy = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
    return { textos: (await extractText(proxy, { mergePages: false })).text as string[] };
  });

// Folder preflight reads one page in memory, never creating storage objects or rows.
export const leerPaginaJuego = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ expedienteId: z.string().uuid(), base64: z.string().min(20).max(28_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: expediente, error } = await context.supabase.from("expedientes").select("id").eq("id", data.expedienteId).maybeSingle();
    if (error || !expediente) throw new Error("No se puede acceder al expediente");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const proxy = await getDocumentProxy(Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0)));
    try { return { texto: (await extractText(proxy, { mergePages: true })).text }; }
    finally { await proxy.cleanup(); }
  });