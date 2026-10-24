import { PDFDocument } from "pdf-lib";

export const PAQUETE_FACTURA_CLIENTE = "Paquete de Envío Factura Cliente";
export const CORREO_CONTABILIDAD = "contabilidad@adecomex.com";
export const FACTURA_PDF_OBLIGATORIA = "No se puede generar el paquete: falta adjuntar el PDF de la Factura de Gestión Aduanal en Finanzas";
export const ORDEN_FACTURA_CLIENTE = [
  { etiqueta: "Factura de Gestión Aduanal", tipos: [] as string[] },
  { etiqueta: "Declaración Única Aduanera (DUA)", tipos: ["Declaración Única Aduanera (DUA)", "DUA"] },
  { etiqueta: "Liquidación de Impuestos", tipos: ["Reporte de Liquidación de Impuestos"] },
  { etiqueta: "Recibo Pago de Impuestos", tipos: ["Recibo Pago de Impuestos"] },
  { etiqueta: "Recibo Pago de Contenedor", tipos: ["Recibo Pago de Contenedor"] },
  { etiqueta: "Factura Pago de Almacenaje", tipos: ["Factura Pago de Almacenaje"] },
  { etiqueta: "Bill of Lading", tipos: ["Bill of Lading"] },
  { etiqueta: "Factura Comercial", tipos: ["Factura comercial"] },
];

/** Los documentos llegan ordenados del más reciente al más antiguo. */
export function fuentesFacturaCliente(docs: { tipo: string; storage_path: string | null }[], pdfFactura?: string | null) {
  return ORDEN_FACTURA_CLIENTE.map((item, i) => ({
    etiqueta: item.etiqueta,
    ruta: i === 0 ? pdfFactura || null : docs.find((d) => item.tipos.includes(d.tipo) && d.storage_path?.toLowerCase().endsWith(".pdf"))?.storage_path ?? null,
  }));
}

/** Exige la factura; omite los demás faltantes conservando el orden. */
export async function combinarFacturaCliente(
  fuentes: ReturnType<typeof fuentesFacturaCliente>,
  descargar: (ruta: string) => Promise<ArrayBuffer>,
) {
  const factura = fuentes[0];
  if (factura?.etiqueta !== ORDEN_FACTURA_CLIENTE[0].etiqueta || !factura.ruta) {
    throw new Error(FACTURA_PDF_OBLIGATORIA);
  }
  const pdf = await PDFDocument.create();
  const faltantes: string[] = [];
  const incluidos: string[] = [];
  for (const fuente of fuentes) {
    if (!fuente.ruta) { faltantes.push(fuente.etiqueta); continue; }
    try {
      const original = await PDFDocument.load(await descargar(fuente.ruta), { ignoreEncryption: true });
      if (!original.getPageCount()) throw new Error("PDF sin páginas");
      const pages = await pdf.copyPages(original, original.getPageIndices());
      pages.forEach((page) => pdf.addPage(page));
      incluidos.push(fuente.etiqueta);
    } catch {
      if (fuente === factura) throw new Error("No se puede generar el paquete: el PDF de la Factura de Gestión Aduanal no está disponible o es inválido. Revisa el archivo adjunto en Finanzas.");
      faltantes.push(`${fuente.etiqueta} (archivo no disponible o PDF inválido)`);
    }
  }
  return { bytes: incluidos.length ? await pdf.save() : null, faltantes, incluidos };
}

export function correoFacturaCliente(numero: string, cliente: { nombre?: string | null; email?: string | null }, encf: string) {
  if (!encf.trim()) throw new Error("Falta el e-NCF de la Factura de Gestión Aduanal en Finanzas para preparar el correo.");
  const params = new URLSearchParams({
    authuser: CORREO_CONTABILIDAD, from: CORREO_CONTABILIDAD, view: "cm", fs: "1",
    to: cliente.email?.trim() || "",
    su: `Factura de Gestión Aduanal - Expediente ${numero}`,
    body: `Estimado Cliente: ${cliente.nombre?.trim() || ""},\n\nEncuentren adjunta la Factura No. ${encf.trim()}, generada para el Registro # ${numero}, para fines de registro y pago.\n\nDe necesitar información adicional favor de contactarnos para su debida retroalimentación.\n\nSaludos cordiales,\n\nContabilidad\n\nADECOMEX SRL`,
  });
  return `https://mail.google.com/mail/?${params}`;
}