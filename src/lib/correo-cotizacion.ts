import { tipoAdjuntoCorreo } from './correo-solicitud';

type Adjunto = { tipo?: string; nombre?: string; storage_path?: string };
export function tipoDocumentoCompra(a: Adjunto) {
  // Legacy drafts classified proformas as commercial invoices; preserve their OCR.
  if (/pro[\s_-]*forma/i.test(`${a.tipo ?? ''} ${a.nombre ?? ''}`)) return 'Factura proforma';
  return tipoAdjuntoCorreo(a.tipo);
}
export function sugerirCotizacionCorreo(s: { bl_awb?: string | null; eta?: string | null; adjuntos?: unknown }) {
  if (s.bl_awb?.trim() || s.eta?.trim() || !Array.isArray(s.adjuntos)) return false;
  const reconocidos = s.adjuntos.map(tipoDocumentoCompra).filter(t => t !== 'Otro');
  return reconocidos.length > 0 && reconocidos.every(t => t === 'Factura proforma');
}