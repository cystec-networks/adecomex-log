export const VENTANA_DUPLICADO_CORREO_MS = 5 * 60 * 1000;
export const ESTADOS_DUPLICADO_CORREO = ["pendiente", "confirmada"] as const;

export function inicioVentanaDuplicadoCorreo(ahora = Date.now()) {
  return new Date(ahora - VENTANA_DUPLICADO_CORREO_MS).toISOString();
}

export function respuestaCorreoDuplicado() {
  return Response.json({ resultado: "duplicado", motivo: "Envío duplicado ignorado" }, { status: 200 });
}