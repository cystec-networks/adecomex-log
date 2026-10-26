/** Observaciones estructuradas del expediente → texto para ImpDeclaration/Remark (SIGA). */
export type ObservacionesEstructura = {
  tipo_carga?: string;
  contenedores?: string;
  descripcion?: string;
  embarcador?: string;
};

export const TIPOS_CARGA_OBS = ["FCL", "LCL", "Carga suelta", "Granel", "Consolidado", "Aérea"];

export const PATRON_CONTENEDORES = /^\d{1,3}X(20|40|45)(HC|RF|OT|FR)?$/;

/** Normaliza "1x40+1x20" → "1X40 + 1X20". */
export function normalizarContenedores(v?: string | null): string {
  return (v ?? "").toUpperCase().split("+").map((p) => p.replace(/\s+/g, "")).filter(Boolean).join(" + ");
}

export function contenedoresValidos(v?: string | null): boolean {
  const t = normalizarContenedores(v);
  return !t || t.split(" + ").every((p) => PATRON_CONTENEDORES.test(p));
}

/** Agrupa contenedores por tamaño (y sufijo HC/RF/OT/FR) → "2X40" o "1X40 + 1X20". Tipos sin tamaño se omiten. */
export function contenedoresDesdeTabla(rows: Array<{ tipo?: string | null; tipo_contenedor?: string | null }>): string {
  const conteo = new Map<string, number>();
  for (const r of rows) {
    const t = String(r.tipo ?? r.tipo_contenedor ?? "").toUpperCase();
    const m = t.match(/(20|40|45)\s*'?\s*(HC|RF|OT|FR)?/);
    if (!m) continue;
    const k = m[1] + (m[2] ?? "");
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([k, n]) => `${n}X${k}`)
    .join(" + ");
}

export function tipoCargaPorDefecto(cantidadContenedores: number): string {
  return cantidadContenedores > 0 ? "FCL" : "LCL";
}

/** Descripción del producto con mayor FOB (desempate por peso) como borrador. */
export function descripcionBorrador(items: Array<{ detalle_producto?: string | null; descripcion?: string | null; valor_fob?: any; peso?: any }>): string {
  let mejor: (typeof items)[number] | null = null;
  for (const it of items) {
    if (!String(it.detalle_producto ?? it.descripcion ?? "").trim()) continue;
    const f = Number(it.valor_fob) || 0, p = Number(it.peso) || 0;
    if (!mejor || f > (Number(mejor.valor_fob) || 0) || (f === (Number(mejor.valor_fob) || 0) && p > (Number(mejor.peso) || 0))) mejor = it;
  }
  return mejor ? String(mejor.detalle_producto ?? mejor.descripcion ?? "").replace(/\s+/g, " ").trim() : "";
}

/** Mayúsculas, sin tildes ni Ñ, una sola línea, sin espacios dobles. */
export function normalizarRemarkSiga(v?: string | null): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, (m) => (m === "ñ" ? "n" : "N"))
    .toUpperCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const limpio = (v?: string | null) => (v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

/** Arma el texto (sin normalizar) con el formato fijo, omitiendo partes vacías. */
export function construirObservaciones(
  e: ObservacionesEstructura,
  factura?: string | null,
  expediente?: string | null,
): string {
  const tipo = limpio(e.tipo_carga);
  const cont = normalizarContenedores(limpio(e.contenedores));
  const desc = limpio(e.descripcion);
  const cabeza = [tipo, cont].filter(Boolean).join(" ");
  const primera = [cabeza, desc ? `STC: ${desc}` : ""].filter(Boolean).join(" ");
  const partes = [
    primera,
    limpio(e.embarcador) ? `EMB.: ${limpio(e.embarcador)}` : "",
    limpio(factura) ? `FACTURA ${limpio(factura)}` : "",
    limpio(expediente) ? `EXP.: ${limpio(expediente)}` : "",
  ].filter(Boolean);
  return partes.length ? `${partes.join(", ").replace(/[.,\s]+$/, "")}.` : "";
}

export function estructuraVacia(e?: ObservacionesEstructura | null): boolean {
  return !e || !(limpio(e.tipo_carga) || limpio(e.contenedores) || limpio(e.descripcion) || limpio(e.embarcador));
}

/** Solo un cambio del texto generado reemplaza el ajuste manual de Descripción. */
export function sincronizarDescripcionObservaciones<T extends { observaciones_estructura?: ObservacionesEstructura | null; factura_comercial?: string | null; descripcion?: string | null }>(
  anterior: T, siguiente: T, numeroAnterior?: string | null, numeroSiguiente?: string | null,
): T {
  const antes = construirObservaciones(anterior.observaciones_estructura ?? {}, anterior.factura_comercial, numeroAnterior);
  const despues = construirObservaciones(siguiente.observaciones_estructura ?? {}, siguiente.factura_comercial, numeroSiguiente);
  return antes === despues ? siguiente : { ...siguiente, descripcion: despues };
}
