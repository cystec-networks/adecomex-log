export type CampoGrupo = { grupo: string; campos: { campo: string; label: string }[] };

export const CAMPOS_PLANTILLA: CampoGrupo[] = [
  {
    grupo: "IMPORTADOR (Cliente)",
    campos: [
      { campo: "{{cliente.nombre}}", label: "Nombre" },
      { campo: "{{cliente.rnc}}", label: "RNC" },
      { campo: "{{cliente.direccion}}", label: "Dirección" },
      { campo: "{{cliente.telefono}}", label: "Teléfono" },
      { campo: "{{cliente.email}}", label: "Email" },
    ],
  },
  {
    grupo: "EXPEDIENTE",
    campos: [
      { campo: "{{expediente.numero}}", label: "Número" },
      { campo: "{{expediente.bl_awb}}", label: "BL / AWB" },
      { campo: "{{expediente.fecha_llegada}}", label: "Fecha de llegada" },
      { campo: "{{expediente.regimen}}", label: "Régimen" },
      { campo: "{{expediente.puerto_arribo}}", label: "Puerto de arribo" },
      { campo: "{{expediente.puerto_salida}}", label: "Puerto de salida" },
      { campo: "{{expediente.pais_origen}}", label: "País de origen" },
      { campo: "{{expediente.pais_procedencia}}", label: "País de procedencia" },
      { campo: "{{expediente.manifiesto}}", label: "Manifiesto" },
      { campo: "{{expediente.peso_bruto}}", label: "Peso bruto" },
      { campo: "{{expediente.peso_neto}}", label: "Peso neto" },
      { campo: "{{expediente.total_fob}}", label: "Total FOB" },
      { campo: "{{expediente.total_cif}}", label: "Total CIF" },
      { campo: "{{expediente.suplidor}}", label: "Suplidor" },
      { campo: "{{expediente.suplidor_rnc}}", label: "RNC del suplidor" },
      { campo: "{{expediente.incoterm}}", label: "Incoterm" },
    ],
  },
  {
    grupo: "PRODUCTOS (fila repetible)",
    campos: [
      { campo: "{{producto.codigo_arancelario}}", label: "Código arancelario" },
      { campo: "{{producto.descripcion}}", label: "Descripción" },
      { campo: "{{producto.cantidad}}", label: "Cantidad" },
      { campo: "{{producto.unidad}}", label: "Unidad" },
      { campo: "{{producto.peso}}", label: "Peso" },
      { campo: "{{producto.fob}}", label: "FOB" },
      { campo: "{{producto.precio_unitario}}", label: "Precio unitario" },
    ],
  },
];

const DASH = "—";

function val(v: any): string {
  if (v === null || v === undefined || v === "") return DASH;
  return String(v);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Resuelve el HTML de una plantilla con los datos reales del expediente.
 * - Duplica la fila (<tr>) que contenga campos {{producto.*}} una vez por línea de mercancía.
 * - Reemplaza campos simples de cliente/expediente.
 * - Cualquier {{...}} restante se elimina (queda en blanco para llenar a mano).
 */
export function resolverPlantilla(html: string, exp: any, items: any[]): string {
  const cliente = exp?.clientes ?? {};

  const simples: Record<string, any> = {
    "cliente.nombre": cliente.nombre ?? cliente.razon_social,
    "cliente.rnc": cliente.rnc,
    "cliente.direccion": cliente.direccion,
    "cliente.telefono": cliente.telefono,
    "cliente.email": cliente.email,
    "expediente.numero": exp?.numero,
    "expediente.bl_awb": exp?.bl_awb,
    "expediente.fecha_llegada": exp?.fecha_llegada,
    "expediente.regimen": exp?.regimen,
    "expediente.puerto_arribo": exp?.puerto_arribo,
    "expediente.puerto_salida": exp?.puerto_salida,
    "expediente.pais_origen": exp?.pais_origen,
    "expediente.pais_procedencia": exp?.pais_procedencia,
    "expediente.manifiesto": exp?.manifiesto ?? exp?.numero_manifiesto,
    "expediente.peso_bruto": exp?.peso_bruto,
    "expediente.peso_neto": exp?.peso_neto,
    "expediente.total_fob": exp?.total_fob ?? exp?.valor_fob,
    "expediente.total_cif": exp?.total_cif ?? exp?.valor_cif,
    "expediente.suplidor": exp?.suplidor,
    "expediente.suplidor_rnc": exp?.suplidor_rnc,
    "expediente.incoterm": exp?.incoterm,
  };

  let out = html;

  // 1) Fila repetible de productos
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  out = out.replace(rowRe, (row) => {
    if (!/\{\{\s*producto\./.test(row)) return row;
    const lineas = items ?? [];
    if (lineas.length === 0) return "";
    return lineas
      .map((it) => {
        const cantidad = Number(it.cantidad ?? 0);
        const fob = Number(it.valor_fob ?? 0);
        const pu = cantidad ? Math.round((fob / cantidad) * 100) / 100 : 0;
        const pmap: Record<string, any> = {
          "producto.codigo_arancelario": it.codigo_arancelario ?? it.partida_arancelaria,
          "producto.descripcion": it.detalle_producto ?? it.descripcion,
          "producto.cantidad": it.cantidad,
          "producto.unidad": it.unidad_medida,
          "producto.peso": it.peso,
          "producto.fob": it.valor_fob,
          "producto.precio_unitario": pu,
        };
        return row.replace(/\{\{\s*(producto\.[a-z_]+)\s*\}\}/gi, (_m, key: string) =>
          esc(val(pmap[key.toLowerCase()])),
        );
      })
      .join("");
  });

  // 2) Campos simples
  out = out.replace(/\{\{\s*([a-z]+\.[a-z_]+)\s*\}\}/gi, (_m, key: string) => {
    const k = key.toLowerCase();
    if (k in simples) return esc(val(simples[k]));
    return "";
  });

  // 3) Cualquier marcador restante queda vacío
  out = out.replace(/\{\{[\s\S]*?\}\}/g, "");

  return out;
}
