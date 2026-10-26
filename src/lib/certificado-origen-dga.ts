export const TIPO_CERTIFICADO_DGA = "Certificado de Origen DGA";
export type CertificadoDga = {
  numero: string | null; acuerdo: string | null; validez_hasta: string | null;
  tipo_uso: string | null; emisor: string | null; transportacion: string | null;
  exportador: string | null; productor: string | null;
};
export type DeclaracionOrigen = {
  numero_certificado_origen?: string | null; acuerdo_comercial?: string | null;
  acuerdo_codigo?: string | null; preferencia_comercial?: string | null;
};
const normalizar = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
export function decidirCertificadoDga(actual: DeclaracionOrigen, datos: CertificadoDga, acuerdos: { codigo: string; nombre: string }[], confirmado = false) {
  const cambios: DeclaracionOrigen = {};
  const numero = datos.numero?.trim();
  const conflictoNumero = !!numero && !!actual.numero_certificado_origen?.trim() && normalizar(numero) !== normalizar(actual.numero_certificado_origen);
  if (numero && (!conflictoNumero || confirmado)) cambios.numero_certificado_origen = numero;
  const acuerdo = datos.acuerdo?.trim();
  const catalogo = acuerdos.find((a) => normalizar(a.codigo) === normalizar(acuerdo) || normalizar(a.nombre) === normalizar(acuerdo) || (!!acuerdo && normalizar(a.nombre).split(/[^A-Z0-9-]+/).includes(normalizar(acuerdo))));
  const actualCatalogo = acuerdos.find((a) => a.codigo === actual.acuerdo_codigo);
  const seleccionado = actualCatalogo?.nombre || actual.acuerdo_comercial || actual.preferencia_comercial;
  const vacio = !normalizar(seleccionado) || normalizar(seleccionado) === "NINGUNA";
  const coincide = catalogo ? actual.acuerdo_codigo === catalogo.codigo || normalizar(seleccionado) === normalizar(catalogo.nombre) : normalizar(seleccionado) === normalizar(acuerdo);
  const conflictoAcuerdo = !!acuerdo && !vacio && !coincide;
  if (acuerdo && vacio && catalogo) Object.assign(cambios, { acuerdo_codigo: catalogo.codigo, acuerdo_comercial: catalogo.nombre, preferencia_comercial: catalogo.nombre });
  return { cambios, conflictoNumero, conflictoAcuerdo, acuerdoDesconocido: !!acuerdo && !catalogo && vacio };
}
export function normalizarCertificadoDga(raw: Partial<CertificadoDga> | null | undefined): CertificadoDga {
  const campo = (v: unknown) => typeof v === "string" && v.trim() && v.trim() !== "-" ? v.trim().slice(0, 3000) : null;
  return { numero: campo(raw?.numero), acuerdo: campo(raw?.acuerdo), validez_hasta: campo(raw?.validez_hasta), tipo_uso: campo(raw?.tipo_uso), emisor: campo(raw?.emisor), transportacion: campo(raw?.transportacion), exportador: campo(raw?.exportador), productor: campo(raw?.productor) };
}
const INICIO = "[Constancia de Origen DGA]";
const FIN = "[Fin Constancia de Origen DGA]";
export function referenciasCertificadoDga(datos: CertificadoDga) {
  return Object.entries({ "Número": datos.numero, "Acuerdo": datos.acuerdo, "Validez/Hasta": datos.validez_hasta, "Tipo de Uso": datos.tipo_uso, "Emisor": datos.emisor, "Transportación": datos.transportacion, "Exportador": datos.exportador, "Productor": datos.productor }).map(([k, v]) => `${k}: ${v || "No consta"}`).join("\n");
}
export function guardarReferenciaCertificado(obs: string, datos: CertificadoDga) {
  const manual = obs.replace(/\[Constancia de Origen DGA\][\s\S]*?\[Fin Constancia de Origen DGA\]/g, "").trim();
  return [manual, `${INICIO}\n${referenciasCertificadoDga(datos)}\n${FIN}`].filter(Boolean).join("\n\n");
}
export function leerReferenciaCertificado(obs?: string | null) {
  return obs?.split(INICIO)[1]?.split(FIN)[0]?.trim() ?? "";
}