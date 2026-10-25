/** Only explicit references in service descriptions authorize a suggestion; BL never links alone. */
export function detectarReferenciasFactura(descripciones: readonly string[]) {
  const expedientes = new Set<string>();
  const bl = new Set<string>();
  for (const descripcion of descripciones) {
    const texto = descripcion.toUpperCase();
    for (const m of texto.matchAll(/\bEXP\.?\s*[:#]?\s*(\d{6}[A-Z]\d+)\b/g)) expedientes.add(m[1]);
    for (const m of texto.matchAll(/\bB\/?L\.?\s*[:#]?\s*([A-Z0-9]+(?:[-/][A-Z0-9]+)*)\b/g)) bl.add(m[1]);
  }
  const numeros = [...expedientes];
  return { expedientes: numeros, bl: [...bl], unico: numeros.length === 1 ? numeros[0] : null };
}

export function coincideFacturaExpediente(descripciones: readonly string[], numero?: string | null) {
  return !!numero && detectarReferenciasFactura(descripciones).expedientes.includes(numero.toUpperCase());
}

export function decidirVinculoFactura(referencias: ReturnType<typeof detectarReferenciasFactura>,
  candidatos: readonly { id: string; numero: string; factura_ecf_id: string | null }[], facturaId?: string) {
  if (!referencias.unico) return null;
  const matches = candidatos.filter(e => e.numero.toUpperCase() === referencias.unico);
  if (matches.length !== 1) return null;
  const exp = matches[0];
  return !exp.factura_ecf_id || exp.factura_ecf_id === facturaId ? exp.id : null;
}