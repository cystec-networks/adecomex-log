export const PAQUETE_TIPO_DOCUMENTO = "Paquete Rectificación Técnica";

type DocumentoPaquete = { id: string; storage_path: string | null };
export type RepositorioPaquete = {
  listar: () => Promise<DocumentoPaquete[]>;
  actualizar: (id: string) => Promise<void>;
  insertar: () => Promise<void>;
  eliminarDuplicados: (ids: string[]) => Promise<void>;
};

const expedientesEnProceso = new Set<string>();

/** Compartido entre los dos menús: no permite dos generaciones simultáneas. */
export async function generarPaqueteExclusivo(id: string, generar: () => Promise<void>) {
  if (expedientesEnProceso.has(id)) return false;
  expedientesEnProceso.add(id);
  try {
    await generar();
    return true;
  } finally {
    expedientesEnProceso.delete(id);
  }
}

/**
 * Reemplaza la fila vigente y consolida únicamente paquetes del expediente.
 * Devuelve las rutas de los archivos que dejaron de usarse (el anterior y los duplicados),
 * para que un paquete regenerado no deje copias guardadas.
 */
export async function reemplazarPaquete(repo: RepositorioPaquete, rutaNueva?: string): Promise<string[]> {
  const [vigente, ...duplicados] = await repo.listar();
  if (vigente) await repo.actualizar(vigente.id);
  else await repo.insertar();
  if (duplicados.length) await repo.eliminarDuplicados(duplicados.map((d) => d.id));
  return rutasPaqueteRetiradas([vigente, ...duplicados], rutaNueva);
}

/** Rutas anteriores únicas, sin la ruta recién guardada ni vacíos. */
export function rutasPaqueteRetiradas(anteriores: (DocumentoPaquete | undefined)[], rutaNueva?: string): string[] {
  const rutas = anteriores.map((d) => d?.storage_path?.trim()).filter((r): r is string => !!r && r !== rutaNueva);
  return [...new Set(rutas)];
}