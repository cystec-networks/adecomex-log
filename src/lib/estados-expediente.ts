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
      if (!ctx.exp?.fecha_llegada_real)
        return "No se puede pasar a Presentado: falta la Fecha de Llegada Real (Información General).";
      if (vacio(ctx.exp?.pais_origen))
        return "No se puede pasar a Presentado: falta el País de Origen (Datos de importación).";
      if (ctx.exp?.peso_neto == null || Number(ctx.exp.peso_neto) <= 0)
        return "No se puede pasar a Presentado: falta el Peso Neto (Descripción de mercancía).";
      if (ctx.exp?.peso_bruto == null || Number(ctx.exp.peso_bruto) <= 0)
        return "No se puede pasar a Presentado: falta el Peso Bruto (Descripción de mercancía).";
      return vacio(ctx.exp?.numero_dua)
        ? "No se puede pasar a Presentado: falta la Declaración DUA (sección Declaración)."
        : null;
    case "verificar":
      return vacio(ctx.exp?.numero_igra)
        ? "No se puede pasar a Verificado: falta el Número de despacho (sección Declaración)."
        : null;
    case "despachado":
      if (vacio(ctx.exp?.numero_igra))
        return "No se puede despachar este Expediente: falta capturar el Número de despacho.";
      if (vacio(ctx.exp?.numero_dua))
        return "No se puede despachar este Expediente: falta capturar la Declaración DUA.";
      if (vacio(ctx.exp?.regimen_aduanero))
        return "No se puede despachar este Expediente: falta seleccionar el Régimen Aduanero.";
      if (vacio(ctx.exp?.liq_siga_numero))
        return "No se puede pasar a Despachado: falta el N.º Liquidación SIGA (Resultado oficial DGA).";
      return !ctx.tieneGastos
        ? "No se puede pasar a Despachado: no hay gastos operativos registrados en el expediente."
        : null;
    case "entregado":
      return !ctx.tieneGastos
        ? "No se puede pasar a Entregado: no hay gastos operativos registrados en el expediente."
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

/** Documentos del Checklist de Recepción que bloquean el paso a En Tránsito (igual que el trigger); el resto es informativo. */
export const DOCS_CORE_RECEPCION = ["Factura comercial", "Bill of Lading"] as const;

const docRecibido = (docs: { tipo: string; estado: string }[], tipo: string) =>
  docs.some((d) => d.tipo === tipo && (d.estado === "recibido" || d.estado === "aprobado"));

type CtxForzable = {
  exp: any;
  documentos?: { tipo: string; estado: string; storage_path?: string | null }[];
  facturaVentaEnviada?: boolean;
  permisosPendientes?: { numero?: string | null; tipo: string | null; estado: string }[];
};

/** Requisitos que solo un Administrador puede forzar con justificación; se listan todos los pasos saltados. */
export function checksForzables(desde: string, hasta: string, ctx: CtxForzable): string[] {
  const i0 = estadoIndex(desde);
  const i1 = estadoIndex(hasta);
  if (i0 < 0 || i1 <= i0) return [];
  const out: string[] = [];
  for (let i = i0 + 1; i <= i1; i++) {
    const paso = ESTADO_ORDEN[i];
    if (paso === "en_transito") {
      const faltan = DOCS_CORE_RECEPCION.filter((t) => !docRecibido(ctx.documentos ?? [], t));
      if (faltan.length) out.push(`Checklist de Recepción incompleto: ${faltan.join(", ")}`);
    } else if (paso === "presentar") {
      const faltan = ["Factura comercial", "Bill of Lading"].filter((t) => !(ctx.documentos ?? []).some((d) => d.tipo === t && String(d.storage_path ?? "").trim()));
      if (faltan.length) out.push(`Falta adjuntar ${faltan.join(" y ")} para Presentado`);
    } else if (paso === "verificar" && !String(ctx.exp?.canal_riesgo ?? "").trim()) {
      out.push("Falta definir el Tipo de Inspección (sección Declaración)");
    } else if (paso === "despachado" && ctx.permisosPendientes?.length) {
      const p = ctx.permisosPendientes[0];
      out.push(`${ctx.permisosPendientes.length} permiso(s) sin aprobar (ej. ${p.numero || p.tipo} - ${p.estado})`);
    } else if (paso === "entregado" && !ctx.facturaVentaEnviada) {
      out.push("Falta marcar «Factura de venta enviada al cliente» (Seguimiento Operativo)");
    } else if (paso === "facturar" && !ctx.exp?.factura_ecf_id) {
      out.push("No hay una factura e-CF vinculada al expediente");
    }
  }
  return out;
}

/** Etapa X de N: hitos activos + documentos del checklist recibidos + permisos aprobados; «No aplica» no cuenta. */
export function calcularEtapa({ hitos, documentos, permisos, checklist }: {
  hitos: { estado: string }[];
  documentos: { tipo: string; estado: string }[];
  permisos: { estado: string }[];
  checklist: readonly string[];
}): { cumplidos: number; total: number } {
  const hitosAplican = hitos.filter((h) => h.estado !== "no_aplica");
  const cumplidos = hitosAplican.filter((h) => h.estado === "completado").length
    + checklist.filter((t) => docRecibido(documentos, t)).length
    + permisos.filter((p) => p.estado === "aprobado").length;
  return { cumplidos, total: hitosAplican.length + checklist.length + permisos.length };
}

/** Fechas DGA requeridas para despachar (forzable solo por Administrador con justificación). */
export function fechasDespachoFaltantes(exp: any): string[] {
  const vacio = (v: any) => !v || String(v).trim() === "";
  const f: string[] = [];
  if (vacio(exp?.liq_siga_fecha_pago)) f.push("falta la Fecha de pago del PIN de DGA (Resultado oficial DGA)");
  if (vacio(exp?.fecha_aprobacion_despacho)) f.push("falta la Fecha de Aprobación del Número de despacho (Documentos oficiales ante DGA y VUCE)");
  return f;
}
