type IdentidadCorreo = { remitente: string; remitente_correo?: string | null; asunto: string; bl_awb?: string | null; estado?: string };
export const identidadRemitenteCorreo = (s: IdentidadCorreo) => (s.remitente_correo?.trim() || s.remitente.trim()).toLowerCase();
export function mismoPendienteCorreo(anterior: IdentidadCorreo, nuevo: IdentidadCorreo) {
  if (anterior.estado !== "pendiente" || identidadRemitenteCorreo(anterior) !== identidadRemitenteCorreo(nuevo)) return false;
  const blAnterior = anterior.bl_awb?.trim().toUpperCase() || null;
  const blNuevo = nuevo.bl_awb?.trim().toUpperCase() || null;
  return blAnterior && blNuevo ? blAnterior === blNuevo : !blAnterior && !blNuevo && anterior.asunto === nuevo.asunto;
}
export function respuestaCorreoActualizado(id: string) {
  return Response.json({ resultado: "actualizado", id, motivo: "Borrador pendiente actualizado con el reenvío" }, { status: 200 });
}