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
export function eleccionesPorLinea(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw.map((r) => {
    if (r && typeof r === "object" && "elecciones" in r && Array.isArray(r.elecciones)) return r.elecciones[0];
    return r;
  });
  if (raw && typeof raw === "object" && "elecciones" in raw && Array.isArray(raw.elecciones)) return raw.elecciones;
  return [];
}