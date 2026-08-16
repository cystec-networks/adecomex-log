/**
 * Generador de PDF con el formato visual oficial de ADECOMEX SRL
 * (replica el layout de las Facturas de Crédito Fiscal reales).
 * Se usa tanto para Cotizaciones de Servicios como para Facturas e-CF
 * generadas desde una cotización.
 */
import { fmtLocalDate } from "@/lib/dates";

export const EMPRESA = {
  nombre: "ADECOMEX SRL",
  lineas: [
    "AVENIDA CAONABO 85E",
    "LOS RESTAURADORES",
    "SANTO DOMINGO OESTE 10114 DO",
    "+18095313888",
    "contabilidad@adecomex.com",
    "www.adecomex.com",
    "RNC 130481301",
  ],
  pieTitulo: "SERVICIOS DE GESTION Y LOGISTICA DE CARGAS",
  pieDireccion:
    "Oficina Principal: Calle Resp. San Miguel No. 12, Bayona, Santo Domingo Oeste. Rep. Dom. Tels. 809-237-5418, Móvil: 809-931-3246.",
};

export type DocLinea = {
  codigo?: string | null;
  descripcion: string;
  cantidad: number;
  precio: number;
  gravado: boolean;
  monto: number;
};

export type DocComercial = {
  tipo: "cotizacion" | "factura";
  titulo: string;
  numero: string;
  fecha: string | null;
  fechaSecundaria: string | null;
  cliente: { nombre?: string | null; direccion?: string | null; rnc?: string | null };
  lineas: DocLinea[];
  notas?: string | null;
  moneda?: string;
  subtotal: number;
  impuesto: number;
  total: number;
  saldoPendiente?: number;
};

const nf = (n: number) =>
  (Number(n) || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildDocumentoComercialPdf(d: DocComercial) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const sym = d.moneda === "USD" ? "US$" : d.moneda === "EUR" ? "€" : "RD$";

  // 1. Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(EMPRESA.nombre, M, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70);
  let y = 66;
  for (const l of EMPRESA.lineas) {
    doc.text(l, M, y);
    y += 10;
  }
  doc.setTextColor(0);

  // 2. Título
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(d.titulo, M, y);

  // 3. Bloques de datos
  y += 26;
  const esFactura = d.tipo === "factura";
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(esFactura ? "FACTURAR A" : "COTIZAR A", M, y);
  doc.setFont("helvetica", "normal");
  let yl = y + 12;
  const izq = [d.cliente.nombre ?? "—", d.cliente.direccion ?? "", d.cliente.rnc ? `RNC ${d.cliente.rnc}` : ""]
    .filter(Boolean) as string[];
  for (const l of izq) {
    const wrapped = doc.splitTextToSize(l, 240) as string[];
    doc.text(wrapped, M, yl);
    yl += 11 * wrapped.length;
  }

  const rx = pageW - M;
  const labels: [string, string][] = [
    [esFactura ? "FACTURA N.º" : "COTIZACIÓN N.º", d.numero || "—"],
    ["FECHA", d.fecha ? fmtLocalDate(d.fecha) : "—"],
    [
      esFactura ? "FECHA DE VENCIMIENTO" : "FECHA DE VIGENCIA",
      d.fechaSecundaria ? fmtLocalDate(d.fechaSecundaria) : "—",
    ],
  ];
  let yr = y;
  for (const [k, v] of labels) {
    doc.setFont("helvetica", "bold");
    doc.text(k, rx - 110, yr, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(v, rx, yr, { align: "right" });
    yr += 13;
  }

  // 4. Tabla de líneas
  const startY = Math.max(yl, yr) + 16;
  autoTable(doc, {
    startY,
    head: [["CÓDIGO", "DESCRIPCIÓN", "CANTIDAD", "PRECIO", "IMPUESTO", "MONTO"]],
    body: d.lineas.map((l) => [
      l.codigo ?? "",
      l.descripcion ?? "",
      nf(l.cantidad),
      nf(l.precio),
      l.gravado ? "ITBIS" : "Exento",
      nf(l.monto),
    ]),
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 5, lineWidth: 0.3, lineColor: [210, 210, 210] },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 60 },
      2: { halign: "right", cellWidth: 60 },
      3: { halign: "right", cellWidth: 70 },
      4: { halign: "center", cellWidth: 60 },
      5: { halign: "right", cellWidth: 80 },
    },
    margin: { left: M, right: M },
  });

  // 5. Observaciones + totales
  let yb = (doc as any).lastAutoTable.finalY + 18;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("Observaciones:", M, yb);
  doc.setFont("helvetica", "normal");
  if (d.notas) {
    const wrapped = doc.splitTextToSize(d.notas, 260) as string[];
    doc.text(wrapped, M, yb + 12);
  }

  const totRows: [string, string, boolean][] = [
    ["SUBTOTAL", `${sym} ${nf(d.subtotal)}`, false],
    ["IMPUESTO", `${sym} ${nf(d.impuesto)}`, false],
    ["TOTAL", `${sym} ${nf(d.total)}`, true],
  ];
  let yt = yb;
  for (const [k, v, bold] of totRows) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10 : 9);
    doc.text(k, rx - 110, yt, { align: "right" });
    doc.text(v, rx, yt, { align: "right" });
    yt += 15;
  }
  if (esFactura) {
    yt += 4;
    doc.setDrawColor(200);
    doc.line(rx - 200, yt - 12, rx, yt - 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("SALDO PENDIENTE", rx - 110, yt + 4, { align: "right" });
    doc.text(`${sym} ${nf(d.saldoPendiente ?? d.total)}`, rx, yt + 4, { align: "right" });
    yt += 18;
  }

  // 6. Firmas + pie institucional
  const yf = Math.max(yt + 40, pageH - 110);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0);
  const f1 = esFactura ? "Aprobada por:" : "Cotizado por:";
  const f2 = esFactura ? "Recibí Conforme:" : "Aceptado por:";
  doc.text(`${f1} ____________________________`, M, yf);
  doc.text(`${f2} ____________________________`, pageW / 2 + 10, yf);

  doc.setDrawColor(180);
  doc.line(M, pageH - 62, pageW - M, pageH - 62);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);
  doc.text(EMPRESA.pieTitulo, pageW / 2, pageH - 48, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(doc.splitTextToSize(EMPRESA.pieDireccion, pageW - M * 2) as string[], pageW / 2, pageH - 36, {
    align: "center",
  });
  doc.setTextColor(0);

  return doc;
}
