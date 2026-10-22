export type RolSiga = "sin_especificar" | "exportadora" | "proveedora_exterior";
export const ROLES_SIGA: { value: RolSiga; label: string }[] = [
  { value: "sin_especificar", label: "Sin especificar" },
  { value: "exportadora", label: "Exportadora" },
  { value: "proveedora_exterior", label: "Proveedora Exterior" },
];
export type TerceroRegistro = {
  nombre: string; tid: string; rol_siga?: RolSiga;
  direccion: string | null; telefono: string | null; fax: string | null;
  email: string | null; pais_nombre: string | null; pais_codigo: string | null;
};
export type TerceroCert = {
  nombre: string; tipo_doc: string; doc: string; direccion: string; telefono: string;
  fax: string; email: string; pais_nombre: string; pais_codigo: string;
};
export const terceroVacio: TerceroCert = { nombre: "", tipo_doc: "TID", doc: "", direccion: "", telefono: "", fax: "", email: "", pais_nombre: "", pais_codigo: "" };
export function separarDoc(raw?: string | null): { tipo_doc: string; doc: string } {
  const clean = String(raw ?? "").trim();
  const m = /^(RNC|CED|PAS|TID|TAX)[\s-]*(.*)$/i.exec(clean);
  if (m) return { tipo_doc: m[1].toUpperCase() === "TAX" ? "TID" : m[1].toUpperCase(), doc: m[2] };
  return { tipo_doc: "TID", doc: clean };
}
export const docConPrefijo = (t: Pick<TerceroCert, "doc" | "tipo_doc">) => t.doc.trim() ? `${t.tipo_doc}${t.doc.trim()}` : "";
const documento = (raw?: string | null) => docConPrefijo(separarDoc(raw)).toUpperCase();
const nombreNormalizado = (raw: string) => raw.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
export function desdeCatalogo(t: TerceroRegistro): TerceroCert {
  return { nombre: t.nombre, ...separarDoc(t.tid), direccion: t.direccion ?? "", telefono: t.telefono ?? "", fax: t.fax ?? "", email: t.email ?? "", pais_nombre: t.pais_nombre ?? "", pais_codigo: t.pais_codigo ?? "" };
}
/** Exact saved producer documents resolve independently; supplier-derived defaults prefer the company role. */
export function resolverTerceroCertificado<T extends TerceroRegistro>(rows: T[], rol: Exclude<RolSiga, "sin_especificar">, nombre: string, tid: string, guardado?: string | null): T | null {
  const exacto = guardado && documento(guardado) !== documento(tid)
    ? rows.find((r) => documento(r.tid) === documento(guardado) && (r.rol_siga === rol || !r.rol_siga || r.rol_siga === "sin_especificar"))
    : null;
  if (exacto) return exacto;
  // A distinct saved identity must not silently become a different company/document.
  if (guardado && documento(guardado) !== documento(tid)) return null;
  const ancla = rows.find((r) => documento(r.tid) === documento(tid));
  const nombres = new Set([nombreNormalizado(nombre), nombreNormalizado(ancla?.nombre ?? "")].filter(Boolean));
  const candidatos = rows.filter((r) => nombres.has(nombreNormalizado(r.nombre)) || (documento(tid) && documento(r.tid) === documento(tid)));
  return candidatos.find((r) => r.rol_siga === rol)
    ?? candidatos.find((r) => (!r.rol_siga || r.rol_siga === "sin_especificar") && documento(r.tid) === documento(tid))
    ?? candidatos.find((r) => !r.rol_siga || r.rol_siga === "sin_especificar")
    ?? null;
}