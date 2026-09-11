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
};

const v = (s: string | null | undefined) => (s && String(s).trim() ? String(s) : "—");

export async function buildConstanciaLogisticaPdf(input: ConstanciaInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("ADECOMEX SRL — Gestión y Logística", M, 44);
  doc.setFontSize(11);
  doc.text("CONSTANCIA DE INICIO DE GESTIÓN LOGÍSTICA", M, 62);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(
    `Operación N° ${v(input.numero)}   |   Fecha de inicio: ${v(input.fechaInicio)}   |   Emitido: ${new Date().toLocaleString("es-DO")}`,
    M,
    76,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 92,
    body: [
      ["Cliente", v(input.cliente), "Producto", v(input.producto)],
      ["Origen", v(input.origen), "Destino", v(input.destino)],
      ["Incoterm", v(input.incoterm), "Modalidad", v(input.tipo)],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: 90, cellWidth: 90 },
      2: { fontStyle: "bold", textColor: 90, cellWidth: 90 },
    },
    margin: { left: M, right: M },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 14,
    head: [["Contactos de la gestión", ""]],
    body: [
      ["Proveedor logístico", v(input.proveedorLogistico)],
      ["Correo del proveedor", v(input.proveedorEmail)],
      ["Teléfono del proveedor", v(input.proveedorTelefono)],
      ["Responsable ADECOMEX", v(input.responsable)],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: "bold", textColor: 90, cellWidth: 150 } },
    margin: { left: M, right: M },
  });

  const estadoTexto = (estado: string) =>
    estado === "completada" ? "Completada" : estado === "en_curso" ? "En curso" : "Pendiente";

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 14,
    head: [["#", "Hoja de ruta de la gestión", "Estado"]],
    body: input.etapas.map((e, i) => [String(i + 1), e.nombre, estadoTexto(e.estado)]),
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
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
  let notaY = (doc as any).lastAutoTable.finalY + 30;
  doc.setFontSize(8);
  doc.setTextColor(110);
  const lines = doc.splitTextToSize(nota, pageW - M * 2) as string[];
  if (notaY + lines.length * 11 > pageH - 40) {
    doc.addPage();
    notaY = 50;
  }
  doc.text(lines, M, notaY);
  doc.setTextColor(0);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 20, { align: "right" });
  }

  return doc;
}
