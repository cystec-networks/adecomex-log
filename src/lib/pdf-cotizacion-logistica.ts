/** Cotización de servicio logístico enviada al cliente antes de iniciar la operación.
 *  Documento referencial: cubre flete/seguro/gastos locales/otros, sin impuestos ni aduana. */

export type CotizacionLogisticaInput = {
  numeroOperacion: string;
  fechaEmision: string;
  fechaVigencia: string;
  cliente: { nombre: string; rnc: string; contacto: string };
  tipoOperacion: string;
  tipoTransporte: string;
  origen: string;
  destino: string;
  descripcionMercancia: string;
  pesoBrutoKg: number | null;
  volumenM3: number | null;
  moneda: string;
  fleteMonto: number | null;
  seguroMonto: number | null;
  gastosLocalesMonto: number | null;
  otrosMonto: number | null;
  responsable: string;
  esMercanciaPeligrosa?: boolean;
  hazmatRecargo?: number | null;
};

const valueOrDash = (text: string | null | undefined) => text?.trim() || "—";

async function loadLogo(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const response = await fetch("/logo-adecomex-horizontal.png");
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ width: 4, height: 1 });
      image.src = dataUrl;
    });
    return { dataUrl, ...dimensions };
  } catch {
    return null;
  }
}

export async function buildCotizacionLogisticaPdf(input: CotizacionLogisticaInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  const blue: [number, number, number] = [30, 58, 138];
  const amber: [number, number, number] = [255, 247, 214];
  const amberBorder: [number, number, number] = [194, 116, 0];

  const money = (value: number | null) =>
    value == null
      ? "—"
      : new Intl.NumberFormat("en-US", { style: "currency", currency: input.moneda || "USD" }).format(value);

  const fitLines = (text: string, width: number, maxLines: number) => {
    const lines = doc.splitTextToSize(valueOrDash(text), width) as string[];
    if (lines.length <= maxLines) return lines;
    const clipped = lines.slice(0, maxLines);
    const last = clipped[maxLines - 1] ?? "";
    clipped[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 3)).trimEnd()}...`;
    return clipped;
  };
  const label = (text: string, x: number, y: number, size = 6.2) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(0);
    doc.text(text, x, y);
  };
  const value = (text: string, x: number, y: number, width: number, maxLines = 2, size = 8) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(0);
    doc.text(fitLines(text, width, maxLines), x, y, { lineHeightFactor: 1.2 });
  };
  const drawCell = (x: number, y: number, width: number, height: number, title: string, text: string, maxLines = 2, fontSize = 7.5) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(x, y, width, height);
    label(title, x + 5, y + 10);
    value(text, x + 5, y + 23, width - 10, maxLines, fontSize);
  };

  // Encabezado
  const logo = await loadLogo();
  if (logo) {
    const logoWidth = 142;
    const logoHeight = Math.min(48, (logo.height / logo.width) * logoWidth);
    doc.addImage(logo.dataUrl, "PNG", margin, 25, logoWidth, logoHeight);
  }
  doc.setTextColor(...blue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("COTIZACIÓN DE SERVICIO LOGÍSTICO", pageWidth - margin, 38, { align: "right" });
  doc.setTextColor(0);
  doc.setFontSize(7.5);
  doc.text(`Ref: ${valueOrDash(input.numeroOperacion)}`, pageWidth - margin, 54, { align: "right" });
  doc.text(`Fecha de emisión: ${valueOrDash(input.fechaEmision)}`, pageWidth - margin, 66, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(`Vigente hasta: ${valueOrDash(input.fechaVigencia)}`, pageWidth - margin, 78, { align: "right" });
  doc.setDrawColor(...blue);
  doc.setLineWidth(1.5);
  doc.line(margin, 88, pageWidth - margin, 88);

  // Para / Cliente
  const clienteText = [
    input.cliente.nombre,
    input.cliente.rnc ? `RNC: ${input.cliente.rnc}` : "",
    input.cliente.contacto ? `Contacto: ${input.cliente.contacto}` : "",
  ].filter(Boolean).join("\n");
  drawCell(margin, 98, contentWidth, 50, "PARA / CLIENTE", clienteText, 3);

  // Resumen del embarque
  doc.setFillColor(...blue);
  doc.rect(margin, 160, contentWidth, 18, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("RESUMEN DEL EMBARQUE", margin + 6, 172);
  doc.setTextColor(0);
  const half = contentWidth / 2;
  const summaryRows: Array<[string, string, string, string]> = [
    ["TIPO DE OPERACIÓN", input.tipoOperacion, "TIPO DE TRANSPORTE", input.tipoTransporte],
    ["ORIGEN", input.origen, "DESTINO", input.destino],
    ["DESCRIPCIÓN DE MERCANCÍA", input.descripcionMercancia, "PESO BRUTO / VOLUMEN",
      `${input.pesoBrutoKg != null ? `${input.pesoBrutoKg.toLocaleString("en-US", { minimumFractionDigits: 2 })} Kg` : "—"} / ${input.volumenM3 != null ? `${input.volumenM3.toLocaleString("en-US", { minimumFractionDigits: 2 })} M3` : "—"}`],
  ];
  summaryRows.forEach((row, index) => {
    const y = 178 + index * 38;
    drawCell(margin, y, half, 38, row[0], row[1]);
    drawCell(margin + half, y, half, 38, row[2], row[3]);
  });

  // Desglose de costos
  const costos: Array<[string, number | null]> = [
    [`Flete ${input.tipoTransporte === "Aéreo" ? "Aéreo" : "Marítimo"}`, input.fleteMonto],
    ["Seguro", input.seguroMonto],
    ["Gastos Locales", input.gastosLocalesMonto],
    ["Otros", input.otrosMonto],
    ...(input.esMercanciaPeligrosa && input.hazmatRecargo != null
      ? [["Recargo Mercancía Peligrosa", input.hazmatRecargo] as [string, number | null]]
      : []),
  ];
  const total = costos.reduce<number>((sum, [, monto]) => sum + (monto ?? 0), 0);
  autoTable(doc, {
    startY: 302,
    head: [["Concepto", `Monto (${input.moneda || "USD"})`]],
    body: [
      ...costos.map(([concepto, monto]) => [concepto, money(monto)]),
      ["TOTAL", money(total)],
    ],
    theme: "grid",
    tableWidth: contentWidth,
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6, lineColor: 0, lineWidth: 0.5, valign: "middle", minCellHeight: 22 },
    headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: contentWidth - 150 }, 1: { cellWidth: 150, halign: "right" } },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.row.index === costos.length) {
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.fillColor = [232, 238, 249];
      }
    },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

  // Aviso de vigencia y naturaleza referencial
  const avisoTexto =
    "Esta cotización tiene una vigencia de 15 días a partir de la fecha de emisión. Las tarifas de flete están sujetas a cambios por parte de la naviera/aerolínea y pueden variar al momento de la confirmación del embarque. Esta cotización corresponde exclusivamente al servicio de gestión logística — no incluye aranceles, impuestos ni gastos aduaneros, los cuales se cotizan por separado.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const avisoLines = doc.splitTextToSize(avisoTexto, contentWidth - 14) as string[];
  const avisoHeight = 20 + avisoLines.length * 10;
  doc.setFillColor(...amber);
  doc.setDrawColor(...amberBorder);
  doc.setLineWidth(1.5);
  doc.rect(margin, y, contentWidth, avisoHeight, "FD");
  doc.setTextColor(...amberBorder);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("VIGENCIA Y ALCANCE DE LA COTIZACIÓN", margin + 7, y + 13);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.text(avisoLines, margin + 7, y + 25, { lineHeightFactor: 1.25 });
  y += avisoHeight + 10;

  // Pie
  const footerY = Math.max(y, pageHeight - 104);
  doc.setDrawColor(...blue);
  doc.setLineWidth(1);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  doc.setTextColor(...blue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text(
    fitLines(
      `Para consultas sobre esta cotización puede contactar a ${valueOrDash(input.responsable)} o escribirnos a nuestras líneas de atención.`,
      contentWidth,
      2,
    ),
    pageWidth / 2,
    footerY + 18,
    { align: "center", lineHeightFactor: 1.25 },
  );
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("ADECOMEX SRL — Tel. 809-531-3888 — WhatsApp 809-931-3246 — operaciones@adecomex.com", pageWidth / 2, footerY + 48, { align: "center" });
  doc.setFontSize(6);
  doc.text("Oficina Comercial: Avenida Caonabo 85E, Los Restauradores, Distrito Nacional, Santo Domingo, República Dominicana", pageWidth / 2, footerY + 61, { align: "center" });

  return doc;
}

export async function generarPdfCotizacionLogistica(input: CotizacionLogisticaInput): Promise<Blob> {
  const doc = await buildCotizacionLogisticaPdf(input);
  return doc.output("blob");
}
