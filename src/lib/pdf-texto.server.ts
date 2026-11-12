// Capa de texto de PDFs digitales con disposición por renglones (solo servidor).
// Devuelve null para escaneados, mixtos (alguna página sin texto) o demasiado largos: esos se leen como imagen.
import { textoDigitalSuficiente, MAX_CARACTERES_TEXTO } from "./lectura-texto";

export async function textoPdfDigital(bytes: Uint8Array): Promise<string | null> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const paginas: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const contenido = await page.getTextContent();
      type Item = { str: string; x: number; y: number; w: number };
      const items: Item[] = [];
      for (const it of contenido.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
        if (!it.str || !it.transform) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 });
      }
      // Agrupa por renglón visual (tolerancia de 3 pt) y ordena por columna.
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const renglones: Item[][] = [];
      for (const it of items) {
        const r = renglones[renglones.length - 1];
        if (r && Math.abs(r[0].y - it.y) <= 3) r.push(it);
        else renglones.push([it]);
      }
      const lineas = renglones.map((r) => {
        r.sort((a, b) => a.x - b.x);
        let linea = "";
        let fin = -Infinity;
        for (const it of r) {
          const hueco = it.x - fin;
          if (linea && hueco > 12) linea += " | ";
          else if (linea && hueco > 1 && !linea.endsWith(" ") && !it.str.startsWith(" ")) linea += " ";
          linea += it.str;
          fin = it.x + it.w;
        }
        return linea.replace(/\s+/g, " ").trim();
      }).filter(Boolean);
      paginas.push(lineas.join("\n"));
    }
    return textoDigitalSuficiente(paginas) ? paginas.map((p, i) => `--- Página ${i + 1} ---\n${p}`).join("\n").slice(0, MAX_CARACTERES_TEXTO) : null;
  } catch {
    return null;
  }
}
