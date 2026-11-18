import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Borra el archivo anterior de un paquete regenerado (Rectificación Técnica o Envío Factura Cliente).
 * La base de datos confirma, con los permisos del usuario, que cada ruta es un paquete del mismo
 * Expediente y que nada la usa; solo entonces se borra con el cliente de servicio y queda en Auditoría.
 */
export const retirarArchivosPaqueteAnterior = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    expedienteId: z.string().uuid(),
    tipo: z.enum(["Paquete Rectificación Técnica", "Paquete de Envío Factura Cliente"]),
    rutas: z.array(z.string().min(1).max(1000)).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const rutas = [...new Set(data.rutas)];
    const retirables: string[] = [];
    for (const ruta of rutas) {
      const { data: ok, error } = await context.supabase.rpc("paquete_archivo_retirable", { _expediente_id: data.expedienteId, _ruta: ruta });
      if (error) throw new Error(error.message);
      if (ok) retirables.push(ruta);
    }
    if (!retirables.length) return { borrados: 0, omitidos: rutas.length };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("documentos").remove(retirables);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("auditoria").insert({
      entidad: "documentos", entidad_id: data.expedienteId, accion: "paquete_anterior_borrado", usuario_id: context.userId,
      cambios: { tipo: data.tipo, rutas: retirables, cantidad: retirables.length },
    });
    return { borrados: retirables.length, omitidos: rutas.length - retirables.length };
  });
