export function tipoPaginaConfiable(resultado: { tipo_documento?: unknown; confianza?: unknown; evidencia?: unknown }) {
  return resultado.confianza === "alta" && typeof resultado.evidencia === "string" && resultado.evidencia.trim().length > 0 && typeof resultado.tipo_documento === "string" ? resultado.tipo_documento : "Otro";
}