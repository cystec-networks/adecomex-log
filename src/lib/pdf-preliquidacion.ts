/**
 * Generador compartido del PDF de Pre-Liquidación de Impuestos.
 * Lo usan tanto el Expediente como la Cotización (estimado comercial).
 * El layout es idéntico en ambos casos; solo cambian los datos de cabecera
 * y, para Cotizaciones, un aviso de estimación referencial.
 */
import { calcImpuestosLinea } from "@/lib/impuestos";
import { FORMULARIO_DUA_RD } from "@/lib/servicio-aduanero";

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
  contenedores?: Array<{ item_no?: number | string | null; numero: string; sello1?: string | null; tipo?: string | null }> | string | null;
  /** Aviso extra visible (Cotizaciones) */
  avisoReferencial?: string | null;
  /** Tasa de Servicio Aduanero calculada (US$) */
  servicioAduaneroUsd?: number | null;
  /** Régimen suspensivo de impuestos: gravamen/ISC/ITBIS en cero. */
  impuestosSuspendidos?: boolean;
};

export async function buildPreLiquidacionPdf(input: PreLiqInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const { infoCols, items: list, seguro, flete, otros, tasaCambio } = input;
  const totalFob = list.reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);

  const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rd = (n: number) => (tasaCambio > 0 ? nf(n * tasaCambio) : "—");

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 24;

  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("ADECOMEX SRL — Gestión y Logística", M, 32);
  doc.setFontSize(11);
  doc.text("PRE-LIQUIDACIÓN DE IMPUESTOS", M, 47);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
  doc.text("(Estimado interno — sujeto a la liquidación oficial de la DGA)", M, 59);
  if (tasaCambio > 0) {
    doc.text(`Tasa oficial: RD$ ${nf(tasaCambio)} por US$1.00`, M, 71);
  } else {
    doc.setTextColor(180, 140, 30);
    doc.text("Sin tasa de cambio registrada — los montos en RD$ no se pueden calcular", M, 71);
    doc.setTextColor(100);
  }
  doc.text(
    `Generado: ${new Date().toLocaleString("es-DO")}   |   Usuario: ${input.usuarioEmail ?? "—"}`,
    M,
    83,
  );
  doc.setTextColor(0);

  let infoStartY = 92;
  if (input.avisoReferencial) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 60, 30);
    const avisoLines = doc.splitTextToSize(input.avisoReferencial, pageW - M * 2) as string[];
    doc.text(avisoLines, M, 94);
    infoStartY = 94 + avisoLines.length * 9 + 4;
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
    styles: { fontSize: 7, cellPadding: 2.5, overflow: "linebreak" },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1 && infoCols[0]?.[data.row.index]?.[0] === "N° Expediente") {
        data.cell.styles.textColor = [190, 30, 44];
        data.cell.styles.fontStyle = "bold";
      }
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: 90, cellWidth: 84 },
      2: { fontStyle: "bold", textColor: 90, cellWidth: 92 },
      4: { fontStyle: "bold", textColor: 90, cellWidth: 82 },
    },
    margin: { left: M, right: M },
  });

  const totals = { fob: 0, cif: 0, grav: 0, isc: 0, itbis: 0, total: 0, cant: 0 };
  const body = list.map((it: any) => {
    const fob = Number(it.valor_fob) || 0;
    const c = calcImpuestosLinea(fob, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis, !!input.impuestosSuspendidos);
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
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Item", "Arancel", "Descripción", "Unidad", "Origen", "Cantidad", "FOB (US$)", "CIF (RD$)", "Gravamen (RD$)", "ISC (RD$)", "ITBIS (RD$)", "Total imp. (RD$)"]],
    body,
    foot: [[
      "", "", "TOTALES", "", "", nf(totals.cant), nf(totals.fob), rd(totals.cif),
      rd(totals.grav), rd(totals.isc), rd(totals.itbis), rd(totals.total),
    ]],
    theme: "grid",
    styles: { cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 58, 138], fontSize: 6.8 },
    bodyStyles: { fontSize: 6.8 },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 6.8 },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 54 }, 3: { cellWidth: 42 }, 4: { cellWidth: 46 },
      5: { halign: "right", cellWidth: 52 }, 6: { halign: "right", cellWidth: 57 }, 7: { halign: "right", cellWidth: 68 },
      8: { halign: "right", cellWidth: 66 }, 9: { halign: "right", cellWidth: 56 }, 10: { halign: "right", cellWidth: 64 }, 11: { halign: "right", cellWidth: 69 },
    },
    margin: { left: M, right: M },
  });

  const detalleCargaStartY = (doc as any).lastAutoTable.finalY + 8;
  const detalleCargaTableWidth = 260;

  autoTable(doc, {
    startY: detalleCargaStartY,
    head: [["Peso de la mercancía", ""]],
    body: [
      ["Peso Bruto", input.pesoBruto != null ? `${nf(Number(input.pesoBruto))} kg` : "—"],
      ["Peso Neto", input.pesoNeto != null ? `${nf(Number(input.pesoNeto))} kg` : "—"],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", textColor: 90, cellWidth: 120 } },
    margin: { left: M },
    tableWidth: detalleCargaTableWidth,
  });

  let detalleCargaEndY = (doc as any).lastAutoTable.finalY;

  if (Array.isArray(input.contenedores) && input.contenedores.length) {
    autoTable(doc, {
      startY: detalleCargaStartY,
      head: [["# Item", "N° Contenedor", "Sello 1", "Tipo"]],
      body: input.contenedores.map((c, i) => [
        c.item_no ?? i + 1,
        c.numero,
        c.sello1 ?? "—",
        c.tipo ?? "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      styles: { cellPadding: 2 },
      margin: { left: pageW - M - detalleCargaTableWidth },
      tableWidth: detalleCargaTableWidth,
    });
    detalleCargaEndY = Math.max(detalleCargaEndY, (doc as any).lastAutoTable.finalY);
  } else if (typeof input.contenedores === "string" && input.contenedores.trim()) {
    autoTable(doc, {
      startY: detalleCargaStartY,
      head: [["Contenedores"]],
      body: input.contenedores.split(/[,;\n/]+/).map((c) => [c.trim()]).filter((r) => r[0]),
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      styles: { cellPadding: 2 },
      margin: { left: pageW - M - detalleCargaTableWidth },
      tableWidth: detalleCargaTableWidth,
    });
    detalleCargaEndY = Math.max(detalleCargaEndY, (doc as any).lastAutoTable.finalY);
  }

  const startResumen = detalleCargaEndY + 8;
  const mostrarRd = tasaCambio > 0;
  const servicioAduaneroUsd = Number(input.servicioAduaneroUsd) || 0;
  const formularioDuaUsd = mostrarRd ? FORMULARIO_DUA_RD / tasaCambio : 0;
  const width = (pageW - M * 2) / 3;
  const filaResumen = (label: string, usd: number) => [label, nf(usd), rd(usd)];
  const grupos = [
    { titulo: "CIF", filas: [
      filaResumen("Total FOB", Number(input.totalFobOverride) || totals.fob),
      filaResumen("Seguro", seguro), filaResumen("Flete", flete), filaResumen("Otros", otros),
      filaResumen("Total CIF", Number(input.totalCifOverride) || totals.cif),
    ] },
    { titulo: "IMPUESTOS", filas: [
      filaResumen("Total Gravamen", totals.grav),
      filaResumen("Total Selectivo (ISC)", totals.isc),
      filaResumen("Total ITBIS", totals.itbis),
      filaResumen("Total de Impuestos", totals.grav + totals.isc + totals.itbis),
    ] },
    { titulo: "SERVICIO ADUANERO / DUA", filas: [
      filaResumen("Servicio Aduanero", servicioAduaneroUsd),
      ["Formulario DUA (RD$258.26 fijo)", mostrarRd ? nf(formularioDuaUsd) : "—", mostrarRd ? nf(FORMULARIO_DUA_RD) : "—"],
      filaResumen("Total Servicios DGA", servicioAduaneroUsd + formularioDuaUsd),
    ] },
  ];
  let resumenEndY = startResumen;
  grupos.forEach(({ titulo, filas }, index) => {
    // Alinear los tres subtotales en la última línea, como en el resumen en pantalla.
    const filasAlineadas = [...filas.slice(0, -1), ...Array.from({ length: 5 - filas.length }, () => ["", "", ""]), filas[filas.length - 1]];
    autoTable(doc, {
      startY: startResumen,
      head: [[titulo, "US$", "RD$"]],
      body: filasAlineadas,
      theme: "grid",
      styles: { fontSize: 7.3, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [30, 58, 138], fontSize: 7.3 },
      columnStyles: {
        0: { cellWidth: width * 0.54 },
        1: { halign: "right", cellWidth: width * 0.21 },
        2: { halign: "right", cellWidth: width * 0.25 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === filasAlineadas.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [245, 247, 250];
        }
      },
      margin: { left: M + index * width, right: 0 },
      tableWidth: width,
    });
    resumenEndY = Math.max(resumenEndY, (doc as any).lastAutoTable.finalY);
  });

  const totalUsd = totals.grav + totals.isc + totals.itbis + servicioAduaneroUsd + formularioDuaUsd;
  const totalY = resumenEndY + 3;
  doc.setFillColor(30, 58, 88);
  doc.rect(M, totalY, pageW - M * 2, 23, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("TOTAL A PAGAR", M + 9, totalY + 15);
  doc.text(`US$ ${nf(totalUsd)}       RD$ ${rd(totalUsd)}`, pageW - M - 9, totalY + 15, { align: "right" });
  doc.setTextColor(0);

  const nota =
    "Este documento es una pre-liquidación estimada generada por ADECOMEX SRL con fines de planificación interna. " +
    "Los montos aquí presentados son referenciales y están sujetos a la liquidación oficial que emita la Dirección General de Aduanas (DGA), " +
    "la cual puede variar según revisión de valor, clasificación arancelaria, origen, cantidad u otros elementos determinados por la autoridad aduanera.";
  let notaY = totalY + 35;
  doc.setFontSize(7); doc.setTextColor(110);
  const lines = doc.splitTextToSize(nota, pageW - M * 2);
  if (notaY + lines.length * 9 > pageH - 34) { doc.addPage(); notaY = 40; }
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
