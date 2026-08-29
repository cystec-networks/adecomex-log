/**
 * Generador compartido del PDF de Pre-Liquidación de Impuestos.
 * Lo usan tanto el Expediente como la Cotización (estimado comercial).
 * El layout es idéntico en ambos casos; solo cambian los datos de cabecera
 * y, para Cotizaciones, un aviso de estimación referencial.
 */
import { calcImpuestosLinea } from "@/lib/impuestos";

export type PreLiqItem = {
  item_no?: number | string | null;
  codigo_arancelario?: string | null;
  detalle_producto?: string | null;
  unidad_medida?: string | null;
  origen?: string | null;
  cantidad?: number | string | null;
  valor_fob?: number | string | null;
  pct_gravamen?: number | null;
  aplica_isc?: boolean | null;
  pct_isc?: number | null;
  pct_itbis?: number | null;
};

export type PreLiqInput = {
  /** Columnas de información de la cabecera (3 columnas x 4 filas) */
  infoCols: [string, string][][];
  items: PreLiqItem[];
  seguro: number;
  flete: number;
  otros: number;
  tasaCambio: number;
  usuarioEmail?: string | null;
  totalFobOverride?: number | null;
  totalCifOverride?: number | null;
  pesoBruto?: number | null;
  pesoNeto?: number | null;
  contenedores?: string | null;
  /** Aviso extra visible (Cotizaciones) */
  avisoReferencial?: string | null;
};

export async function buildPreLiquidacionPdf(input: PreLiqInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const { infoCols, items: list, seguro, flete, otros, tasaCambio } = input;
  const totalFob = list.reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);

  const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rd = (n: number) => (tasaCambio > 0 ? nf(n * tasaCambio) : "—");

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 32;

  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("ADECOMEX SRL — Gestión y Logística", M, 40);
  doc.setFontSize(11);
  doc.text("PRE-LIQUIDACIÓN DE IMPUESTOS", M, 58);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
  doc.text("(Estimado interno — sujeto a la liquidación oficial de la DGA)", M, 70);
  if (tasaCambio > 0) {
    doc.text(`Tasa de cambio: RD$ ${nf(tasaCambio)} por US$1.00`, M, 82);
  } else {
    doc.setTextColor(180, 140, 30);
    doc.text("Sin tasa de cambio registrada — los montos en RD$ no se pueden calcular", M, 82);
    doc.setTextColor(100);
  }
  doc.text(
    `Generado: ${new Date().toLocaleString("es-DO")}   |   Usuario: ${input.usuarioEmail ?? "—"}`,
    M,
    94,
  );
  doc.setTextColor(0);

  let infoStartY = 106;
  if (input.avisoReferencial) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 60, 30);
    const avisoLines = doc.splitTextToSize(input.avisoReferencial, pageW - M * 2) as string[];
    doc.text(avisoLines, M, 108);
    infoStartY = 108 + avisoLines.length * 10 + 6;
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
  }

  const [c1, c2, c3] = infoCols;
  const infoBody = [0, 1, 2, 3].map((i) => [
    c1[i]?.[0] ?? "", c1[i]?.[1] ?? "", c2[i]?.[0] ?? "", c2[i]?.[1] ?? "", c3[i]?.[0] ?? "", c3[i]?.[1] ?? "",
  ]);
  autoTable(doc, {
    startY: infoStartY,
    body: infoBody,
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: 90, cellWidth: 72 },
      2: { fontStyle: "bold", textColor: 90, cellWidth: 78 },
      4: { fontStyle: "bold", textColor: 90, cellWidth: 72 },
    },
    margin: { left: M, right: M },
  });

  const totals = { fob: 0, cif: 0, grav: 0, isc: 0, itbis: 0, total: 0, cant: 0 };
  const body = list.map((it: any) => {
    const fob = Number(it.valor_fob) || 0;
    const c = calcImpuestosLinea(fob, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis);
    totals.fob += fob; totals.cif += c.cifLinea; totals.grav += c.gravamen;
    totals.isc += c.selectivo; totals.itbis += c.itbis; totals.total += c.total;
    totals.cant += Number(it.cantidad) || 0;
    return [
      it.item_no ?? "",
      it.codigo_arancelario ?? "—",
      it.detalle_producto ?? "—",
      it.unidad_medida ?? "—",
      it.origen ?? "—",
      nf(Number(it.cantidad) || 0),
      nf(fob),
      rd(c.cifLinea),
      rd(c.gravamen),
      rd(c.selectivo),
      rd(c.itbis),
      rd(c.total),
    ];
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 12,
    head: [["Item", "Arancel", "Descripción", "Unidad", "Origen", "Cantidad", "FOB (US$)", "CIF (RD$)", "Gravamen (RD$)", "ISC (RD$)", "ITBIS (RD$)", "Total imp. (RD$)"]],
    body,
    foot: [[
      "", "", "TOTALES", "", "", nf(totals.cant), nf(totals.fob), rd(totals.cif),
      rd(totals.grav), rd(totals.isc), rd(totals.itbis), rd(totals.total),
    ]],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 7 },
    bodyStyles: { fontSize: 6.8 },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 }, 1: { cellWidth: 50 }, 3: { cellWidth: 34 }, 4: { cellWidth: 44 },
      5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
      8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" },
    },
    margin: { left: M, right: M },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 12,
    head: [["Peso de la mercancía", ""]],
    body: [
      ["Peso Bruto", input.pesoBruto != null ? `${nf(Number(input.pesoBruto))} kg` : "—"],
      ["Peso Neto", input.pesoNeto != null ? `${nf(Number(input.pesoNeto))} kg` : "—"],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { fontStyle: "bold", textColor: 90, cellWidth: 120 } },
    margin: { left: M, right: M },
    tableWidth: 300,
  });

  const contenedores = String(input.contenedores ?? "").trim();
  if (contenedores) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [["Contenedores"]],
      body: contenedores.split(/[,;\n/]+/).map((c) => [c.trim()]).filter((r) => r[0]),
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: M, right: M },
      tableWidth: 300,
    });
  }

  const startResumen = (doc as any).lastAutoTable.finalY + 14;
  const mostrarRd = tasaCambio > 0;
  const resumenFontSize = startResumen + (mostrarRd ? 170 : 150) > pageH - 40 ? 7 : 8;

  const filaResumen = (label: string, usd: number) =>
    mostrarRd ? [label, rd(usd), nf(usd)] : [label, nf(usd)];

  autoTable(doc, {
    startY: startResumen,
    head: [mostrarRd ? ["Valores", "RD$", "US$"] : ["Valores", "US$"]],
    body: [
      filaResumen("Total FOB", Number(input.totalFobOverride) || totals.fob),
      filaResumen("Seguro", seguro),
      filaResumen("Flete", flete),
      filaResumen("Otros", otros),
      filaResumen("Total CIF", Number(input.totalCifOverride) || totals.cif),
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: resumenFontSize },
    bodyStyles: { fontSize: resumenFontSize },
    columnStyles: mostrarRd
      ? {
          0: { fontStyle: "bold", textColor: 90, cellWidth: 100 },
          1: { halign: "right", cellWidth: 70 },
          2: { halign: "right", cellWidth: 70 },
        }
      : { 0: { fontStyle: "bold", textColor: 90, cellWidth: 110 }, 1: { halign: "right" } },
    margin: { left: M },
    tableWidth: 240,
  });
  autoTable(doc, {
    startY: startResumen,
    head: [mostrarRd ? ["Impuestos estimados", "RD$", "US$"] : ["Impuestos estimados", "US$"]],
    body: [
      filaResumen("Gravamen", totals.grav),
      filaResumen("Selectivo (ISC)", totals.isc),
      filaResumen("ITBIS", totals.itbis),
      filaResumen("Total Impuestos Estimados", totals.grav + totals.isc + totals.itbis),
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: resumenFontSize },
    bodyStyles: { fontSize: resumenFontSize },
    columnStyles: mostrarRd
      ? {
          0: { fontStyle: "bold", textColor: 90, cellWidth: 120 },
          1: { halign: "right", cellWidth: 60 },
          2: { halign: "right", cellWidth: 60 },
        }
      : { 0: { fontStyle: "bold", textColor: 90, cellWidth: 140 }, 1: { halign: "right" } },
    margin: { left: pageW - M - 240 },
    tableWidth: 240,
  });

  const nota =
    "Este documento es una pre-liquidación estimada generada por ADECOMEX SRL con fines de planificación interna. " +
    "Los montos aquí presentados son referenciales y están sujetos a la liquidación oficial que emita la Dirección General de Aduanas (DGA), " +
    "la cual puede variar según revisión de valor, clasificación arancelaria, origen, cantidad u otros elementos determinados por la autoridad aduanera.";
  let notaY = (doc as any).lastAutoTable.finalY + 36;
  doc.setFontSize(7.5); doc.setTextColor(110);
  const lines = doc.splitTextToSize(nota, pageW - M * 2);
  if (notaY + lines.length * 10 > pageH - 40) { doc.addPage(); notaY = 50; }
  doc.text(lines, M, notaY);
  doc.setTextColor(0);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 20, { align: "right" });
  }

  return { doc, totals };
}
