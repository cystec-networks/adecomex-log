/** Solicitud de espacio y cotización enviada por ADECOMEX antes de confirmar el booking. */

export type SolicitudBookingParty = {
  nombre: string;
  taxId?: string;
  direccion: string;
  telefono: string;
  email: string;
};

export type SolicitudBookingInput = {
  numeroOperacion: string;
  fechaSolicitud: string;
  proveedorLogistico: string;
  responsable: string;
  tipoOperacion: string;
  tipoTransporte: string;
  lugarRecepcion: string;
  puertoCarga: string;
  puertoDescarga: string;
  lugarEntrega: string;
  fechaEmbarque: string;
  shipper: SolicitudBookingParty;
  consignee: SolicitudBookingParty;
  descripcionMercancia: string;
  cantidadBultos: number | null;
  tipoBultos: string;
  pesoBrutoKg: number | null;
  volumenM3: number | null;
  contenedores: Array<{ numero: string; tipo?: string | null }>;
  esMercanciaPeligrosa: boolean;
  hazmat: {
    unNumero: string;
    clase: string;
    grupoEmpaque: string;
    puntoInflamacion: string;
    nombreTecnico: string;
    contaminanteMarino: boolean;
  };
  observaciones: string;
};

const valueOrDash = (text: string | null | undefined) => text?.trim() || "—";
const numberOrDash = (number: number | null | undefined) =>
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

export async function buildSolicitudBookingPdf(input: SolicitudBookingInput) {
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
  const partyText = (party: SolicitudBookingParty) => [
    party.nombre,
    party.taxId ? `TAX ID / RNC: ${party.taxId}` : "",
    party.direccion,
    party.telefono ? `Tel: ${party.telefono}` : "",
    party.email,
  ].filter(Boolean).join("\n");

  const logo = await loadLogo();
  if (logo) {
    const logoWidth = 142;
    const logoHeight = Math.min(48, (logo.height / logo.width) * logoWidth);
    doc.addImage(logo.dataUrl, "PNG", margin, 25, logoWidth, logoHeight);
  }
  doc.setTextColor(...blue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("SOLICITUD DE BOOKING", pageWidth - margin, 40, { align: "right" });
  doc.setTextColor(0);
  doc.setFontSize(7.5);
  doc.text(`Fecha: ${valueOrDash(input.fechaSolicitud)}`, pageWidth - margin, 55, { align: "right" });
  doc.text(`Ref. Operación: ${valueOrDash(input.numeroOperacion)}`, pageWidth - margin, 67, { align: "right" });
  doc.setDrawColor(...blue);
  doc.setLineWidth(1.5);
  doc.line(margin, 78, pageWidth - margin, 78);

  drawCell(margin, 88, contentWidth, 44, "PARA / ATTN.", `${valueOrDash(input.proveedorLogistico)}\nContacto específico: ______________________________`);
  drawCell(margin, 132, contentWidth, 44, "DE", `ADECOMEX SRL — Agencia de Comercio Exterior\nContacto para coordinar: ${valueOrDash(input.responsable)}`);

  doc.setFillColor(...blue);
  doc.rect(margin, 187, contentWidth, 18, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("DATOS DEL EMBARQUE SOLICITADO", margin + 6, 199);
  doc.setTextColor(0);
  const half = contentWidth / 2;
  const shipmentRows: Array<[string, string, string, string]> = [
    ["TIPO DE OPERACIÓN", input.tipoOperacion, "TIPO DE TRANSPORTE", input.tipoTransporte],
    ["LUGAR DE RECEPCIÓN DESEADO", input.lugarRecepcion, "PUERTO DE CARGA DESEADO", input.puertoCarga],
    ["PUERTO DE DESCARGA DESEADO", input.puertoDescarga, "LUGAR DE ENTREGA FINAL", input.lugarEntrega],
  ];
  shipmentRows.forEach((row, index) => {
    const y = 205 + index * 38;
    drawCell(margin, y, half, 38, row[0], row[1]);
    drawCell(margin + half, y, half, 38, row[2], row[3]);
  });
  drawCell(margin, 319, contentWidth, 38, "FECHA DE EMBARQUE DESEADA (TENTATIVA)", input.fechaEmbarque);

  const partyY = 368;
  drawCell(margin, partyY, half, 76, "SHIPPER", partyText(input.shipper), 5, 6.8);
  drawCell(margin + half, partyY, half, 76, "CONSIGNEE", partyText(input.consignee), 5, 6.8);

  const containerTypes = Array.from(new Set(input.contenedores.map((container) => container.tipo?.trim()).filter(Boolean)));
  const containerReference = containerTypes.length
    ? containerTypes.join(" / ")
    : input.contenedores.length
      ? input.contenedores.map((container) => container.numero).filter(Boolean).join(" / ")
      : input.tipoBultos;
  const packages = input.cantidadBultos == null
    ? valueOrDash(input.tipoBultos)
    : `${input.cantidadBultos.toLocaleString("en-US")}${input.tipoBultos ? ` ${input.tipoBultos}` : ""}`;
  autoTable(doc, {
    startY: 455,
    head: [["Descripción de Mercancía", "Cantidad y Tipo de Bultos", "Peso Bruto (Kg)", "Volumen (M3)", "Tipo de Contenedor Requerido"]],
    body: [[valueOrDash(input.descripcionMercancia), packages, numberOrDash(input.pesoBrutoKg), numberOrDash(input.volumenM3), valueOrDash(containerReference)]],
    theme: "grid",
    tableWidth: contentWidth,
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 7, cellPadding: 4, lineColor: 0, lineWidth: 0.5, valign: "top", minCellHeight: 44 },
    headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", halign: "center", fontSize: 6.4, minCellHeight: 27 },
    columnStyles: {
      0: { cellWidth: 172 }, 1: { cellWidth: 92 }, 2: { cellWidth: 67, halign: "right" },
      3: { cellWidth: 62, halign: "right" }, 4: { cellWidth: contentWidth - 393 },
    },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (input.esMercanciaPeligrosa) {
    const hazmatHeight = 82;
    doc.setFillColor(...amber);
    doc.setDrawColor(...amberBorder);
    doc.setLineWidth(1.5);
    doc.rect(margin, y, contentWidth, hazmatHeight, "FD");
    doc.setTextColor(...amberBorder);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("MERCANCÍA PELIGROSA / DANGEROUS GOODS", margin + 7, y + 14);
    doc.setTextColor(0);
    label(`N° UN: ${valueOrDash(input.hazmat.unNumero)}`, margin + 7, y + 31, 7);
    label(`CLASE: ${valueOrDash(input.hazmat.clase)}`, margin + 126, y + 31, 7);
    label(`GRUPO DE EMPAQUE: ${valueOrDash(input.hazmat.grupoEmpaque)}`, margin + 230, y + 31, 7);
    label(`PUNTO DE INFLAMACIÓN: ${valueOrDash(input.hazmat.puntoInflamacion)}`, margin + 389, y + 31, 7);
    label("NOMBRE TÉCNICO", margin + 7, y + 48, 6.2);
    value(input.hazmat.nombreTecnico, margin + 7, y + 61, contentWidth - 14, 2, 7);
    if (input.hazmat.contaminanteMarino) {
      doc.setTextColor(...amberBorder);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.text("CONTAMINANTE MARINO", pageWidth - margin - 7, y + 14, { align: "right" });
    }
    y += hazmatHeight + 10;
  }

  if (input.observaciones.trim()) {
    const observationHeight = 50;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, contentWidth, observationHeight);
    label("OBSERVACIONES / INSTRUCCIONES ESPECIALES", margin + 6, y + 11);
    value(input.observaciones, margin + 6, y + 25, contentWidth - 12, 3, 7.2);
    y += observationHeight + 10;
  }

  const footerY = Math.max(y, pageHeight - 104);
  doc.setDrawColor(...blue);
  doc.setLineWidth(1);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  doc.setTextColor(...blue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text(
    fitLines("Solicitamos cotización y disponibilidad de espacio para el embarque arriba descrito. Quedamos atentos a su confirmación.", contentWidth, 2),
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

export async function generarPdfSolicitudBooking(input: SolicitudBookingInput): Promise<Blob> {
  const doc = await buildSolicitudBookingPdf(input);
  return doc.output("blob");
}