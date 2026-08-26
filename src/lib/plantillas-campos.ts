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
  {
    grupo: "EXPORTADOR / PRODUCTOR (catálogo de terceros extranjeros)",
    campos: [
      { campo: "{{exportador.bloque}}", label: "Bloque completo del exportador" },
      { campo: "{{productor.bloque}}", label: "Bloque completo del productor" },
    ],
  },
  {
    grupo: "PRODUCTOS ANEXO (DR-CAFTA)",
    campos: [
      { campo: "{{productoAnexo.codigo_arancelario}}", label: "Código arancelario" },
      { campo: "{{productoAnexo.descripcion}}", label: "Descripción" },
      { campo: "{{productoAnexo.cantidad}}", label: "Cantidad" },
      { campo: "{{productoAnexo.unidad}}", label: "Unidad" },
      { campo: "{{productoAnexo.peso}}", label: "Peso" },
      { campo: "{{productoAnexo.fob}}", label: "FOB" },
      { campo: "{{productoAnexo.precio_unitario}}", label: "Precio unitario" },
    ],
  },
];

export type TerceroPlantilla = {
  nombre?: string | null;
  tid?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  pais?: string | null;
};

export type TercerosPlantilla = {
  exportador?: TerceroPlantilla | null;
  productor?: TerceroPlantilla | null;
};


const DASH = "—";
const ANEXO_N = 3;
const FILAS_PAGINA1 = 9;
const FILAS_ANEXO = 9;



const MARCADORES_PAGINA = {
  cierreInicio: "{{__cierre1_inicio__}}",
  cierreFin: "{{__cierre1_fin__}}",
  anexoInicio: "{{__anexo_inicio__}}",
  anexoFin: "{{__anexo_fin__}}",
} as const;

function val(v: any): string {
  if (v === null || v === undefined || v === "") return DASH;
  return String(v);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildProductoMap(it: any): Record<string, any> {
  const cantidad = Number(it.cantidad ?? 0);
  const fob = Number(it.valor_fob ?? 0);
  const pu = cantidad ? Math.round((fob / cantidad) * 100) / 100 : 0;
  return {
    codigo_arancelario: it.codigo_arancelario ?? it.partida_arancelaria,
    descripcion: it.detalle_producto ?? it.descripcion,
    cantidad: it.cantidad,
    unidad: it.unidad_medida,
    peso: it.peso,
    fob: it.valor_fob,
    precio_unitario: pu,
    criterio: "A",
    productor: "SI",
  };
}

function expandirFilasProducto(
  html: string,
  items: any[],
  prefix: "producto" | "productoAnexo",
  minFilas = 0,
): string {
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const fieldRe = new RegExp(`\\{\\{\\s*(${prefix}\\.[a-z_]+)\\s*\\}\\}`, "gi");
  return html.replace(rowRe, (row) => {
    const hasField = fieldRe.test(row);
    fieldRe.lastIndex = 0; // evita que el test() descarte la primera coincidencia en replace()
    if (!hasField) return row;
    const lineas = items ?? [];
    const filas = lineas.map((it) => {
      const pmap = buildProductoMap(it);
      return row.replace(fieldRe, (_m, key: string) => {
        const k = key.toLowerCase().replace(`${prefix.toLowerCase()}.`, "");
        return esc(val(pmap[k]));
      });
    });
    // Rellena con filas en blanco hasta completar la hoja tamaño carta
    const vacia = row.replace(fieldRe, "&nbsp;");
    while (filas.length < minFilas) filas.push(vacia);
    return filas.join("");
  });
}


function limpiarBordesSeccion(html: string): string {
  return html
    .replace(/^(?:\s|<p[^>]*>\s*<\/p>)+/gi, "")
    .replace(/(?:\s|<p[^>]*>\s*<\/p>)+$/gi, "")
    .trim();
}

function envolverPagina(html: string): string {
  const contenido = limpiarBordesSeccion(html);
  if (/class=["'][^"']*\bdoc-page\b/i.test(contenido)) return contenido;
  return `<div class="doc-page" style="width:100%;box-sizing:border-box;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:10px">${contenido}</div>`;
}

/**
 * TipTap conserva los marcadores de texto, pero puede eliminar los DIV
 * `.doc-page` al volver a guardar la plantilla. Separamos por marcadores y
 * reconstruimos esos contenedores para que cada hoja se renderice en un
 * canvas y una página PDF independientes.
 */
function separarPaginasMarcadas(html: string): { pagina1: string; anexo: string } | null {
  const inicio1 = html.indexOf(MARCADORES_PAGINA.cierreInicio);
  const fin1 = html.indexOf(MARCADORES_PAGINA.cierreFin);
  const inicio2 = html.indexOf(MARCADORES_PAGINA.anexoInicio);
  const fin2 = html.indexOf(MARCADORES_PAGINA.anexoFin);

  if (inicio1 < 0 || fin1 <= inicio1 || inicio2 <= fin1 || fin2 <= inicio2) return null;

  const pagina1 = html.slice(inicio1 + MARCADORES_PAGINA.cierreInicio.length, fin1);
  const anexo = html.slice(inicio2 + MARCADORES_PAGINA.anexoInicio.length, fin2);
  return { pagina1, anexo };
}

/**
 * Resuelve el HTML de una plantilla con los datos reales del expediente.
 * - Duplica la fila (<tr>) que contenga campos {{producto.*}} una vez por línea de mercancía.
 * - Reemplaza campos simples de cliente/expediente.
 * - Cualquier {{...}} restante se elimina (queda en blanco para llenar a mano).
 */
function bloqueTercero(t?: TerceroPlantilla | null): string {
  if (!t) return "&nbsp;";
  const partes: string[] = [];
  if (t.nombre) partes.push(esc(String(t.nombre)));
  if (t.direccion) partes.push(esc(String(t.direccion)));
  const pais = t.pais ? esc(String(t.pais)) : "";
  if (pais) partes.push(pais);
  const contacto = [
    t.telefono ? `Tel.: ${esc(String(t.telefono))}` : "",
    t.email ? `Email: ${esc(String(t.email))}` : "",
  ].filter(Boolean).join(", ");
  if (contacto) partes.push(contacto);
  if (t.tid) partes.push(`TID: ${esc(String(t.tid))}`);
  return partes.length ? partes.join("<br>") : "&nbsp;";
}

export function resolverPlantilla(
  html: string,
  exp: any,
  items: any[],
  terceros?: TercerosPlantilla,
): string {
  const cliente = exp?.clientes ?? {};
  const bloques: Record<string, string> = {
    "exportador.bloque": bloqueTercero(terceros?.exportador),
    "productor.bloque": bloqueTercero(terceros?.productor),
  };


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

  const paginasMarcadas = separarPaginasMarcadas(out);
  const tieneAnexo = paginasMarcadas !== null;

  if (tieneAnexo && paginasMarcadas) {
    const productos = items ?? [];

    // 1) Expande primero las filas de producto (antes de tocar
    //    ningún {{...}} simple). La hoja anexa siempre se incluye,
    //    aunque no haya productos adicionales (queda informativa).
    // Primeros N productos en página 1, resto en anexo
    let pagina1 = expandirFilasProducto(
      paginasMarcadas.pagina1,
      productos.slice(0, ANEXO_N),
      "producto",
      FILAS_PAGINA1,
    );
    let anexo = expandirFilasProducto(
      paginasMarcadas.anexo,
      productos.slice(ANEXO_N),
      "productoAnexo",
      FILAS_ANEXO,
    );


    // 2) SOLO AHORA reemplaza los campos simples de cliente/expediente
    const reemplazarSimples = (seccion: string) =>
      seccion.replace(/\{\{\s*([a-z]+\.[a-z_]+)\s*\}\}/gi, (_m, key: string) => {
        const k = key.toLowerCase();
        if (k in bloques) return bloques[k];
        if (k in simples) return esc(val(simples[k]));

        return "";
      });
    pagina1 = reemplazarSimples(pagina1);
    anexo = reemplazarSimples(anexo);

    // 3) Cualquier marcador restante queda vacío
    pagina1 = pagina1.replace(/\{\{[\s\S]*?\}\}/g, "");
    anexo = anexo.replace(/\{\{[\s\S]*?\}\}/g, "");
    out = `${envolverPagina(pagina1)}${envolverPagina(anexo)}`;
  } else {
    // Comportamiento original para plantillas sin marcadores de anexo
    // 1) Filas repetibles de productos
    out = expandirFilasProducto(out, items, "producto");

    // 2) Campos simples
    out = out.replace(/\{\{\s*([a-z]+\.[a-z_]+)\s*\}\}/gi, (_m, key: string) => {
      const k = key.toLowerCase();
      if (k in bloques) return bloques[k];
      if (k in simples) return esc(val(simples[k]));

      return "";
    });

    // 3) Cualquier marcador restante queda vacío
    out = out.replace(/\{\{[\s\S]*?\}\}/g, "");
  }

  return out;
}
