/** Observaciones estructuradas del expediente → texto para ImpDeclaration/Remark (SIGA). */
export type ObservacionesEstructura = {
  tipo_carga?: string;
  contenedores?: string;
  descripcion?: string;
  embarcador?: string;
};

export const TIPOS_CARGA_OBS = ["FCL", "LCL", "Carga suelta", "Granel", "Consolidado", "Aérea"];

export const PATRON_CONTENEDORES = /^\d{1,3}X(20|40|45)(HC|RF|OT|FR)?$/;

export function contenedoresValidos(v?: string | null): boolean {
  const t = (v ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return !t || PATRON_CONTENEDORES.test(t);
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
  const cont = limpio(e.contenedores).toUpperCase().replace(/\s+/g, "");
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
