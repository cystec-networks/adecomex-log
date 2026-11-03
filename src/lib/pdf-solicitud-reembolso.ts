/** Solicitud de Reembolso de Gastos enviada al cliente para que transfiera los gastos
 *  operativos adelantados por ADECOMEX durante la gestión del Expediente.
 *  Reutiliza el patrón visual del generador de Cotización de Servicio Logístico. */

export type LineaReembolso = {
  descripcion: string;
  nota?: string | null;
  cantidad: number;
  precio: number;
};

export type SolicitudReembolsoInput = {
  numeroDocumento: string;
  fecha: string;
  cliente: { nombre: string; direccion: string; rnc: string };
  condicion: string;
  concepto: string;
  mercancia: string;
  blGuia: string;
  lineas: LineaReembolso[];
  moneda?: string;
  datosBancarios: { cuenta: string; tipo_cuenta: string; beneficiario: string; banco: string };
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
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (!image) return null;
    // Reducir el logo (original ~1777px, 4.7 MB sin comprimir en el PDF) a ~600px JPEG sobre blanco.
    const targetWidth = Math.min(600, image.naturalWidth);
    const targetHeight = Math.round((image.naturalHeight / image.naturalWidth) * targetWidth);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: targetWidth, height: targetHeight };
  } catch {
    return null;
  }
}

export async function buildSolicitudReembolsoPdf(input: SolicitudReembolsoInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  const blue: [number, number, number] = [30, 58, 138];
  const moneda = input.moneda || "DOP";

  const money = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: moneda }).format(value);

  const fitLines = (text: string, width: number, maxLines: number) => {
    const lines = doc.splitTextToSize(valueOrDash(text), width) as string[];
    if (lines.length <= maxLines) return lines;
    const clipped = lines.slice(0, maxLines);
    const last = clipped[maxLines - 1] ?? "";
    clipped[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 3)).trimEnd()}...`;
    return clipped;
  };
  const drawCell = (
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    text: string,
    maxLines = 2,
    fontSize = 8,
  ) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(x, y, width, height);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(0);
    doc.text(title, x + 5, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.text(fitLines(text, width - 10, maxLines), x + 5, y + 23, { lineHeightFactor: 1.2 });
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
  doc.setFontSize(15);
  doc.text("SOLICITUD DE REEMBOLSO DE GASTOS", pageWidth - margin, 38, { align: "right" });
  doc.setTextColor(0);
  doc.setFontSize(8);
  doc.text(`No.: ${valueOrDash(input.numeroDocumento)}`, pageWidth - margin, 54, { align: "right" });
  doc.text(`Fecha: ${valueOrDash(input.fecha)}`, pageWidth - margin, 66, { align: "right" });
  doc.setDrawColor(...blue);
  doc.setLineWidth(1.5);
  doc.line(margin, 78, pageWidth - margin, 78);

  // Cliente
  const clienteText = [
    input.cliente.nombre,
    input.cliente.direccion,
    input.cliente.rnc ? `RNC: ${input.cliente.rnc}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  drawCell(margin, 88, contentWidth, 56, "CLIENTE", clienteText, 3);

  // Datos de la gestión
  const half = contentWidth / 2;
  drawCell(margin, 144, half, 34, "CONDICIÓN", input.condicion, 1);
  drawCell(margin + half, 144, half, 34, "CONCEPTO", input.concepto, 1);
  drawCell(margin, 178, half, 40, "MERCANCÍA", input.mercancia, 2);
  drawCell(margin + half, 178, half, 40, "BL O GUÍA", input.blGuia, 2);

  // Detalle
  const total = input.lineas.reduce((sum, l) => sum + l.cantidad * l.precio, 0);
  autoTable(doc, {
    startY: 232,
    head: [["Descripción", "Cantidad", "Precio", "Total"]],
    body: [
      ...input.lineas.map((l) => [
        l.nota?.trim() ? `${l.descripcion}\nNota: ${l.nota.trim()}` : l.descripcion,
        String(l.cantidad),
        money(l.precio),
        money(l.cantidad * l.precio),
      ]),
      ["TOTAL", "", "", money(total)],
    ],
    theme: "grid",
    tableWidth: contentWidth,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 6,
      lineColor: 0,
      lineWidth: 0.5,
      valign: "middle",
      minCellHeight: 20,
    },
    headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: contentWidth - 270 },
      1: { cellWidth: 70, halign: "center" },
      2: { cellWidth: 100, halign: "right" },
      3: { cellWidth: 100, halign: "right" },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.row.index === input.lineas.length) {
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.fillColor = [232, 238, 249];
      }
    },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  // Datos bancarios
  doc.setFillColor(...blue);
  doc.rect(margin, y, contentWidth, 18, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("FAVOR REALIZAR LA TRANSFERENCIA A LA SIGUIENTE CUENTA", margin + 6, y + 12);
  doc.setTextColor(0);
  y += 18;
  const b = input.datosBancarios;
  drawCell(margin, y, half, 32, "CUENTA", b.cuenta, 1);
  drawCell(margin + half, y, half, 32, "TIPO DE CUENTA", b.tipo_cuenta, 1);
  drawCell(margin, y + 32, half, 32, "BENEFICIARIO", b.beneficiario, 1);
  drawCell(margin + half, y + 32, half, 32, "BANCO", b.banco, 1);
  y += 74;

  // Pie
  const footerY = Math.max(y, pageHeight - 86);
  doc.setDrawColor(...blue);
  doc.setLineWidth(1);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text(
    "ADECOMEX SRL — Tel. 809-531-3888 — WhatsApp 809-931-3246 — operaciones@adecomex.com",
    pageWidth / 2,
    footerY + 26,
    { align: "center" },
  );
  doc.setFontSize(6);
  doc.text(
    "Oficina Comercial: Avenida Caonabo 85E, Los Restauradores, Distrito Nacional, Santo Domingo, República Dominicana",
    pageWidth / 2,
    footerY + 39,
    { align: "center" },
  );

  return doc;
}

export type EstadoCuentaFila = {
  numeroDoc: string;
  expediente: string;
  mercanciaBl: string;
  fecha: string;
  concepto: string;
  monto: number;
};

export type EstadoCuentaCliente = {
  cliente: { nombre: string; direccion: string; rnc: string };
  filas: EstadoCuentaFila[];
};

/** Estado de Cuenta de Reembolsos Pendientes: una página (o más) por cliente con el
 *  mismo encabezado, franja bancaria y pie que la Solicitud individual. */
export async function buildEstadoCuentaReembolsosPdf(input: {
  fecha: string;
  periodo: string;
  clientes: EstadoCuentaCliente[];
  moneda?: string;
  datosBancarios: SolicitudReembolsoInput["datosBancarios"];
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  const half = contentWidth / 2;
  const blue: [number, number, number] = [30, 58, 138];
  const money = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: input.moneda || "DOP" }).format(v);
  const logo = await loadLogo();

  const drawCell = (x: number, y: number, w: number, h: number, title: string, text: string, maxLines = 2) => {
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.rect(x, y, w, h);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.2); doc.setTextColor(0);
    doc.text(title, x + 5, y + 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const lines = (doc.splitTextToSize(valueOrDash(text), w - 10) as string[]).slice(0, maxLines);
    doc.text(lines, x + 5, y + 23, { lineHeightFactor: 1.2 });
  };

  const header = () => {
    if (logo) {
      const lw = 142;
      doc.addImage(logo.dataUrl, "PNG", margin, 25, lw, Math.min(48, (logo.height / logo.width) * lw));
    }
    doc.setTextColor(...blue); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("ESTADO DE CUENTA - REEMBOLSOS PENDIENTES", pageWidth - margin, 38, { align: "right" });
    doc.setTextColor(0); doc.setFontSize(8);
    doc.text(`Fecha: ${input.fecha}`, pageWidth - margin, 54, { align: "right" });
    doc.text(`Período: ${input.periodo}`, pageWidth - margin, 66, { align: "right" });
    doc.setDrawColor(...blue); doc.setLineWidth(1.5);
    doc.line(margin, 78, pageWidth - margin, 78);
  };

  const footer = () => {
    const fy = pageHeight - 60;
    doc.setDrawColor(...blue); doc.setLineWidth(1);
    doc.line(margin, fy, pageWidth - margin, fy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0);
    doc.text("ADECOMEX SRL — Tel. 809-531-3888 — WhatsApp 809-931-3246 — operaciones@adecomex.com", pageWidth / 2, fy + 16, { align: "center" });
    doc.setFontSize(6);
    doc.text("Oficina Comercial: Avenida Caonabo 85E, Los Restauradores, Distrito Nacional, Santo Domingo, República Dominicana", pageWidth / 2, fy + 28, { align: "center" });
  };

  input.clientes.forEach((grupo, gi) => {
    if (gi > 0) doc.addPage();
    header();
    const c = grupo.cliente;
    drawCell(margin, 88, contentWidth, 56, "CLIENTE",
      [c.nombre, c.direccion, c.rnc ? `RNC: ${c.rnc}` : ""].filter(Boolean).join("\n"), 3);
    const total = grupo.filas.reduce((s, f) => s + f.monto, 0);
    autoTable(doc, {
      startY: 156,
      head: [["No. REEBGVEXP", "Expediente", "Mercancía / BL", "Fecha de generación", "Concepto", "Monto"]],
      body: [
        ...grupo.filas.map((f) => [f.numeroDoc, f.expediente, valueOrDash(f.mercanciaBl), f.fecha, f.concepto, money(f.monto)]),
        [{ content: "TOTAL PENDIENTE", colSpan: 5, styles: { halign: "right" } }, money(total)],
      ],
      theme: "grid",
      margin: { left: margin, right: margin, top: 90, bottom: 80 },
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 5, lineColor: 0, lineWidth: 0.5, valign: "middle" },
      headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 98 }, 1: { cellWidth: 62 }, 3: { cellWidth: 62, halign: "center" },
        4: { cellWidth: 80 }, 5: { cellWidth: 80, halign: "right" },
      },
      didParseCell: (h) => {
        if (h.section === "body" && h.row.index === grupo.filas.length) {
          h.cell.styles.fontStyle = "bold";
          h.cell.styles.fillColor = [232, 238, 249];
        }
      },
      didDrawPage: () => { header(); footer(); },
    });
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    if (y + 82 > pageHeight - 70) { doc.addPage(); header(); footer(); y = 90; }
    doc.setFillColor(...blue); doc.rect(margin, y, contentWidth, 18, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("FAVOR REALIZAR LA TRANSFERENCIA A LA SIGUIENTE CUENTA", margin + 6, y + 12);
    doc.setTextColor(0); y += 18;
    const b = input.datosBancarios;
    drawCell(margin, y, half, 32, "CUENTA", b.cuenta, 1);
    drawCell(margin + half, y, half, 32, "TIPO DE CUENTA", b.tipo_cuenta, 1);
    drawCell(margin, y + 32, half, 32, "BENEFICIARIO", b.beneficiario, 1);
    drawCell(margin + half, y + 32, half, 32, "BANCO", b.banco, 1);
  });
  return doc;
}

export type HonorarioFila = { fecha: string; expediente: string; cliente: string; mercanciaBl: string; monto: number };
export type EstadoCuentaGestor = { proveedor: string; filas: HonorarioFila[] };

/** Estado de cuenta interno de honorarios pendientes por gestor (control del pago semanal). */
export async function buildEstadoCuentaHonorariosPdf(input: { fecha: string; periodo: string; gestores: EstadoCuentaGestor[] }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const blue: [number, number, number] = [30, 58, 138];
  const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "DOP" }).format(v);
  const logo = await loadLogo();
  const header = () => {
    if (logo) doc.addImage(logo.dataUrl, "JPEG", margin, 25, 142, Math.min(48, (logo.height / logo.width) * 142));
    doc.setTextColor(...blue); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("ESTADO DE CUENTA - HONORARIOS DE TERCEROS", pageWidth - margin, 38, { align: "right" });
    doc.setTextColor(0); doc.setFontSize(8);
    doc.text(`Fecha: ${input.fecha}`, pageWidth - margin, 54, { align: "right" });
    doc.text(`Período: ${input.periodo}`, pageWidth - margin, 66, { align: "right" });
    doc.setDrawColor(...blue); doc.setLineWidth(1.5); doc.line(margin, 78, pageWidth - margin, 78);
  };
  const footer = () => {
    const fy = pageHeight - 40;
    doc.setDrawColor(...blue); doc.setLineWidth(1); doc.line(margin, fy, pageWidth - margin, fy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0);
    doc.text("ADECOMEX SRL — Documento de control interno, no válido como factura", pageWidth / 2, fy + 14, { align: "center" });
  };
  input.gestores.forEach((g, gi) => {
    if (gi > 0) doc.addPage();
    header();
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(`GESTOR / PROVEEDOR: ${g.proveedor}`, margin, 98);
    const total = g.filas.reduce((s, f) => s + f.monto, 0);
    autoTable(doc, {
      startY: 108,
      head: [["Fecha", "Expediente", "Cliente", "Mercancía / BL", "Monto"]],
      body: [
        ...g.filas.map((f) => [f.fecha, f.expediente, valueOrDash(f.cliente), valueOrDash(f.mercanciaBl), money(f.monto)]),
        [{ content: "TOTAL PENDIENTE", colSpan: 4, styles: { halign: "right" } }, money(total)],
      ],
      theme: "grid",
      margin: { left: margin, right: margin, top: 90, bottom: 60 },
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 5, lineColor: 0, lineWidth: 0.5, valign: "middle" },
      headStyles: { fillColor: blue, textColor: 255, fontStyle: "bold", fontSize: 7 },
      columnStyles: { 0: { cellWidth: 58, halign: "center" }, 1: { cellWidth: 70 }, 4: { cellWidth: 80, halign: "right" } },
      didParseCell: (h) => {
        if (h.section === "body" && h.row.index === g.filas.length) { h.cell.styles.fontStyle = "bold"; h.cell.styles.fillColor = [232, 238, 249]; }
      },
      didDrawPage: () => { header(); footer(); },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 50;
    if (y < pageHeight - 70) {
      doc.setLineWidth(0.5); doc.setDrawColor(0);
      doc.line(margin, y, margin + 180, y); doc.line(pageWidth - margin - 180, y, pageWidth - margin, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text("Preparado por", margin + 90, y + 11, { align: "center" });
      doc.text("Recibido conforme (gestor)", pageWidth - margin - 90, y + 11, { align: "center" });
    }
  });
  return doc;
}
