/** Match complete ISO-shaped identifiers; never guess missing digits or enforce a guessed check digit. */
export function detectarContenedoresFactura(textos: readonly string[]): string[] {
  const encontrados = new Set<string>();
  for (const texto of textos) {
    for (const m of texto.toUpperCase().matchAll(/\b([A-Z]{4})[\s-]*(\d{7})\b/g)) {
      encontrados.add(`${m[1]}${m[2]}`);
    }
  }
  return [...encontrados];
}

export type TransporteContenedores = {
  id: string;
  numero_viaje: string | null;
  contenedores_detalle: string | null;
  factura_ecf_id: string | null;
  factura_numero: string | null;
  factura_fecha: string | null;
  ingreso_facturado: number | null;
};

export function resolverTransporteFactura(contenedores: readonly string[], transportes: readonly TransporteContenedores[]) {
  const codigos = new Set(detectarContenedoresFactura(contenedores));
  const coincidencias = [...new Map(transportes.filter(t =>
    detectarContenedoresFactura([t.contenedores_detalle ?? ""]).some(c => codigos.has(c)),
  ).map(t => [t.id, t])).values()];
  const unico = coincidencias.length === 1 ? coincidencias[0] : null;
  return { coincidencias, unico, disponible: unico && !unico.factura_ecf_id ? unico : null };
}

const INICIO = "[Contenedores · OCR]";
const FIN = "[Fin contenedores OCR]";
export function guardarContenedoresOcr(notas: string, contenedores: readonly string[]) {
  const inicio = notas.indexOf(INICIO);
  const fin = inicio < 0 ? -1 : notas.indexOf(FIN, inicio);
  const manual = fin < 0 ? notas : `${notas.slice(0, inicio)}${notas.slice(fin + FIN.length)}`;
  const codigos = detectarContenedoresFactura(contenedores);
  return [manual.trim(), codigos.length ? `${INICIO}\n${codigos.join(", ")}\n${FIN}` : ""].filter(Boolean).join("\n\n");
}
export function contenedoresOcrGuardados(notas: string) {
  const inicio = notas.indexOf(INICIO);
  const fin = inicio < 0 ? -1 : notas.indexOf(FIN, inicio);
  return fin < 0 ? [] : detectarContenedoresFactura([notas.slice(inicio + INICIO.length, fin)]);
}