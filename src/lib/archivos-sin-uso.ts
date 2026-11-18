// Reglas de «Limpiar archivos sin uso». La base de datos decide qué archivo no usa nadie
// (archivos_sin_uso / archivos_enviar_papelera) y aplica permisos y Auditoría; aquí solo
// se agrupan y resumen las filas para la vista previa.
export type ArchivoSinUso = { storage_path: string; tamano: number | null; mime: string | null; subido_en: string; expediente_numero: string | null };

export type GrupoArchivo =
  | "Paquetes reemplazados" | "Oficios reemplazados" | "Pedazos de correo" | "Adjuntos de correo"
  | "Originales de juegos de documentos" | "Permisos VUCE" | "Documentos legales" | "Documentos de empleados"
  | "Facturas e-CF" | "Gastos" | "Documentos de Expediente" | "Otros";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Grupo legible según la carpeta y el nombre del archivo. */
export function grupoArchivoSinUso(ruta: string): GrupoArchivo {
  const partes = ruta.split("/");
  const carpeta = partes[0] ?? "";
  const nombre = partes[partes.length - 1] ?? "";
  if (/Paquete_(Rectificacion_Tecnica|Envio_Factura_Cliente)_/i.test(nombre)) return "Paquetes reemplazados";
  if (/Oficio_Rectificacion_Tecnica_/i.test(nombre)) return "Oficios reemplazados";
  if (carpeta === "correo" || carpeta === "correo-recibido") return nombre.startsWith("seg_") ? "Pedazos de correo" : "Adjuntos de correo";
  if (partes[1] === "juegos") return "Originales de juegos de documentos";
  if (carpeta === "permisos") return "Permisos VUCE";
  if (carpeta === "legal-empresa") return "Documentos legales";
  if (carpeta === "empleados") return "Documentos de empleados";
  if (carpeta === "facturas-ecf") return "Facturas e-CF";
  if (carpeta === "gastos-operativos" || partes[2] === "gastos") return "Gastos";
  if (UUID.test(carpeta) || carpeta === "expedientes") return "Documentos de Expediente";
  return "Otros";
}

export type ResumenGrupo = { grupo: GrupoArchivo; archivos: number; bytes: number };

/** Totales por grupo, de mayor a menor tamaño. */
export function resumenPorGrupo(filas: Pick<ArchivoSinUso, "storage_path" | "tamano">[]): ResumenGrupo[] {
  const mapa = new Map<GrupoArchivo, ResumenGrupo>();
  for (const f of filas) {
    const grupo = grupoArchivoSinUso(f.storage_path);
    const r = mapa.get(grupo) ?? { grupo, archivos: 0, bytes: 0 };
    r.archivos += 1; r.bytes += f.tamano ?? 0;
    mapa.set(grupo, r);
  }
  return [...mapa.values()].sort((a, b) => b.bytes - a.bytes);
}

/** Cantidad y bytes de las rutas seleccionadas. */
export function totalSeleccion(filas: Pick<ArchivoSinUso, "storage_path" | "tamano">[], seleccion: ReadonlySet<string>) {
  let archivos = 0, bytes = 0;
  for (const f of filas) if (seleccion.has(f.storage_path)) { archivos++; bytes += f.tamano ?? 0; }
  return { archivos, bytes };
}

/** Lotes para borrar en Storage sin peticiones demasiado grandes. */
export function enLotes<T>(items: T[], tamano = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano));
  return out;
}
