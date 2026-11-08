import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Revisión manual (todas las fuentes activas o una sola) iniciada por un administrador. */
export const revisarNovedadesAhora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fuenteId?: string | null } | undefined) => {
    const id = input?.fuenteId ?? null;
    if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Fuente inválida");
    return { fuenteId: id };
  })
  .handler(async ({ data, context }) => {
    const { data: rol } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!rol) throw new Error("Solo un administrador puede revisar las fuentes.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { revisarNovedades } = await import("./novedades-comercio.server");
    return revisarNovedades(supabaseAdmin, {
      modo: "manual",
      fuenteId: data.fuenteId ?? undefined,
    });
  });

/** Clasifica con IA un lote de novedades registradas que aún no tienen clasificación. */
export const clasificarNovedadesSinClasificar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rol } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!rol) throw new Error("Solo un administrador puede clasificar las novedades.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clasificarNovedadesPendientes } = await import("./novedades-comercio.server");
    return clasificarNovedadesPendientes(supabaseAdmin);
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comprueba ahora si los enlaces de unas novedades responden («Reintentar» o
 * «Verificar enlaces»). Solo se comprueban novedades que el usuario puede leer
 * (personal interno, por RLS); el estado se guarda con el cliente de servicio.
 */
export const verificarEnlacesNovedad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    const ids = Array.isArray(input?.ids) ? input.ids.filter((x) => typeof x === "string" && UUID_RE.test(x)) : [];
    if (ids.length === 0 || ids.length > 300) throw new Error("Novedades inválidas");
    return { ids: [...new Set(ids)] };
  })
  .handler(async ({ data, context }) => {
    const { data: filas, error } = await context.supabase
      .from("novedades_comercio_exterior")
      .select("id, url")
      .in("id", data.ids);
    if (error) throw new Error("No se pudieron leer las novedades.");
    if (!filas?.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verificarEnlacesNovedades } = await import("./novedades-comercio.server");
    const r = await verificarEnlacesNovedades(supabaseAdmin, filas);
    return r.map(({ id, estado, mensaje }) => ({ id, estado, mensaje }));
  });

/** Trae el PDF de una novedad desde el sitio oficial para el visor integrado. */
export const leerPdfNovedad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (typeof input?.id !== "string" || !UUID_RE.test(input.id)) throw new Error("Novedad inválida");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    // Solo enlaces ya guardados en novedades que el usuario puede leer: nunca
    // una dirección enviada por el navegador.
    const { data: fila, error } = await context.supabase
      .from("novedades_comercio_exterior")
      .select("id, url")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !fila) throw new Error("Novedad no encontrada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { descargarPdfNovedad } = await import("./novedades-comercio.server");
    return descargarPdfNovedad(supabaseAdmin, fila);
  });
