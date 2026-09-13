/**
 * Constancia de Inicio de Gestión Logística.
 * Documento breve emitido por ADECOMEX al cliente al iniciar el manejo de su carga.
 * Reutiliza el mismo estilo visual del resto de PDFs del sistema (pdf-preliquidacion.ts).
 */

export type ConstanciaEtapa = { nombre: string; estado: string };

export type ConstanciaInput = {
  numero: string;
  fechaInicio?: string | null;
  cliente?: string | null;
  producto?: string | null;
  origen?: string | null;
  destino?: string | null;
  incoterm?: string | null;
  tipo?: string | null;
  proveedorLogistico?: string | null;
  proveedorEmail?: string | null;
  proveedorTelefono?: string | null;
  responsable?: string | null;
  etapas: ConstanciaEtapa[];
  esMercanciaPeligrosa?: boolean;
  hazmatUnNumero?: string | null;
  hazmatClase?: string | null;
  hazmatGrupoEmpaque?: string | null;
  hazmatPuntoInflamacion?: string | null;
  hazmatNombreTecnico?: string | null;
  hazmatContaminanteMarino?: boolean;
};

const v = (s: string | null | undefined) => (s && String(s).trim() ? String(s) : "—");

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

export async function buildConstanciaLogisticaPdf(input: ConstanciaInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 28;
  const contentW = pageW - M * 2;
  const blue: [number, number, number] = [30, 58, 138];
  const amber: [number, number, number] = [255, 247, 214];
  const amberBorder: [number, number, number] = [194, 116, 0];
  const emitido = new Date().toLocaleDateString("es-DO", { year: "numeric", month: "2-digit", day: "2-digit" });

  const logo = await loadLogo();
  if (logo) {
    const logoW = 142;
    const logoH = Math.min(48, (logo.height / logo.width) * logoW);
    doc.addImage(logo.dataUrl, "PNG", M, 25, logoW, logoH);
  }
  doc.setTextColor(...blue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("CONSTANCIA DE INICIO", pageW - M, 37, { align: "right" });
  doc.text("DE GESTIÓN LOGÍSTICA", pageW - M, 55, { align: "right" });
  doc.setTextColor(0);
  doc.setFontSize(7.5);
  doc.text(`Operación: ${v(input.numero)}`, pageW - M, 69, { align: "right" });
  doc.text(`Fecha de inicio: ${v(input.fechaInicio)}`, pageW - M, 80, { align: "right" });
  doc.text(`Fecha de emisión: ${emitido}`, pageW - M, 91, { align: "right" });
  doc.setDrawColor(...blue);
  doc.setLineWidth(1.5);
  doc.line(M, 101, pageW - M, 101);

  autoTable(doc, {
    startY: 111,
    body: [
      ["Cliente", v(input.cliente), "Producto", v(input.producto)],
      ["Origen", v(input.origen), "Destino", v(input.destino)],
      ["Incoterm", v(input.incoterm), "Modalidad", v(input.tipo)],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, lineColor: 0, lineWidth: 0.5, minCellHeight: 23 },
    columnStyles: {
      0: { fontStyle: "bold", fontSize: 6.5, cellWidth: 70 },
      1: { cellWidth: contentW / 2 - 70 },
      2: { fontStyle: "bold", fontSize: 6.5, cellWidth: 70 },
      3: { cellWidth: contentW / 2 - 70 },
    },
    margin: { left: M, right: M },
  });

  if (input.esMercanciaPeligrosa) {
    const lineas = [
      `UN ${v(input.hazmatUnNumero)} — ${v(input.hazmatNombreTecnico)}`,
      `CLASS ${v(input.hazmatClase)}   ·   PG ${v(input.hazmatGrupoEmpaque)}   ·   FLASH POINT: ${v(input.hazmatPuntoInflamacion) === "—" ? "N/A" : input.hazmatPuntoInflamacion}`,
      ...(input.hazmatContaminanteMarino ? ["MARINE POLLUTANT / CONTAMINANTE MARINO"] : []),
    ];
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["MERCANCÍA PELIGROSA (HAZMAT)"]],
      body: [[lineas.join("\n")]],
      theme: "grid",
      headStyles: { fillColor: amberBorder, textColor: 255, fontSize: 7.5, cellPadding: 5 },
      bodyStyles: { fontSize: 8, fillColor: amber, cellPadding: 7 },
      styles: { lineColor: amberBorder, lineWidth: 1.2 },
      margin: { left: M, right: M },
    });
  }

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 11,
    head: [["Contactos de la gestión", ""]],
    body: [
      ["Proveedor logístico", v(input.proveedorLogistico)],
      ["Correo del proveedor", v(input.proveedorEmail)],
      ["Teléfono del proveedor", v(input.proveedorTelefono)],
      ["Responsable ADECOMEX", v(input.responsable)],
    ],
    theme: "grid",
    headStyles: { fillColor: blue, textColor: 255, fontSize: 7.5, cellPadding: 5 },
    bodyStyles: { fontSize: 8, cellPadding: 5, lineColor: 0, lineWidth: 0.5 },
    columnStyles: { 0: { fontStyle: "bold", fontSize: 6.5, cellWidth: 145 } },
    margin: { left: M, right: M },
  });

  const estadoTexto = (estado: string) =>
    estado === "completada" ? "Completada" : estado === "en_curso" ? "En curso" : "Pendiente";

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 11,
    head: [["#", "Hoja de ruta de la gestión", "Estado"]],
    body: input.etapas.map((e, i) => [String(i + 1), e.nombre, estadoTexto(e.estado)]),
    theme: "grid",
    headStyles: { fillColor: blue, textColor: 255, fontSize: 7.5, cellPadding: 5 },
    bodyStyles: { fontSize: 8, cellPadding: 5, lineColor: 0, lineWidth: 0.5 },
    columnStyles: { 0: { cellWidth: 24, halign: "center" }, 2: { cellWidth: 90 } },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const etapa = input.etapas[data.row.index];
      if (etapa?.estado === "en_curso") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [226, 240, 255];
      } else if (etapa?.estado === "completada") {
        data.cell.styles.textColor = 110;
      }
    },
    margin: { left: M, right: M },
  });

  const nota =
    "Este documento confirma el inicio de la gestión logística por parte de ADECOMEX SRL. " +
    "No sustituye la documentación oficial de embarque (Booking/BL) emitida por el transportista.";
  let notaY = (doc as any).lastAutoTable.finalY + 11;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const lines = doc.splitTextToSize(nota, contentW - 14) as string[];
  const notaH = 20 + lines.length * 10;
  if (notaY + notaH > pageH - 105) {
    doc.addPage();
    notaY = 40;
  }
  doc.setFillColor(...amber);
  doc.setDrawColor(...amberBorder);
  doc.setLineWidth(1.2);
  doc.rect(M, notaY, contentW, notaH, "FD");
  doc.setTextColor(...amberBorder);
  doc.setFont("helvetica", "bold");
  doc.text("ALCANCE DE LA CONSTANCIA", M + 7, notaY + 13);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.text(lines, M + 7, notaY + 25, { lineHeightFactor: 1.25 });

  const footerY = pageH - 88;
  doc.setDrawColor(...blue);
  doc.setLineWidth(1);
  doc.line(M, footerY, pageW - M, footerY);
  doc.setTextColor(...blue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`Responsable de la gestión: ${v(input.responsable)}`, pageW / 2, footerY + 16, { align: "center" });
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("ADECOMEX SRL — Tel. 809-531-3888 — WhatsApp 809-931-3246 — operaciones@adecomex.com", pageW / 2, footerY + 34, { align: "center" });
  doc.setFontSize(6);
  doc.text("Oficina Comercial: Avenida Caonabo 85E, Los Restauradores, Distrito Nacional, Santo Domingo, República Dominicana", pageW / 2, footerY + 47, { align: "center" });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 20, { align: "right" });
  }

  return doc;
}
