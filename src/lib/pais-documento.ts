/** Resolución documental: nunca seleccionar un país por el primer substring del catálogo. */
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const INSULAR = /\b(PUERTO RICO|GUAM|AMERICAN SAMOA|SAMOA AMERICANA|US VIRGIN ISLANDS|U S VIRGIN ISLANDS|UNITED STATES VIRGIN ISLANDS|ISLAS VIRGENES (?:DE (?:LOS )?ESTADOS UNIDOS|DE EE UU|ESTADOUNIDENSES)|NORTHERN MARIANA ISLANDS|ISLAS MARIANAS DEL NORTE|BAKER ISLAND|HOWLAND ISLAND|JARVIS ISLAND|JOHNSTON ATOLL|KINGMAN REEF|MIDWAY (?:ISLANDS|ATOLL)|PALMYRA ATOLL|WAKE ISLAND)\b/;
const EEUU = /\b(UNITED STATES(?: OF AMERICA)?|USA|U S A|ESTADOS UNIDOS|EE UU|840)\b/;
const ULTRAMAR = /\b(581|ULTRAMARINAS|MINOR OUTLYING ISLANDS)\b/;

export function codigoEstadosUnidosDocumento(texto: string): "840" | "581" | null {
  const nombre = normalizar(texto);
  if (INSULAR.test(nombre)) return "581";
  if (ULTRAMAR.test(nombre)) return null;
  return EEUU.test(nombre) ? "840" : null;
}

/** La evidencia es la dirección/país literal del bloque pertinente, no códigos de puerto. */
export function normalizarPaisDocumento(valor: string | null | undefined, evidencia?: string | null): string | null {
  const codigo = codigoEstadosUnidosDocumento(evidencia || "") ?? codigoEstadosUnidosDocumento(valor || "");
  if (codigo === "840") return "ESTADOS UNIDOS";
  if (codigo === "581") return INSULAR.test(normalizar(evidencia || "")) ? evidencia?.trim() || null : valor?.trim() || null;
  if (ULTRAMAR.test(normalizar(valor || ""))) return null;
  return valor?.trim() || null;
}

export type PaisCatalogoDocumento = { codigo: string; pais: string };
export function resolverPaisDocumento(valor: string, catalogo: PaisCatalogoDocumento[]): { nombre: string; codigo: string | null } {
  const codigo = codigoEstadosUnidosDocumento(valor);
  const nombre = normalizar(valor);
  const coincidencias = codigo
    ? catalogo.filter((p) => p.codigo === codigo)
    : catalogo.filter((p) => p.codigo !== "581" && normalizar(p.pais) === nombre);
  const unico = coincidencias.length === 1 ? coincidencias[0] : undefined;
  return unico ? { nombre: unico.pais, codigo: unico.codigo } : { nombre: valor, codigo: null };
}