import type { OcrExtraction } from "./ai-ocr.functions";
import { prepararProductosFactura } from "./factura-expediente-arancel";
import { deduplicarAdjuntosCorreo, type AdjuntoGuardadoCorreo } from "./correo-adjuntos";

export type ArchivoFactura = { filename: string; mime: string; base64: string };
type DependenciasFactura = {
  extraer: (archivo: ArchivoFactura & { lineas_factura: true }) => Promise<OcrExtraction>;
  clasificar: Parameters<typeof prepararProductosFactura>[1];
  buscarTasas: Parameters<typeof prepararProductosFactura>[2];
};

/** Manual upload and email confirmation use the same extraction and enrichment. */
export async function escanearFacturaExpediente(archivo: ArchivoFactura, deps: DependenciasFactura, extraido?: OcrExtraction) {
  const resultado = extraido ?? await deps.extraer({ ...archivo, lineas_factura: true });
  return {
    ...resultado,
    productos_factura: await prepararProductosFactura(resultado.lineas_factura ?? [], deps.clasificar, deps.buscarTasas),
  };
}

/** Old drafts are read once from their stored invoice; new drafts reuse their OCR lines. */
export async function prepararFacturasCorreo(
  adjuntos: AdjuntoGuardadoCorreo[],
  cargar: (adjunto: AdjuntoGuardadoCorreo) => Promise<ArchivoFactura>,
  deps: DependenciasFactura,
) {
  const productos: NonNullable<OcrExtraction["productos_factura"]> = [];
  for (const adjunto of deduplicarAdjuntosCorreo(adjuntos)) {
    if (adjunto.tipo !== "Factura comercial") continue;
    const datos = adjunto.datos;
    const almacenado = Array.isArray(datos?.lineas_factura) && datos.lineas_factura.length
      ? datos as unknown as OcrExtraction : undefined;
    const archivo = almacenado ? { filename: adjunto.nombre, mime: "application/pdf", base64: "" } : await cargar(adjunto);
    const resultado = await escanearFacturaExpediente(archivo, deps, almacenado);
    if (!resultado.productos_factura.length) throw new Error(`No se pudieron leer las mercancías de ${adjunto.nombre}; revisa la factura antes de confirmar.`);
    productos.push(...resultado.productos_factura);
  }
  return productos.map((p, i) => ({ ...p, item_no: i + 1 }));
}