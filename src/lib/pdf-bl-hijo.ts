/** House Bill of Lading emitido por ADECOMEX SRL, maquetado como documento naviero. */

export type BlHijoInput = {
  numero: string; // bl_hijo_numero
  referenciaConsolidadora: string; // bl_awb / booking de la operación
  booking: string;
  fechaEmision: string; // fecha actual al generar
  shipper: { nombre: string; taxId: string; direccion: string; telefono: string; email: string };
  consignee: { nombre: string; rnc: string; direccion: string; telefono: string; email: string };
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

const v = (s: string | null | undefined) => (s && String(s).trim() ? String(s) : "—");
const nf = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Carga el logo público como dataURL. Si falla, conserva un encabezado textual. */
async function loadLogo(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch("/logo-adecomex-horizontal.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 4, h: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

export async function buildBlHijoPdf(input: BlHijoInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 30;
  const contentW = pageW - M * 2;
  doc.setLineWidth(0.5);
  doc.setDrawColor(0);
  doc.setTextColor(0);

  const fitLines = (text: string, width: number, maxLines: number) => {
    const lines = doc.splitTextToSize(v(text), width) as string[];
    if (lines.length <= maxLines) return lines;
    const clipped = lines.slice(0, maxLines);
    const last = clipped[maxLines - 1] ?? "";
    clipped[maxLines - 1] = `${last.replace(/\s+$/, "").slice(0, Math.max(0, last.length - 3))}...`;
    return clipped;
  };
  const label = (text: string, x: number, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(text, x, y);
  };
  const value = (text: string, x: number, y: number, width: number, maxLines = 2, size = 8) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.text(fitLines(text, width, maxLines), x, y);
  };
  const drawLabeledBox = (x: number, y: number, width: number, height: number, title: string, lines: string[]) => {
    doc.rect(x, y, width, height);
    label(title, x + 5, y + 10);
    doc.setLineWidth(0.25);
    doc.line(x, y + 15, x + width, y + 15);
    doc.setLineWidth(0.5);
    const text = lines.filter((line) => line && line.trim()).join("\n") || "—";
    value(text, x + 5, y + 27, width - 10, 10, 7.5);
  };
  const drawVoyageRow = (y: number, leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
    const half = contentW / 2;
    const height = 27;
    doc.rect(M, y, contentW, height);
    doc.line(M + half, y, M + half, y + height);
    label(leftLabel, M + 5, y + 9);
    value(leftValue, M + 5, y + 20, half - 10, 1, 8);
    label(rightLabel, M + half + 5, y + 9);
    value(rightValue, M + half + 5, y + 20, half - 10, 1, 8);
  };

  // Encabezado institucional y referencias.
  const logo = await loadLogo();
  if (logo) {
    const w = 150;
    const h = Math.min(62, (logo.h / logo.w) * w);
    doc.addImage(logo.dataUrl, "PNG", M, 32, w, h);
  } else {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("ADECOMEX SRL", M, 54);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("HOUSE BILL OF LADING", pageW / 2, 108, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("ADECOMEX SRL — Agencia de Comercio Exterior", pageW / 2, 122, { align: "center" });

  const refX = 420;
  const refW = pageW - M - refX;
  doc.rect(refX, 30, refW, 62);
  doc.line(refX, 50, refX + refW, 50);
  doc.line(refX, 71, refX + refW, 71);
  label("B/L NUMBER", refX + 5, 39);
  value(input.numero, refX + 5, 47, refW - 10, 1, 8.5);
  label("REF. B/L CONSOLIDADOR", refX + 5, 59);
  value(input.referenciaConsolidadora, refX + 5, 68, refW - 10, 1, 7.5);
  label("BOOKING N°", refX + 5, 80);
  value(input.booking, refX + 5, 89, refW - 10, 1, 7.5);

  // Partes del conocimiento de embarque.
  const partyY = 145;
  const partyH = 145;
  const partyW = contentW / 3;
  drawLabeledBox(M, partyY, partyW, partyH, "SHIPPER (EXPORTADOR)", [
    input.shipper.nombre, input.shipper.direccion, input.shipper.taxId && `Tax ID: ${input.shipper.taxId}`,
    input.shipper.telefono && `Tel: ${input.shipper.telefono}`, input.shipper.email,
  ].filter(Boolean) as string[]);
  drawLabeledBox(M + partyW, partyY, partyW, partyH, "CONSIGNEE (CONSIGNATARIO)", [
    input.consignee.nombre, input.consignee.direccion, input.consignee.rnc && `RNC: ${input.consignee.rnc}`,
    input.consignee.telefono && `Tel: ${input.consignee.telefono}`, input.consignee.email,
  ].filter(Boolean) as string[]);
  drawLabeledBox(M + partyW * 2, partyY, partyW, partyH, "NOTIFY PARTY", [input.notifyParty || "SAME AS CONSIGNEE"]);

  drawVoyageRow(290, "BUQUE / VESSEL", input.buque, "VOYAGE", input.voyage);
  drawVoyageRow(317, "LUGAR DE RECEPCIÓN", input.lugarRecepcion, "PUERTO DE CARGA", input.puertoCarga);
  drawVoyageRow(344, "PUERTO DE DESCARGA", input.puertoDescarga, "LUGAR DE ENTREGA", input.lugarEntrega);

  // ---- Tabla principal de carga ----
  const bultos = input.cantidadBultos != null
    ? `${Number(input.cantidadBultos).toLocaleString("en-US")}${input.tipoBultos ? ` ${input.tipoBultos}` : ""}`
    : v(input.tipoBultos);
  const contenedores = input.contenedores.length ? input.contenedores : [{ numero: "", sello1: null, sello2: null, tipo: null }];
  const cuerpoCarga = contenedores.map(
    (c, i) => [
      c.numero
        ? [c.numero, c.sello1 && `Sello: ${c.sello1}`, c.sello2 && `Sello 2: ${c.sello2}`, c.tipo && `Tipo: ${c.tipo}`].filter(Boolean).join("\n")
        : "—",
      i === 0 ? bultos : "",
      i === 0 ? v(input.descripcionMercancia) : "",
      i === 0 ? nf(input.pesoBrutoKg) : "",
      i === 0 ? nf(input.volumenM3) : "",
    ],
  );
  if (input.contenedores.length > 1) {
    cuerpoCarga.push([
      "TOTAL",
      bultos,
      "",
      nf(input.pesoBrutoKg),
      nf(input.volumenM3),
    ]);
  }
  autoTable(doc, {
    startY: 379,
    head: [["Marcas y Números", "Cantidad y Tipo de Bultos", "Descripción de Mercancía", "Peso Bruto (Kg)", "Volumen (M3)"]],
    body: cuerpoCarga,
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 7.5 },
    bodyStyles: { fontSize: 8, valign: "top", textColor: 0 },
    didParseCell: (hook) => {
      if (input.contenedores.length > 1 && hook.section === "body" && hook.row.index === cuerpoCarga.length - 1) {
        hook.cell.styles.fontStyle = "bold";
      }
    },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 90 },
      3: { cellWidth: 70, halign: "right" },
      4: { cellWidth: 70, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  // Filas finales, dibujadas como cajas.
  const terminos = input.terminosFlete
    ? input.terminosFlete.toLowerCase() === "prepaid" ? "PREPAID" : input.terminosFlete.toLowerCase() === "collect" ? "COLLECT" : input.terminosFlete
    : "—";
  let finalY = (doc as any).lastAutoTable.finalY + 8;
  const ensureSpace = (needed: number) => {
    if (finalY + needed <= pageH - 28) return;
    doc.addPage();
    doc.setLineWidth(0.5);
    doc.setDrawColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`HOUSE BILL OF LADING — ${v(input.numero)}`, M, 35);
    finalY = 48;
  };
  ensureSpace(73);
  const finalLabelW = 165;
  const drawFinalRow = (title: string, text: string, height: number) => {
    doc.rect(M, finalY, contentW, height);
    doc.line(M + finalLabelW, finalY, M + finalLabelW, finalY + height);
    label(title, M + 5, finalY + 11);
    value(text, M + finalLabelW + 5, finalY + 11, contentW - finalLabelW - 10, 3, 8);
    finalY += height;
  };
  drawFinalRow("TÉRMINOS DE FLETE", terminos, 24);
  drawFinalRow(
    "AGENTE DE ENTREGA EN DESTINO",
    [input.agenteEntrega.nombre, input.agenteEntrega.contacto].filter((s) => s && s.trim()).join(" — ") || "—",
    34,
  );

  let pieY = finalY + 18;
  const aviso =
    `Este documento es un House Bill of Lading emitido por ADECOMEX SRL bajo la referencia del B/L/Booking N° ${v(input.referenciaConsolidadora)} ` +
    "emitido por el agente de carga/consolidador correspondiente. No sustituye ni reemplaza el conocimiento de embarque original " +
    "(Master B/L) emitido por la naviera.";
  const avisoLines = doc.splitTextToSize(aviso, contentW) as string[];
  if (pieY + 18 + avisoLines.length * 9 > pageH - 34) {
    doc.addPage();
    pieY = 48;
  }
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(`Santo Domingo, República Dominicana — ${v(input.fechaEmision)}`, M, pieY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(avisoLines, M, pieY + 16, { lineHeightFactor: 1.25 });
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

export async function generarPdfBlHijo(input: BlHijoInput): Promise<Blob> {
  const doc = await buildBlHijoPdf(input);
  return doc.output("blob");
}
