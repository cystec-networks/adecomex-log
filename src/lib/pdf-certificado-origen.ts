/** Draw the resolved, editable certificate as PDF text and vector rules.
 * DOM measurements retain the official form's cells, wrapping and annexes;
 * no canvas, bitmap or HTML rasterizer participates in this export.
 */
export async function buildCertificadoOrigenPdf(root: HTMLElement) {
  const { jsPDF } = await import("jspdf");
  await document.fonts.ready;
  const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait", compress: true, putOnlyUsedFonts: true });
  const pages = Array.from(root.querySelectorAll<HTMLElement>(".doc-page"));
  const targets = pages.length ? pages : [root];
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  targets.forEach((target, pageIndex) => {
    if (pageIndex) pdf.addPage();
    const bounds = target.getBoundingClientRect();
    if (!bounds.width || !bounds.height) throw new Error("La vista previa del certificado está vacía");
    const scale = Math.min((pageW - 40) / bounds.width, (pageH - 28) / bounds.height);
    const left = 20 + (pageW - 40 - bounds.width * scale) / 2;
    const x = (pixel: number) => left + (pixel - bounds.left) * scale;
    const y = (pixel: number) => 14 + (pixel - bounds.top) * scale;
    pdf.setDrawColor(0);
    pdf.setTextColor(0);

    // Each border is drawn individually, including nested date boxes and colspans.
    for (const el of [target, ...Array.from(target.querySelectorAll<HTMLElement>("*"))]) {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const edges = [
        [style.borderTopWidth, style.borderTopStyle, r.left, r.top, r.right, r.top],
        [style.borderRightWidth, style.borderRightStyle, r.right, r.top, r.right, r.bottom],
        [style.borderBottomWidth, style.borderBottomStyle, r.left, r.bottom, r.right, r.bottom],
        [style.borderLeftWidth, style.borderLeftStyle, r.left, r.top, r.left, r.bottom],
      ] as const;
      for (const [width, kind, x1, y1, x2, y2] of edges) {
        if (parseFloat(width) > 0 && kind !== "none" && kind !== "hidden") {
          pdf.setLineWidth(parseFloat(width) * scale);
          pdf.line(x(x1), y(y1), x(x2), y(y2));
        }
      }
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        const size = Math.min(r.width, r.height) * scale;
        pdf.setLineWidth(0.2);
        pdf.rect(x(r.left), y(r.top), size, size);
        if (el.checked) {
          pdf.line(x(r.left) + size * .2, y(r.top) + size * .5, x(r.left) + size * .45, y(r.top) + size * .8);
          pdf.line(x(r.left) + size * .45, y(r.top) + size * .8, x(r.left) + size * .85, y(r.top) + size * .2);
        }
      }
    }

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      const text = node.textContent ?? "";
      if (parent && text.trim() && !parent.closest("script,style")) {
        const style = getComputedStyle(parent);
        const fontPx = parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 600 || style.fontWeight === "bold";
        const italic = style.fontStyle === "italic";
        pdf.setFont("helvetica", bold ? (italic ? "bolditalic" : "bold") : (italic ? "italic" : "normal"));
        pdf.setFontSize(fontPx * scale * 72 / 25.4);
        const range = document.createRange();
        let run = "";
        let start: DOMRect | null = null;
        let right = 0;
        const flush = () => {
          if (!start || !run.trim()) { run = ""; start = null; return; }
          const normalized = run.replace(/\u00a0/g, " ");
          const baseline = start.top + (start.height - fontPx) / 2 + fontPx * .8;
          // Match the browser's Arial advance widths while retaining actual text.
          const spacing = normalized.length > 1
            ? ((right - start.left) * scale - pdf.getTextWidth(normalized)) / (normalized.length - 1) : 0;
          pdf.text(normalized, x(start.left), y(baseline), { charSpace: spacing });
          run = ""; start = null;
        };
        for (let i = 0; i < text.length; i++) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (start && Math.abs(rect.top - start.top) > 1) flush();
          if (!start) start = rect;
          run += text[i];
          right = rect.right;
        }
        flush();
        range.detach();
      }
      node = walker.nextNode();
    }
  });
  return pdf;
}