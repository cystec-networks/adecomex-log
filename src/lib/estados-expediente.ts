export const ESTADO_LABEL: Record<string, string> = {
  digitar: "Recibido",
  en_transito: "En Tránsito",
  manifestado: "Manifestado",
  presentar: "Presentado",
  verificar: "Verificado",
  despachado: "Despachado",
  entregado: "Entregado",
  facturar: "Facturado",
};

export const ESTADO_ORDEN = [
  "digitar",
  "en_transito",
  "manifestado",
  "presentar",
  "verificar",
  "despachado",
  "entregado",
  "facturar",
] as const;

export const estadoLabel = (e: string | null | undefined): string =>
  (e && ESTADO_LABEL[e]) || (e ?? "");

export const estadoIndex = (e: string | null | undefined): number =>
  ESTADO_ORDEN.indexOf((e ?? "") as (typeof ESTADO_ORDEN)[number]);

type Ctx = {
  exp: any;
  tieneGastos: boolean;
  tieneFactura: boolean;
};

/** Devuelve el mensaje del requisito faltante para entrar a `paso`, o null si se cumple. */
export function requisitoFaltante(paso: string, ctx: Ctx): string | null {
  const vacio = (v: any) => !v || String(v).trim() === "";
  switch (paso) {
    case "en_transito":
      return vacio(ctx.exp?.bl_awb)
        ? "No se puede pasar a En Tránsito: falta el BL / AWB / Guía (Información General)."
        : null;
    case "manifestado":
      return !ctx.exp?.fecha_llegada_real
        ? "No se puede pasar a Manifestado: falta la Fecha de Llegada Real (Información General)."
        : null;
    case "presentar":
      return vacio(ctx.exp?.numero_dua)
        ? "No se puede pasar a Presentado: falta la Declaración DUA (sección Declaración)."
        : null;
    case "verificar":
      return vacio(ctx.exp?.numero_igra)
        ? "No se puede pasar a Verificado: falta el Número de despacho (sección Declaración)."
        : null;
    case "despachado":
      if (vacio(ctx.exp?.liq_siga_numero))
        return "No se puede pasar a Despachado: falta el N.º Liquidación SIGA (Resultado oficial DGA).";
      return !ctx.tieneGastos
        ? "No se puede pasar a Despachado: no hay gastos operativos registrados en el expediente."
        : null;
    case "entregado":
      return !ctx.tieneGastos
        ? "No se puede pasar a Entregado: no hay gastos operativos registrados en el expediente."
        : null;
    case "facturar":
      return !ctx.tieneFactura
        ? "No se puede pasar a Facturado: no hay una factura e-CF vinculada al expediente."
        : null;
    default:
      return null;
  }
}

/** Valida el avance desde `desde` hasta `hasta`, revisando cada paso intermedio. */
export function validarAvanceEstado(desde: string, hasta: string, ctx: Ctx): string | null {
  const i0 = estadoIndex(desde);
  const i1 = estadoIndex(hasta);
  if (i0 < 0 || i1 < 0 || i1 <= i0) return null;
  for (let i = i0 + 1; i <= i1; i++) {
    const msg = requisitoFaltante(ESTADO_ORDEN[i], ctx);
    if (msg) return msg;
  }
  return null;
}
