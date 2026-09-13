/** House Bill of Lading emitido por ADECOMEX SRL, maquetado como documento naviero. */

export type BlHijoInput = {
  numero: string;
  referenciaConsolidadora: string;
  booking: string;
  fechaEmision: string;
  shipper: { nombre: string; taxId: string; direccion: string; telefono: string; email: string };
  consignee: { nombre: string; rnc?: string; taxId?: string; direccion: string; telefono: string; email: string };
  notifyParty: string;
  agenteEntrega: { nombre: string; contacto: string };
  buque: string;
  voyage: string;
  lugarRecepcion: string;
  puertoCarga: string;
  puertoDescarga: string;
  lugarEntrega: string;
  contenedores: Array<{ numero: string; sello1?: string | null; sello2?: string | null; tipo?: string | null }>;
  cantidadBultos: number | null;
  tipoBultos: string | null;
  descripcionMercancia: string;
  pesoBrutoKg: number | null;
  volumenM3: number | null;
  terminosFlete: string;
};

const v = (text: string | null | undefined) => (text && String(text).trim() ? String(text).trim() : "—");
const nf = (number: number | null | undefined) =>
  number == null ? "—" : Number(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export async function buildBlHijoPdf(input: BlHijoInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const leftWidth = 318;
  const rightX = margin + leftWidth;
  const rightWidth = contentWidth - leftWidth;
  const blue: [number, number, number] = [30, 58, 138];

  doc.setDrawColor(0);
  doc.setTextColor(0);
  doc.setLineWidth(0.5);

  const fitLines = (text: string, width: number, maxLines: number) => {
    const lines = doc.splitTextToSize(v(text), width) as string[];
    if (lines.length <= maxLines) return lines;
    const clipped = lines.slice(0, maxLines);
    const finalLine = clipped[maxLines - 1] ?? "";
    clipped[maxLines - 1] = `${finalLine.slice(0, Math.max(0, finalLine.length - 3)).trimEnd()}...`;
    return clipped;
  };

  const label = (text: string, x: number, y: number, size = 5.5) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.text(text, x, y);
  };

  const value = (text: string, x: number, y: number, width: number, maxLines = 2, size = 7.2) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.text(fitLines(text, width, maxLines), x, y, { lineHeightFactor: 1.15 });
  };

  const drawParty = (y: number, height: number, title: string, lines: Array<string | undefined>) => {
    doc.rect(margin, y, leftWidth, height);
    label(title, margin + 4, y + 8);
    doc.setLineWidth(0.25);
    doc.line(margin, y + 12, margin + leftWidth, y + 12);
    doc.setLineWidth(0.5);
    value(lines.filter((line) => line?.trim()).join("\n"), margin + 5, y + 23, leftWidth - 10, 8, 6.8);
  };

  const drawCell = (x: number, y: number, width: number, height: number, title: string, text: string) => {
    doc.rect(x, y, width, height);
    label(title, x + 4, y + 7, 5.1);
    value(text, x + 5, y + 18, width - 10, 1, 7);
  };

  // Encabezado compacto: el logo ya contiene el nombre de ADECOMEX, por lo que no se repite en texto.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("HOUSE BILL OF LADING", pageWidth / 2, 21, { align: "center" });
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text("ORIGINAL", pageWidth / 2, 31, { align: "center" });

  const headerY = 38;
  const partiesBottom = 278;
  drawParty(headerY, 94, "SHIPPER (EXPORTADOR)", [
    input.shipper.nombre,
    input.shipper.direccion,
    input.shipper.taxId && `TAX ID: ${input.shipper.taxId}`,
    input.shipper.telefono && `TEL: ${input.shipper.telefono}`,
    input.shipper.email,
  ]);
  drawParty(headerY + 94, 78, "CONSIGNEE (CONSIGNATARIO)", [
    input.consignee.nombre,
    input.consignee.direccion,
    input.consignee.taxId ? `TAX ID: ${input.consignee.taxId}` : input.consignee.rnc && `RNC: ${input.consignee.rnc}`,
    input.consignee.telefono && `TEL: ${input.consignee.telefono}`,
    input.consignee.email,
  ]);
  drawParty(headerY + 172, 68, "NOTIFY PARTY", [input.notifyParty || "SAME AS CONSIGNEE"]);

  doc.rect(rightX, headerY, rightWidth, partiesBottom - headerY);
  const referenceHeight = 60;
  doc.line(rightX, headerY + referenceHeight, rightX + rightWidth, headerY + referenceHeight);
  doc.line(rightX, headerY + 20, rightX + rightWidth, headerY + 20);
  doc.line(rightX, headerY + 40, rightX + rightWidth, headerY + 40);
  label("B/L NUMBER", rightX + 5, headerY + 8);
  value(input.numero, rightX + 94, headerY + 9, rightWidth - 99, 1, 8.2);
  label("REF. B/L CONSOLIDADOR", rightX + 5, headerY + 28);
  value(input.referenciaConsolidadora, rightX + 94, headerY + 29, rightWidth - 99, 1, 7.2);
  label("BOOKING N°", rightX + 5, headerY + 48);
  value(input.booking, rightX + 94, headerY + 49, rightWidth - 99, 1, 7.2);

  const logo = await loadLogo();
  if (logo) {
    const logoWidth = 150;
    const logoHeight = Math.min(68, (logo.height / logo.width) * logoWidth);
    doc.addImage(logo.dataUrl, "PNG", rightX + (rightWidth - logoWidth) / 2, headerY + 87, logoWidth, logoHeight);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  doc.text(
    ["Calle Resp. San Miguel No. 12, Bayona", "Santo Domingo Oeste, República Dominicana", "809-237-5418  ·  809-931-3246"],
    rightX + rightWidth / 2,
    headerY + 184,
    { align: "center", lineHeightFactor: 1.3 },
  );

  // Datos del viaje en una cuadrícula compacta de cuatro columnas, como el modelo de referencia.
  const voyageY = partiesBottom;
  const widths = [145, 145, 145, contentWidth - 435];
  const xs = [margin, margin + widths[0], margin + widths[0] + widths[1], margin + widths[0] + widths[1] + widths[2]];
  drawCell(xs[0], voyageY, widths[0], 24, "BUQUE / VESSEL", input.buque);
  drawCell(xs[1], voyageY, widths[1], 24, "VOYAGE", input.voyage);
  drawCell(xs[2], voyageY, widths[2], 24, "LUGAR DE RECEPCIÓN", input.lugarRecepcion);
  drawCell(xs[3], voyageY, widths[3], 24, "PUERTO DE CARGA", input.puertoCarga);
  drawCell(xs[0], voyageY + 24, widths[0], 24, "PUERTO DE DESCARGA", input.puertoDescarga);
  drawCell(xs[1], voyageY + 24, widths[1], 24, "LUGAR DE ENTREGA", input.lugarEntrega);
  drawCell(xs[2], voyageY + 24, widths[2], 24, "TÉRMINOS DE FLETE", input.terminosFlete);
  drawCell(xs[3], voyageY + 24, widths[3], 24, "NÚMERO DE ORIGINALES", "0");

  const bultos = input.cantidadBultos == null
    ? v(input.tipoBultos)
    : `${Number(input.cantidadBultos).toLocaleString("en-US")}${input.tipoBultos ? ` ${input.tipoBultos}` : ""}`;
  const containers = input.contenedores.length
    ? input.contenedores
    : [{ numero: "", sello1: null, sello2: null, tipo: null }];
  const compactCargo = containers.length > 6;
  const maxDescriptionLines = compactCargo ? 4 : containers.length > 4 ? 5 : 9;
  const description = fitLines(input.descripcionMercancia, 220, maxDescriptionLines).join("\n");
  const cargoRows = containers.map((container, index) => [
    container.numero
      ? compactCargo
        ? [
            [container.numero, container.tipo].filter(Boolean).join(" / "),
            [container.sello1 && `Sello: ${container.sello1}`, container.sello2 && `Sello 2: ${container.sello2}`].filter(Boolean).join(" / "),
          ].filter(Boolean).join("\n")
        : [container.numero, container.tipo, container.sello1 && `Sello: ${container.sello1}`, container.sello2 && `Sello 2: ${container.sello2}`]
            .filter(Boolean)
            .join("\n")
      : "—",
    index === 0 ? bultos : "",
    index === 0 ? description : "",
    index === 0 ? nf(input.pesoBrutoKg) : "",
    index === 0 ? nf(input.volumenM3) : "",
  ]);
  if (containers.length > 1) cargoRows.push(["TOTAL", bultos, "", nf(input.pesoBrutoKg), nf(input.volumenM3)]);

  const cargoStartY = voyageY + 48;
  const cargoBottomY = 574;
  autoTable(doc, {
    startY: cargoStartY,
    head: [["Marcas y Números", "Cantidad y Tipo de Bultos", "Descripción de Mercancía", "Peso Bruto (Kg)", "Volumen (M3)"]],
    body: cargoRows,
    theme: "grid",
    tableWidth: contentWidth,
    margin: { left: margin, right: margin },
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: compactCargo ? 5.3 : containers.length > 4 ? 6.2 : 6.8,
      cellPadding: compactCargo ? 1.5 : 3,
      lineColor: 0,
      lineWidth: 0.5,
      valign: "top",
      textColor: 0,
    },
    headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", fontSize: 6.1, halign: "center", minCellHeight: 22 },
    bodyStyles: { minCellHeight: compactCargo ? 14 : containers.length > 4 ? 20 : 26 },
    columnStyles: {
      0: { cellWidth: 118 },
      1: { cellWidth: 91 },
      2: { cellWidth: 231 },
      3: { cellWidth: 68, halign: "right" },
      4: { cellWidth: contentWidth - 508, halign: "right" },
    },
    didParseCell: (hook) => {
      if (containers.length > 1 && hook.section === "body" && hook.row.index === cargoRows.length - 1) {
        hook.cell.styles.fontStyle = "bold";
      }
    },
  });

  const tableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (tableEndY < cargoBottomY) doc.rect(margin, tableEndY, contentWidth, cargoBottomY - tableEndY);

  label("PARTICULARS OF GOODS ARE THOSE DECLARED BY SHIPPERS", margin + 5, cargoBottomY - 7, 5.2);

  // Pie integrado y extendido hasta el borde inferior útil de la hoja carta.
  const legalTop = cargoBottomY;
  const legalHeight = 38;
  doc.rect(margin, legalTop, contentWidth, legalHeight);
  const legal =
    `Este documento es un House Bill of Lading emitido por ADECOMEX SRL bajo la referencia del B/L/Booking N° ${v(input.referenciaConsolidadora)} ` +
    "emitido por el agente de carga/consolidador correspondiente. No sustituye ni reemplaza el conocimiento de embarque original (Master B/L) emitido por la naviera.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.7);
  doc.text(fitLines(legal, contentWidth - 10, 4), margin + 5, legalTop + 10, { lineHeightFactor: 1.15 });

  const footerTop = legalTop + legalHeight;
  const footerBottom = pageHeight - 18;
  const footerHeight = footerBottom - footerTop;
  const chargesWidth = 340;
  const third = chargesWidth / 3;
  doc.rect(margin, footerTop, contentWidth, footerHeight);
  doc.line(margin + chargesWidth, footerTop, margin + chargesWidth, footerBottom);
  doc.line(margin, footerTop + 21, margin + chargesWidth, footerTop + 21);
  doc.line(margin + third, footerTop, margin + third, footerBottom);
  doc.line(margin + third * 2, footerTop, margin + third * 2, footerBottom);
  label("DESCRIPCIÓN DE CARGOS", margin + 5, footerTop + 13);
  label("PREPAID", margin + third + third / 2, footerTop + 13);
  label("COLLECT", margin + third * 2 + third / 2, footerTop + 13);
  value("AS AGREED", margin + 5, footerTop + 43, third - 10, 2, 7.2);
  const freight = input.terminosFlete?.toLowerCase();
  if (freight === "prepaid") value("X", margin + third + third / 2, footerTop + 43, 10, 1, 9);
  if (freight === "collect") value("X", margin + third * 2 + third / 2, footerTop + 43, 10, 1, 9);
  label("AGENTE DE ENTREGA EN DESTINO", margin + 5, footerBottom - 28);
  value(
    [input.agenteEntrega.nombre, input.agenteEntrega.contacto].filter((text) => text?.trim()).join(" — "),
    margin + 5,
    footerBottom - 17,
    chargesWidth - 10,
    2,
    6.5,
  );

  const issueX = margin + chargesWidth;
  label("LUGAR Y FECHA DE EMISIÓN / FIRMA", issueX + 5, footerTop + 13);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.text("Santo Domingo, República Dominicana", issueX + (contentWidth - chargesWidth) / 2, footerTop + 47, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(v(input.fechaEmision), issueX + (contentWidth - chargesWidth) / 2, footerTop + 65, { align: "center" });
  doc.setFontSize(5.5);
  doc.text("Página 1 de 1", pageWidth - margin - 4, footerBottom - 5, { align: "right" });

  return doc;
}

export async function generarPdfBlHijo(input: BlHijoInput): Promise<Blob> {
  const doc = await buildBlHijoPdf(input);
  return doc.output("blob");
}