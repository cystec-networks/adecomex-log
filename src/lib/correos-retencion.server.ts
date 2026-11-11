/**
 * Retención del Registro de correos (tarea diaria): a los 30 días de descartado se borran los
 * adjuntos guardados y a los 90 la línea. Creadas, adjuntadas y errores nunca se borran.
 * Solo servidor: recibe el cliente de servicio.
 */
import { DIAS_ADJUNTOS_DESCARTADOS, DIAS_REGISTRO_DESCARTADOS, haceDias, rutasRetencion } from "@/lib/correos-recibidos";

export async function aplicarRetencionCorreos(db: any) {
  let adjuntosBorrados = 0;
  let correosConAdjuntos = 0;
  // 1) Adjuntos de descartados con más de 30 días (copias del Registro y de solicitudes que siguen descartadas).
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const { data, error } = await db.from("correos_recibidos").select("id,adjuntos_respaldo,solicitud_id")
      .eq("resultado", "descartada").lt("descartado_en", haceDias(DIAS_ADJUNTOS_DESCARTADOS)).is("adjuntos_borrados_en", null).limit(100);
    if (error) throw new Error(`No se pudo leer el registro: ${error.message}`);
    if (!data?.length) break;
    for (const f of data) {
      const rutas = rutasRetencion(f);
      if (rutas.length) {
        const { error: e } = await db.storage.from("documentos").remove(rutas);
        if (e) throw new Error(`No se pudieron borrar los adjuntos de ${f.id}: ${e.message}`);
        adjuntosBorrados += rutas.length;
        correosConAdjuntos++;
      }
      const { error: e2 } = await db.from("correos_recibidos").update({ adjuntos_respaldo: [], adjuntos_borrados_en: new Date().toISOString() })
        .eq("id", f.id).eq("resultado", "descartada");
      if (e2) throw new Error(`No se pudo actualizar ${f.id}: ${e2.message}`);
    }
    if (data.length < 100) break;
  }
  // 2) Líneas de descartados con más de 90 días (sus adjuntos ya se borraron en el paso 1).
  const { data: quitadas, error: e3 } = await db.from("correos_recibidos").delete()
    .eq("resultado", "descartada").lt("descartado_en", haceDias(DIAS_REGISTRO_DESCARTADOS)).not("adjuntos_borrados_en", "is", null).select("id");
  if (e3) throw new Error(`No se pudieron quitar las líneas antiguas: ${e3.message}`);
  return { adjuntosBorrados, correosConAdjuntos, lineasQuitadas: quitadas?.length ?? 0 };
}
