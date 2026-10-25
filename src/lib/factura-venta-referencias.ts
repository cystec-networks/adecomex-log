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

const INICIO_OCR = "[Descripciones de servicios · OCR]";
const FIN_OCR = "[Fin descripciones OCR]";
export function guardarDescripcionesOcr(notas: string, descripciones: readonly string[]) {
  const inicio = notas.indexOf(INICIO_OCR);
  const fin = inicio < 0 ? -1 : notas.indexOf(FIN_OCR, inicio);
  const manual = fin < 0 ? notas : `${notas.slice(0, inicio)}${notas.slice(fin + FIN_OCR.length)}`;
  return [manual.trim(), `${INICIO_OCR}\n${descripciones.join("\n")}\n${FIN_OCR}`].filter(Boolean).join("\n\n");
}
export function descripcionesOcrGuardadas(notas?: string | null) {
  const inicio = notas?.indexOf(INICIO_OCR) ?? -1;
  if (!notas || inicio < 0) return [];
  const fin = notas.indexOf(FIN_OCR, inicio);
  return fin < 0 ? [] : [notas.slice(inicio + INICIO_OCR.length, fin)];
}

export function decidirVinculoFactura(referencias: ReturnType<typeof detectarReferenciasFactura>,
  candidatos: readonly { id: string; numero: string; factura_ecf_id: string | null }[], facturaId?: string) {
  if (!referencias.unico) return null;
  const matches = candidatos.filter(e => e.numero.toUpperCase() === referencias.unico);
  if (matches.length !== 1) return null;
  const exp = matches[0];
  return !exp.factura_ecf_id || exp.factura_ecf_id === facturaId ? exp.id : null;
}