import { codigoOchoDigitos } from "./copiloto-candidatos";
import type { TasasProducto } from "./catalogo-arancelario";

export type LineaFacturaExpediente = {
  descripcion: string; codigo_arancelario: string | null; cantidad: number | null;
  unidad: string | null; valor_fob: number | null; peso: number | null;
};
type Resultado = { producto: boolean; arancel: { codigo: string } | null };
type Tasas = { pct_gravamen: string; aplica_isc: boolean; pct_isc: string; pct_itbis: string };

const normalizarTexto = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const sumar = (a: number | null, b: number | null) =>
  a == null && b == null ? null : Math.round(((a ?? 0) + (b ?? 0)) * 1e6) / 1e6;

/** Invoice rows of the same product (same tariff code, description and unit) split into sub-lots become one row. */
export function consolidarLineasFactura(lineas: LineaFacturaExpediente[]): LineaFacturaExpediente[] {
  const grupos = new Map<string, LineaFacturaExpediente>();
  const resultado: LineaFacturaExpediente[] = [];
  for (const l of lineas) {
    const descripcion = normalizarTexto(l.descripcion);
    if (!descripcion) { resultado.push({ ...l }); continue; }
    const clave = [(l.codigo_arancelario ?? "").replace(/\D/g, ""), descripcion, normalizarTexto(l.unidad)].join("|");
    const previo = grupos.get(clave);
    if (previo) {
      previo.cantidad = sumar(previo.cantidad, l.cantidad);
      previo.peso = sumar(previo.peso, l.peso);
      previo.valor_fob = sumar(previo.valor_fob, l.valor_fob);
      continue;
    }
    const copia = { ...l };
    grupos.set(clave, copia);
    resultado.push(copia);
  }
  return resultado;
}

/** Only OCR rows enter here. Never classify an existing document/manual code. */
export async function prepararProductosFactura(
  lineas: LineaFacturaExpediente[],
  clasificar: (descripciones: string[]) => Promise<{ resultados: Resultado[] }>,
  buscarTasas: (codigo: string, manual: TasasProducto) => Promise<Tasas>,
) {
  lineas = consolidarLineasFactura(lineas);
  const pendientes = lineas.map((l, i) => ({ l, i })).filter(({ l }) => !l.codigo_arancelario?.trim() && l.descripcion.trim());
  const sugeridos = new Map<number, string>();
  for (let offset = 0; offset < pendientes.length; offset += 100) {
    const lote = pendientes.slice(offset, offset + 100);
    try {
      const { resultados } = await clasificar(lote.map(({ l }) => l.descripcion.slice(0, 1000)));
      lote.forEach(({ i }, j) => {
        const r = resultados[j];
        const codigo = r?.producto && r.arancel ? codigoOchoDigitos(r.arancel.codigo) : null;
        if (codigo) sugeridos.set(i, codigo);
      });
    } catch { /* An unavailable suggestion must never prevent using OCR data. */ }
  }
  return Promise.all(lineas.map(async (l, i) => {
    const codigo = l.codigo_arancelario?.trim() || sugeridos.get(i) || "";
    let tasas: Tasas | null = null;
    if (codigo) {
      try { tasas = await buscarTasas(codigo, {}); } catch { /* Leave rates editable and empty. */ }
    }
    const numero = (v: string | undefined) => v == null || v === "" ? null : Number(v);
    return {
      id: crypto.randomUUID(), item_no: i + 1,
      detalle_producto: l.descripcion, codigo_arancelario: codigo || null,
      unidad_medida: l.unidad, cantidad: l.cantidad, peso: l.peso, valor_fob: l.valor_fob,
      pct_gravamen: numero(tasas?.pct_gravamen), aplica_isc: tasas?.aplica_isc ?? false,
      pct_isc: numero(tasas?.pct_isc), pct_itbis: numero(tasas?.pct_itbis),
      codigo_sugerido_ia: sugeridos.get(i) ?? null,
    };
  }));
}