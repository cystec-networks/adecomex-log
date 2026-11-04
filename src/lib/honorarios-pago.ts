export type EstadoPagoHonorario = "pendiente" | "pagado";

export function cambioPagoHonorario(estado: EstadoPagoHonorario, fecha: string) {
  if (estado === "pagado" && !fecha) throw new Error("Seleccione una fecha de pago");
  return { pago_estado: estado, fecha_pago: estado === "pendiente" ? null : fecha };
}

export function honorariosParaCambio<T extends { estado: EstadoPagoHonorario }>(filas: T[], destino: EstadoPagoHonorario): T[] {
  return filas.filter((fila) => fila.estado !== destino);
}