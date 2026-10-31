import { nombreArchivo, nombreDocumentoSiga } from "./codigo-siga";

export type DocumentoZip = { id: string; tipo: string; storage_path: string | null; codigo_siga?: string | null };

export function entradasDocumentosZip(documentos: DocumentoZip[], declaracion: string[], liquidacion: string[]) {
  const usados = new Set<string>();
  return documentos.filter((d) => !!d.storage_path?.trim()).map((doc) => {
    const carpeta = liquidacion.includes(doc.tipo) ? "Documentos Liquidación"
      : declaracion.includes(doc.tipo) ? "Documentos Declaración" : "Otros documentos del expediente";
    const original = nombreArchivo(doc.storage_path);
    const nombre = (/^(FAC|DOE|CEO|PER|OTD)-\d+\b/i.test(original) || !doc.codigo_siga
      ? original : nombreDocumentoSiga(doc.codigo_siga, doc.tipo, original))
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+/, "_") || `Documento ${doc.id}.pdf`;
    let unico = nombre;
    let n = 2;
    while (usados.has(`${carpeta}/${unico}`.toLocaleLowerCase())) {
      const punto = nombre.lastIndexOf(".");
      unico = punto > 0 ? `${nombre.slice(0, punto)} (${n++})${nombre.slice(punto)}` : `${nombre} (${n++})`;
    }
    const ruta = `${carpeta}/${unico}`;
    usados.add(ruta.toLocaleLowerCase());
    return { doc, ruta };
  });
}

export async function generarDocumentosZip(
  entradas: ReturnType<typeof entradasDocumentosZip>,
  descargar: (doc: DocumentoZip) => Promise<Blob>,
  progreso: (completados: number) => void,
) {
  if (!entradas.length) throw new Error("No hay documentos con archivo para descargar.");
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  let completados = 0;
  // Limitar memoria y solicitudes simultáneas; un fallo impide entregar un ZIP incompleto.
  for (let i = 0; i < entradas.length; i += 3) {
    await Promise.all(entradas.slice(i, i + 3).map(async ({ doc, ruta }) => {
      const blob = await descargar(doc);
      if (!blob.size) throw new Error(`El archivo ${nombreArchivo(doc.storage_path)} está vacío.`);
      zip.file(ruta, await blob.arrayBuffer());
      progreso(++completados);
    }));
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

export async function entregarZip(blob: Blob, nombre: string) {
  const file = new File([blob], nombre, { type: "application/zip" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombre }); return; }
    catch (e) { if ((e as DOMException).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}