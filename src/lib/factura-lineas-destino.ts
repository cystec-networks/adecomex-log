import { resolverTransporteFactura, type TransporteContenedores } from './factura-venta-contenedores';
import { calcLinea, type LineaInput } from './facturas-ecf';

export function tipoServicioLinea(descripcion: string) {
  const s = descripcion.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/transporte|flete|retorno|demora/.test(s)) return 'transporte';
  if (/gestion|aduanal|vuce|honorarios/.test(s)) return 'expediente';
  return null;
}
export function facturaMixta(lineas: readonly Pick<LineaInput, 'descripcion'>[]) {
  return lineas.some(l => tipoServicioLinea(l.descripcion) === 'expediente') && lineas.some(l => tipoServicioLinea(l.descripcion) === 'transporte');
}
export function resolverTransporteAcotado(contenedores: readonly string[], filas: readonly (TransporteContenedores & { expediente_id?: string | null })[], tr: readonly string[], expedienteId?: string | null) {
  const directo = resolverTransporteFactura([], filas, tr);
  if (directo.coincidencias.length) return directo;
  if (expedienteId) {
    const local = resolverTransporteFactura(contenedores, filas.filter(t => t.expediente_id === expedienteId));
    if (local.coincidencias.length) return local;
  }
  return resolverTransporteFactura(contenedores, filas);
}
export function importeLineaDestino(l: LineaInput) { return Math.round((calcLinea(l) + l.itbis) * 100) / 100; }