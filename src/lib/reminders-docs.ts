/**
 * IDs de expedientes con al menos un documento subido (con archivo en storage).
 * Regla del panel: verde = al menos un documento; gris = ninguno todavía.
 */
export function idsExpedientesConDocumentos(rows: { expediente_id: string }[]): Set<string> {
  return new Set(
    (rows ?? [])
      .filter((r) => typeof r.expediente_id === "string" && r.expediente_id.length > 0)
      .map((r) => r.expediente_id),
  );
}
