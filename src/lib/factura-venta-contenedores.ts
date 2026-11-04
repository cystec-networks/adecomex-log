export function normalizarReferenciaContenedor(texto: string) {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Match complete ISO-shaped identifiers with separators; never guess missing digits. */
export function detectarContenedoresFactura(textos: readonly string[]): string[] {
  const encontrados = new Set<string>();
  for (const texto of textos) {
    for (const m of texto.toUpperCase().matchAll(/(?<![A-Z0-9])([A-Z](?:[^A-Z0-9]*[A-Z]){3}(?:[^A-Z0-9]*\d){7})(?![A-Z0-9])/g)) {
      encontrados.add(normalizarReferenciaContenedor(m[0]));
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

export function detectarTransportesFactura(textos: readonly string[]): string[] {
  return [...new Set(textos.flatMap(texto => [...texto.toUpperCase().matchAll(/(?<![A-Z0-9])TR\s*[-–—]\s*(\d{6})(?![A-Z0-9])/g)].map(m => `TR-${m[1]}`)))];
}

export function resolverTransporteFactura(contenedores: readonly string[], transportes: readonly TransporteContenedores[], referenciasTr: readonly string[] = []) {
  const codigos = new Set(detectarContenedoresFactura(contenedores));
  const numeros = new Set(detectarTransportesFactura(referenciasTr));
  const porNumero = transportes.filter(t => numeros.has((t.numero_viaje ?? "").trim().toUpperCase()));
  const porContenedor = transportes.filter(t =>
    detectarContenedoresFactura([t.contenedores_detalle ?? ""]).some(c => codigos.has(c)),
  );
  const coincidencias = [...new Map((porNumero.length ? porNumero : porContenedor).map(t => [t.id, t])).values()];
  const unico = coincidencias.length === 1 ? coincidencias[0] : null;
  return { coincidencias, unico, disponible: unico && !unico.factura_ecf_id ? unico : null, criterio: porNumero.length ? "transporte" : "contenedor" };
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

const INICIO_TR = "[Transportes · OCR]";
const FIN_TR = "[Fin transportes OCR]";
export function guardarTransportesOcr(notas: string, referencias: readonly string[]) {
  const inicio = notas.indexOf(INICIO_TR);
  const fin = inicio < 0 ? -1 : notas.indexOf(FIN_TR, inicio);
  const manual = fin < 0 ? notas : `${notas.slice(0, inicio)}${notas.slice(fin + FIN_TR.length)}`;
  const numeros = detectarTransportesFactura(referencias);
  return [manual.trim(), numeros.length ? `${INICIO_TR}\n${numeros.join(", ")}\n${FIN_TR}` : ""].filter(Boolean).join("\n\n");
}
export function transportesOcrGuardados(notas: string) {
  const inicio = notas.indexOf(INICIO_TR);
  const fin = inicio < 0 ? -1 : notas.indexOf(FIN_TR, inicio);
  return fin < 0 ? [] : detectarTransportesFactura([notas.slice(inicio + INICIO_TR.length, fin)]);
}