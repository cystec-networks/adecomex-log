export type CandidatoArancel = { codigo: string; descripcion: string; contexto: string; gravamen_pct: number | null; exento_itbis: boolean | null };
export function codigoOchoDigitos(codigo: string) {
  const d = codigo.replace(/\./g, "");
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : null;
}
export function elegirCandidatoReal(indice: unknown, confianza: unknown, candidatos: CandidatoArancel[]) {
  if (confianza !== "alta" || typeof indice !== "number" || !Number.isInteger(indice) || indice < 0) return null;
  const candidato = candidatos[indice];
  const codigo = candidato ? codigoOchoDigitos(candidato.codigo) : null;
  return candidato && codigo ? { ...candidato, codigo } : null;
}
export const NO_DETERMINADA = "Partida no determinada automáticamente — revisar manualmente";
export function naturalezaChoozit(descripcion: string) {
  return /\bchoozit\b/i.test(descripcion) ? "Cultivos de microorganismos" : null;
}
export function eleccionesAlineadas(raw: unknown, cantidad: number): unknown[] {
  const elecciones = eleccionesPorLinea(raw);
  const indexadas = elecciones.every((e) => e && typeof e === "object" && "linea" in e);
  if (!indexadas) return elecciones.length === cantidad ? elecciones : [];
  return Array.from({ length: cantidad }, (_, i) => {
    const coinciden = elecciones.filter((e) => e && typeof e === "object" && "linea" in e && e.linea === i);
    return coinciden.length === 1 ? coinciden[0] : undefined;
  });
}
export function candidatosManuales(indices: unknown, candidatos: CandidatoArancel[]) {
  if (!Array.isArray(indices)) return [];
  const vistos = new Set<string>();
  return indices.flatMap((indice) => {
    const real = elegirCandidatoReal(indice, "alta", candidatos);
    if (!real || vistos.has(real.codigo)) return [];
    vistos.add(real.codigo);
    return [real];
  }).slice(0, 3);
}
export function eleccionesPorLinea(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw.map((r) => {
    if (r && typeof r === "object" && "elecciones" in r && Array.isArray(r.elecciones)) return r.elecciones[0];
    return r;
  });
  if (raw && typeof raw === "object" && "elecciones" in raw && Array.isArray(raw.elecciones)) return raw.elecciones;
  return [];
}