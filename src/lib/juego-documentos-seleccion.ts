/** Browser-safe selection shared by the picker and directory drop traversal. */
export const aceptarDocumentosJuego = ".pdf,image/*";
const rutas = new WeakMap<File, string>();
export function rutaArchivoJuego(file: File) { return rutas.get(file) || file.webkitRelativePath || file.name; }
export function esDocumentoJuego(file: Pick<File, "name" | "type">) {
  return file.type === "application/pdf" || file.type.startsWith("image/") || /\.(pdf|png|jpe?g|webp|gif|bmp|avif|svg|tiff?|heic|heif)$/i.test(file.name);
}
export function agregarArchivosJuego(prev: File[], nuevos: File[]) {
  const salida = [...prev];
  for (const file of nuevos.filter(esDocumentoJuego)) {
    if (!salida.some((p) => rutaArchivoJuego(p) === rutaArchivoJuego(file) && p.size === file.size && p.lastModified === file.lastModified)) salida.push(file);
  }
  return salida;
}
export interface EntradaJuego {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (file: File) => void, fail: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: EntradaJuego[]) => void, fail: (error: unknown) => void) => void };
}
/** Drain all directory batches (some browsers return only 100 entries per batch). */
export async function leerEntradasJuego(entradas: EntradaJuego[]) {
  const files: File[] = [];
  const errores: string[] = [];
  async function visitar(entry: EntradaJuego, parent: string) {
    const path = `${parent}${entry.name}`;
    try {
      if (entry.isFile && entry.file) {
        const leer = entry.file.bind(entry);
        const file = await new Promise<File>((ok, fail) => leer(ok, fail));
        if (esDocumentoJuego(file)) { rutas.set(file, path); files.push(file); }
      } else if (entry.isDirectory && entry.createReader) {
        const reader = entry.createReader();
        while (true) {
          const batch = await new Promise<EntradaJuego[]>((ok, fail) => reader.readEntries(ok, fail));
          if (!batch.length) break;
          for (const child of batch) await visitar(child, `${path}/`);
        }
      }
    } catch { errores.push(`No se pudo leer ${path}`); }
  }
  for (const entry of entradas) await visitar(entry, "");
  return { files, errores };
}
export async function leerArrastreJuego(data: DataTransfer) {
  // Capture handles synchronously: the browser clears DataTransfer after the drop event.
  const files = Array.from(data.files);
  const entradas = Array.from(data.items ?? []).filter((item) => item.kind === "file").map((item) => item.webkitGetAsEntry?.() ?? null);
  if (!entradas.some(Boolean)) return { files: files.filter(esDocumentoJuego), errores: [] };
  const out = await leerEntradasJuego(entradas.filter((e): e is FileSystemEntry => e !== null));
  const fallback = files.filter((_, i) => !entradas[i]).filter(esDocumentoJuego);
  return { files: agregarArchivosJuego(out.files, fallback), errores: out.errores };
}