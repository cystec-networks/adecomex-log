/**
 * Generador del House Bill of Lading (BL Hijo) emitido por ADECOMEX SRL.
 * Mismo patrón jsPDF + jspdf-autotable que pdf-preliquidacion.ts (A4, portrait).
 */
import logoAsset from "@/assets/logo-adecomex.jpg.asset.json";

export type BlHijoInput = {
  numero: string; // bl_hijo_numero
  referenciaConsolidadora: string; // bl_awb / booking de la operación
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

/** Carga el logo del CDN como dataURL (para doc.addImage). Si falla, se omite sin romper el PDF. */
async function loadLogo(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(logoAsset.url);
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
  const M = 32;
  const contentW = pageW - M * 2;

  // ---- Encabezado: logo a la izquierda, título a la derecha ----
  const logo = await loadLogo();
  if (logo) {
    const h = 52;
    const w = (logo.w / logo.h) * h;
    doc.addImage(logo.dataUrl, "JPEG", M, 30, Math.min(w, 170), h);
  } else {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("ADECOMEX SRL", M, 48);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HOUSE BILL OF LADING", pageW - M, 46, { align: "right" });
  doc.setFontSize(11);
  doc.text(`N°: ${v(input.numero)}`, pageW - M, 64, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90);
  doc.text(`Referencia B/L Consolidador: ${v(input.referenciaConsolidadora)}`, M, 92);
  doc.text(`Emitido: ${v(input.fechaEmision)}`, pageW - M, 92, { align: "right" });
  doc.setTextColor(0);

  // ---- Cajas SHIPPER / CONSIGNEE / NOTIFY PARTY ----
  const boxLines = (lines: string[]) => lines.filter((l) => l && l.trim()).join("\n") || "—";
  autoTable(doc, {
    startY: 104,
    head: [["SHIPPER (EXPORTADOR)", "CONSIGNEE (CONSIGNATARIO)", "NOTIFY PARTY"]],
    body: [[
      boxLines([input.shipper.nombre, input.shipper.direccion, input.shipper.taxId && `Tax ID: ${input.shipper.taxId}`, input.shipper.telefono && `Tel: ${input.shipper.telefono}`, input.shipper.email].filter(Boolean) as string[]),
      boxLines([input.consignee.nombre, input.consignee.direccion, input.consignee.rnc && `RNC: ${input.consignee.rnc}`, input.consignee.telefono && `Tel: ${input.consignee.telefono}`, input.consignee.email].filter(Boolean) as string[]),
      v(input.notifyParty),
    ]],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 7.5 },
    bodyStyles: { fontSize: 8, valign: "top" },
    margin: { left: M, right: M },
  });

  // ---- Datos del viaje ----
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    body: [
      ["Buque", v(input.buque), "Voyage", v(input.voyage)],
      ["Lugar de Recepción", v(input.lugarRecepcion), "Puerto de Carga", v(input.puertoCarga)],
      ["Puerto de Descarga", v(input.puertoDescarga), "Lugar de Entrega", v(input.lugarEntrega)],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3.5 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: 90, cellWidth: 100 },
      2: { fontStyle: "bold", textColor: 90, cellWidth: 100 },
    },
    margin: { left: M, right: M },
  });

  // ---- Tabla principal de carga ----
  const bultos = input.cantidadBultos != null
    ? `${Number(input.cantidadBultos).toLocaleString("en-US")}${input.tipoBultos ? ` ${input.tipoBultos}` : ""}`
    : v(input.tipoBultos);
  const cuerpoCarga = (input.contenedores.length ? input.contenedores : [{ numero: "", sello1: null, sello2: null, tipo: null }]).map(
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
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    head: [["Marcas y Números", "Cantidad y Tipo de Bultos", "Descripción de Mercancía", "Peso Bruto (Kg)", "Volumen (M3)"]],
    body: cuerpoCarga,
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 7.5 },
    bodyStyles: { fontSize: 8, valign: "top" },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 90 },
      3: { cellWidth: 70, halign: "right" },
      4: { cellWidth: 70, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  // ---- Términos de flete + agente de entrega ----
  const terminos = input.terminosFlete
    ? input.terminosFlete.toLowerCase() === "prepaid" ? "PREPAID" : input.terminosFlete.toLowerCase() === "collect" ? "COLLECT" : input.terminosFlete
    : "—";
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    body: [
      ["Términos de Flete", terminos],
      ["Agente de Entrega en Destino", [input.agenteEntrega.nombre, input.agenteEntrega.contacto].filter((s) => s && s.trim()).join("\n") || "—"],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3.5, valign: "top" },
    columnStyles: { 0: { fontStyle: "bold", textColor: 90, cellWidth: 150 } },
    margin: { left: M, right: M },
  });

  // ---- Pie: lugar/fecha + aviso legal ----
  let pieY = (doc as any).lastAutoTable.finalY + 28;
  const aviso =
    `Este documento es un House Bill of Lading emitido por ADECOMEX SRL bajo la referencia del B/L/Booking N° ${v(input.referenciaConsolidadora)} ` +
    "emitido por el agente de carga/consolidador correspondiente. No sustituye ni reemplaza el conocimiento de embarque original " +
    "(Master B/L) emitido por la naviera.";
  const avisoLines = doc.splitTextToSize(aviso, contentW) as string[];
  if (pieY + 14 + avisoLines.length * 10 > pageH - 40) {
    doc.addPage();
    pieY = 60;
  }
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(`Santo Domingo, República Dominicana — ${v(input.fechaEmision)}`, M, pieY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(avisoLines, M, pieY + 16);
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
