type ErrorDatos = { code?: string; message?: string; details?: string; constraint?: string };
export type DuplicadoExpediente = { campo: string; valor: string; restriccion?: string; entreOperaciones: boolean };

/** Only diagnose a database rejection; never infer that a value is free. */
export function diagnosticarDuplicadoExpediente(error: unknown, valores: Record<string, unknown> = {}): DuplicadoExpediente | null {
  if (!error || typeof error !== "object") return null;
  const e = error as ErrorDatos;
  if (e.code !== "23505") return null;
  const mensaje = e.message ?? "";
  const clave = /Key \(([^)]+)\)=\((.*)\) already exists/i.exec(e.details ?? "");
  const operacion = /^El número (.+) ya pertenece a otra operación\.?$/i.exec(mensaje);
  const restriccion = e.constraint ?? /unique constraint "([^"]+)"/i.exec(mensaje)?.[1];
  const conocido = restriccion === "expedientes_numero_key" ? "numero"
    : restriccion === "idx_expedientes_numero_vuce_unico" ? "numero_vuce" : undefined;
  const campo = operacion ? "numero" : clave?.[1] ?? conocido ?? restriccion ?? "restricción única no identificada";
  return {
    campo,
    valor: operacion?.[1] ?? clave?.[2] ?? String(valores[campo] ?? ""),
    restriccion,
    entreOperaciones: !!operacion,
  };
}

export async function mensajeDuplicadoExpediente(
  error: unknown,
  valores: Record<string, unknown>,
  buscar: (campo: string, valor: string) => Promise<string | null>,
): Promise<string | null> {
  const conflicto = diagnosticarDuplicadoExpediente(error, valores);
  if (!conflicto) return null;
  const etiquetas: Record<string, string> = { numero: "número de Expediente", numero_vuce: "número de permiso VUCE", bl_awb: "BL/AWB", id: "identificador del registro" };
  const etiqueta = etiquetas[conflicto.campo] ?? conflicto.campo;
  let expediente: string | null = null;
  if (conflicto.valor && etiquetas[conflicto.campo]) {
    try { expediente = await buscar(conflicto.campo, conflicto.valor); } catch { /* RLS/network cannot override the rejection. */ }
  }
  const valor = conflicto.valor ? ` «${conflicto.valor}»` : "";
  const destino = expediente ? ` en el Expediente ${expediente}` : conflicto.entreOperaciones ? " en otra operación (Expediente, Orden o Cotización de Compra)" : " en otro registro";
  return `El ${etiqueta}${valor} ya existe${destino}. No se guardaron los cambios; revisa ese campo e intenta de nuevo.`;
}