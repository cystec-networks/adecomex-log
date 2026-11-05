export type EvidenciaCarga = {
  declaracion_tipo?: string | null;
  contenedores_completos?: string | null;
  consignatario_unico?: string | null;
  consolidada?: boolean | null;
  varios_embarcadores?: boolean | null;
};
type DatosCarga = {
  tipo_carga?: string | null;
  tipo_carga_confianza?: 'alta' | 'media' | null;
  medio_transporte?: string | null;
  cliente?: string | null;
  contenedores?: { numero: string; sello1?: string | null; tipo?: string | null }[] | null;
  tipo_carga_evidencia?: EvidenciaCarga | null;
};
const normal = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
/** A container list alone does not prove exclusive use; ambiguous inferences stay reviewable. */
export function resolverConfianzaCarga<T extends DatosCarga>(datos: T): T {
  if (datos.tipo_carga !== 'FCL') return datos;
  const e = datos.tipo_carga_evidencia;
  if (!e) return { ...datos, tipo_carga_confianza: 'media' };
  if (/\b(?:FCL|CY[ /-]CY)\b/.test(normal(e.declaracion_tipo ?? '')) && e.consolidada !== true && e.varios_embarcadores !== true) return { ...datos, tipo_carga_confianza: 'alta' };
  const texto = normal(`${e.contenedores_completos ?? ''} ${e.consignatario_unico ?? ''}`);
  const conflicto = e.consolidada !== false || e.varios_embarcadores !== false || /\b(?:LCL|GROUPAGE|CO[ -]?LOAD|MULTIPLE SHIPPERS|VARIOS EMBARCADORES|CONSOLIDATED CARGO|CARGA CONSOLIDADA)\b/.test(texto);
  const completos = /\b(?:FULL CONTAINER(?: LOAD)?|CONTENEDOR(?:ES)? COMPLETO(?:S)?|EXCLUSIVE USE|USO EXCLUSIVO|FCL|CY[ /-]CY)\b/.test(normal(e.contenedores_completos ?? ''));
  const nombre = normal(datos.cliente ?? '').replace(/[^A-Z0-9]/g, '');
  const mismo = nombre.length > 3 && normal(e.consignatario_unico ?? '').replace(/[^A-Z0-9]/g, '').includes(nombre);
  const contenedores = datos.contenedores ?? [];
  const lista = contenedores.length > 0 && contenedores.every(c => /^[A-Z]{4}\d{7}$/.test(c.numero.toUpperCase().replace(/[\s-]/g, '')));
  const alta = !conflicto && completos && mismo && lista && datos.medio_transporte === 'maritimo';
  return { ...datos, tipo_carga_confianza: alta ? 'alta' : 'media' };
}