import type { Tables } from "@/integrations/supabase/types";
import { ordenEstadoLabel } from "@/lib/estados-orden";
import membreteAsset from "@/assets/oficio-membrete.png.asset.json";

type RGB = [number, number, number];
export type PortadaOrdenDatos = {
  orden: Tables<"ordenes">;
  cliente: { nombre: string | null; rnc: string | null } | null;
  productos: Tables<"orden_productos">[];
  gestor: string | null;
  usuario: string;
  generado: Date;
};

export const fechaHoraPortada = (fecha: Date) => fecha.toLocaleString("es-DO", {
  timeZone: "America/Santo_Domingo", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

export function datosOperacionPortada(o: Tables<"ordenes">) {
  return { origen: o.origen, destino: o.destino, incoterm: o.incoterm,
    tipo: o.cot_tipo_mercancia, peso: o.peso_kg, volumen: o.volumen_m3,
    tarifa: o.tarifa_propuesta, moneda: o.moneda ?? "USD", cotizacion: o.cot_numero, notas: o.cot_notas };
}

const texto = (v: unknown) => v == null || String(v).trim() === "" ? "—" : String(v);
const numero = (v: number | null) => v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Read-only vector cover; table pagination preserves every product and long note. */
export async function generarPortadaOrdenPdf(d: PortadaOrdenDatos) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const styles = getComputedStyle(document.documentElement);
  const color = (role: string): RGB => {
    const raw = styles.getPropertyValue(`--pdf-portada-${role}`).trim().replace("#", "");
    const hex = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
    if (!/^[\da-f]{6}$/i.test(hex)) throw new Error("No se pudo cargar el diseño de la portada");
    return [0, 2, 4].map((n) => parseInt(hex.slice(n, n + 2), 16)) as RGB;
  };
  const heading = color("heading"), border = color("border"), paper = color("paper"), ink = color("ink"), muted = color("muted");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = new URL(membreteAsset.url, window.location.origin).href;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo cargar el logo ADECOMEX");
  ctx.drawImage(img, 0, 0);
  const logo = canvas.toDataURL("image/png");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight(), m = 36, width = w - m * 2;
  doc.setProperties({ title: `Portada de la Orden de Compra ${d.orden.numero ?? ""}`, author: d.usuario, creator: "ADECOMEX SRL" });
  const drawn = new Set<number>();
  const header = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (drawn.has(page)) return;
    drawn.add(page);
    const logoH = 52, logoW = img.naturalWidth / img.naturalHeight * logoH;
    doc.addImage(logo, "PNG", m, 28, logoW, logoH);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...ink);
    doc.text("RNC: 130-481301", m + 52, 94);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...heading); doc.setFontSize(14);
    const title = doc.splitTextToSize("PORTADA DE LA ORDEN DE COMPRA", width - logoW - 16) as string[];
    doc.text(title, w - m, 42, { align: "right" });
    doc.setTextColor(...color("number")); doc.setFontSize(20);
    doc.text(doc.splitTextToSize(texto(d.orden.numero), width - logoW - 16), w - m, 84, { align: "right" });
    doc.setDrawColor(...heading); doc.setLineWidth(1.5); doc.line(m, 108, w - m, 108);
  };
  const common = {
    theme: "grid" as const, margin: { left: m, right: m, top: 124, bottom: 64 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineWidth: 0.4, lineColor: border, textColor: ink, fillColor: paper, overflow: "linebreak" as const, valign: "top" as const },
    headStyles: { fillColor: heading, textColor: paper, fontStyle: "bold" as const },
    rowPageBreak: "avoid" as const, willDrawPage: header,
  };
  header();
  const emision = new Date(d.orden.created_at).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo", day: "2-digit", month: "2-digit", year: "numeric" });
  autoTable(doc, { ...common, startY: 124, head: [["Estado actual", "Cliente", "Fecha de emisión"]],
    body: [[ordenEstadoLabel(d.orden.estado), `${texto(d.cliente?.nombre)}${d.cliente?.rnc ? `\nRNC: ${d.cliente.rnc}` : ""}`, emision]],
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: width - 210 }, 2: { cellWidth: 110 } } });
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const o = datosOperacionPortada(d.orden);
  autoTable(doc, { ...common, startY: finalY() + 12,
    head: [[{ content: "OPERACIÓN", colSpan: 2 }, { content: "COMERCIAL", colSpan: 2 }]],
    body: [
      ["Origen", texto(o.origen), "Gestor de Compra asignado", texto(d.gestor)],
      ["Destino", texto(o.destino), `Tarifa propuesta (${o.moneda})`, numero(o.tarifa)],
      ["Incoterm", texto(o.incoterm), "N° Cotización de Compras original", texto(o.cotizacion)],
      ["Tipo de mercancía", texto(o.tipo), { content: "Notas de la Cotización", rowSpan: 3 }, { content: texto(o.notas), rowSpan: 3 }],
      ["Peso estimado (kg)", numero(o.peso)],
      ["Volumen estimado (m³)", numero(o.volumen)],
    ], columnStyles: { 0: { cellWidth: 104, textColor: muted }, 1: { cellWidth: 166, fontStyle: "bold" }, 2: { cellWidth: 104, textColor: muted }, 3: { cellWidth: 166, fontStyle: "bold" } },
  });
  autoTable(doc, { ...common, startY: finalY() + 12,
    head: [[{ content: "DETALLE DE PRODUCTOS", colSpan: 9 }], ["Código", "Detalle", "Unidad", "Cantidad", "Peso (kg)", "Valor FOB (US$)", "Marca", "Modelo", "País de origen"]],
    body: d.productos.length ? d.productos.map((p) => [texto(p.codigo_arancelario), texto(p.detalle_producto), texto(p.unidad_medida), numero(p.cantidad), numero(p.peso), numero(p.valor_fob), texto(p.marca), texto(p.modelo), texto(p.pais_origen)]) : [[{ content: "Sin productos registrados", colSpan: 9 }]],
    styles: { ...common.styles, fontSize: 8, cellPadding: 4 },
    columnStyles: Object.fromEntries([48, 92, 54, 58, 58, 68, 48, 44, 70].map((cellWidth, i) => [i, { cellWidth: cellWidth * width / 540, ...([3, 4, 5].includes(i) ? { halign: "right" as const } : {}) }])),
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page); doc.setDrawColor(...border); doc.setLineWidth(0.5); doc.line(m, h - 48, w - m, h - 48);
    doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(`Generado: ${fechaHoraPortada(d.generado)}`, m, h - 34);
    doc.text(doc.splitTextToSize(`Por: ${d.usuario}`, 190), w / 2, h - 34, { align: "center" });
    doc.text("ADECOMEX SRL", w - m, h - 34, { align: "right" });
    if (doc.getNumberOfPages() > 1) doc.text(`${page} / ${doc.getNumberOfPages()}`, w - m, h - 22, { align: "right" });
  }
  return doc.output("blob");
}