// Motor del visor PDF (solo navegador). Se carga bajo demanda: pdf.js pide al
// almacenamiento solo las partes del archivo que necesita la página visible, y
// dibuja únicamente las páginas cercanas a la vista para no trabar documentos
// pesados. La búsqueda recorre el texto de las páginas a medida que avanza.
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/legacy/web/pdf_viewer.css";

import { TAMANO_PARTE_PDF, UMBRAL_CARGA_POR_PARTES } from "@/lib/normativa-visor";

type ViewerMod = typeof import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
let modViewer: Promise<ViewerMod> | null = null;
function cargarViewer(): Promise<ViewerMod> {
  if (!modViewer) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    // Los componentes del visor leen la librería desde globalThis.
    (globalThis as unknown as { pdfjsLib: typeof pdfjs }).pdfjsLib = pdfjs;
    modViewer = import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
  }
  return modViewer;
}

export type EstadoBusqueda = "inactiva" | "buscando" | "encontrada" | "sin-resultados" | "vuelta";

export type MotorPdfApi = {
  irAPagina: (n: number) => void;
  buscar: (texto: string, opciones?: { anterior?: boolean; repetir?: boolean }) => void;
  limpiarBusqueda: () => void;
  zoom: (accion: "mas" | "menos" | "ancho") => void;
};

export type MotorPdfProps = {
  /** Devuelve una URL firmada vigente (se llama de nuevo si la anterior caduca). */
  obtenerUrl: (renovar: boolean) => Promise<string>;
  /** Tamaño conocido del archivo; si falta se consulta al almacenamiento. */
  bytes?: number | null;
  paginaInicial?: number | null;
  onPaginas: (total: number) => void;
  onPagina: (n: number) => void;
  onBusqueda: (estado: EstadoBusqueda, actual: number, total: number) => void;
  onError: (mensaje: string) => void;
  onListo: () => void;
};

/** Pide al almacenamiento solo los bytes que pdf.js necesita (Range). */
async function pedirRango(obtenerUrl: MotorPdfProps["obtenerUrl"], desde: number, hasta: number, signal: AbortSignal) {
  for (const renovar of [false, true]) {
    const url = await obtenerUrl(renovar);
    const r = await fetch(url, { headers: { Range: `bytes=${desde}-${hasta - 1}` }, signal });
    if (r.ok) return r;
    if (r.status !== 400 && r.status !== 403) throw new Error(`HTTP ${r.status}`);
  }
  throw new Error("El enlace del documento caducó");
}

async function tamanoArchivo(obtenerUrl: MotorPdfProps["obtenerUrl"]): Promise<number | null> {
  const r = await fetch(await obtenerUrl(false), { method: "HEAD" });
  const n = Number(r.headers.get("content-length"));
  return r.ok && n > 0 ? n : null;
}

export const MotorPdf = forwardRef<MotorPdfApi, MotorPdfProps>(function MotorPdf(props, ref) {
  const contenedor = useRef<HTMLDivElement>(null);
  const interior = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<InstanceType<ViewerMod["PDFViewer"]> | null>(null);
  const busRef = useRef<InstanceType<ViewerMod["EventBus"]> | null>(null);
  const consulta = useRef("");
  const cb = useRef(props);
  cb.current = props;
  const [cargando, setCargando] = useState(true);

  useImperativeHandle(ref, () => ({
    irAPagina: (n) => {
      const v = viewerRef.current;
      if (v && n >= 1 && n <= v.pagesCount) v.currentPageNumber = n;
    },
    buscar: (texto, op) => {
      const bus = busRef.current;
      const q = texto.trim();
      if (!bus) return;
      if (!q) {
        consulta.current = "";
        bus.dispatch("findbarclose", { source: null });
        cb.current.onBusqueda("inactiva", 0, 0);
        return;
      }
      const repetir = op?.repetir && q === consulta.current;
      consulta.current = q;
      bus.dispatch("find", {
        source: null,
        type: repetir ? "again" : "",
        query: q,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: !!op?.anterior,
        matchDiacritics: false,
      });
    },
    limpiarBusqueda: () => {
      consulta.current = "";
      busRef.current?.dispatch("findbarclose", { source: null });
    },
    zoom: (accion) => {
      const v = viewerRef.current;
      if (!v) return;
      if (accion === "ancho") v.currentScaleValue = "page-width";
      else v.currentScale = Math.min(4, Math.max(0.4, v.currentScale * (accion === "mas" ? 1.2 : 1 / 1.2)));
    },
  }));

  useEffect(() => {
    let cancelado = false;
    const abortar = new AbortController();
    let tarea: ReturnType<typeof pdfjs.getDocument> | null = null;

    (async () => {
      try {
        const v = await cargarViewer();
        if (cancelado || !contenedor.current || !interior.current) return;
        const bus = new v.EventBus();
        const linkService = new v.PDFLinkService({ eventBus: bus, externalLinkTarget: v.LinkTarget.BLANK });
        const findController = new v.PDFFindController({ eventBus: bus, linkService });
        const viewer = new v.PDFViewer({
          container: contenedor.current,
          viewer: interior.current,
          eventBus: bus,
          linkService,
          findController,
          textLayerMode: 1,
        });
        linkService.setViewer(viewer);
        viewerRef.current = viewer;
        busRef.current = bus;

        bus.on("pagesinit", () => {
          viewer.currentScaleValue = "page-width";
          const p = cb.current.paginaInicial;
          if (p && p >= 1 && p <= viewer.pagesCount) viewer.currentPageNumber = p;
          setCargando(false);
          cb.current.onListo();
        });
        bus.on("pagechanging", (e: { pageNumber: number }) => cb.current.onPagina(e.pageNumber));
        const informar = (e: { state?: number; matchesCount?: { current: number; total: number } }) => {
          const total = e.matchesCount?.total ?? 0;
          const actual = e.matchesCount?.current ?? 0;
          if (!consulta.current) return;
          const estado: EstadoBusqueda =
            e.state === v.FindState.PENDING
              ? "buscando"
              : e.state === v.FindState.NOT_FOUND
                ? "sin-resultados"
                : e.state === v.FindState.WRAPPED
                  ? "vuelta"
                  : total > 0
                    ? "encontrada"
                    : e.state === undefined
                      ? "buscando"
                      : "sin-resultados";
          cb.current.onBusqueda(estado, actual, total);
        };
        bus.on("updatefindcontrolstate", informar);
        bus.on("updatefindmatchescount", informar);

        // Archivos pequeños: una sola descarga. Pesados: por partes.
        const obtener = cb.current.obtenerUrl;
        let bytes = cb.current.bytes ?? null;
        if (!bytes || bytes <= 0) bytes = await tamanoArchivo(obtener).catch(() => null);
        const comun = { isEvalSupported: false, disableAutoFetch: true, rangeChunkSize: TAMANO_PARTE_PDF };
        if (!bytes || bytes <= UMBRAL_CARGA_POR_PARTES) {
          tarea = pdfjs.getDocument({ ...comun, url: await obtener(false) });
        } else {
          const primera = await pedirRango(obtener, 0, Math.min(bytes, TAMANO_PARTE_PDF), abortar.signal);
          const datos = new Uint8Array(await primera.arrayBuffer());
          if (primera.status === 200) {
            // El almacenamiento devolvió el archivo completo (sin rangos).
            tarea = pdfjs.getDocument({ ...comun, data: datos });
          } else {
            const total = bytes;
            class TransporteRangos extends pdfjs.PDFDataRangeTransport {
              requestDataRange(desde: number, hasta: number) {
                pedirRango(obtener, desde, Math.min(hasta, total), abortar.signal)
                  .then((r) => r.arrayBuffer())
                  .then((b) => {
                    if (!cancelado) this.onDataRange(desde, new Uint8Array(b));
                  })
                  .catch((e) => {
                    if (!cancelado && (e as Error).name !== "AbortError")
                      cb.current.onError("Se perdió la conexión al leer el documento. Ciérralo y vuelve a abrirlo.");
                  });
              }
              abort() {
                abortar.abort();
              }
            }
            tarea = pdfjs.getDocument({ ...comun, range: new TransporteRangos(total, datos) });
          }
        }
        const pdf = await tarea.promise;
        if (cancelado) {
          void pdf.destroy();
          return;
        }
        cb.current.onPaginas(pdf.numPages);
        viewer.setDocument(pdf);
        linkService.setDocument(pdf, null);
      } catch (e) {
        if (cancelado) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[visor normativa] no se pudo abrir el PDF", msg);
        cb.current.onError(
          /password/i.test(msg)
            ? "El PDF está protegido con contraseña."
            : "No se pudo abrir el PDF. Revisa tu conexión o descarga el original.",
        );
        setCargando(false);
      }
    })();

    return () => {
      cancelado = true;
      abortar.abort();
      void tarea?.destroy();
      viewerRef.current?.cleanup?.();
      viewerRef.current = null;
      busRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-muted/40">
      <div ref={contenedor} className="absolute inset-0 overflow-auto" tabIndex={0} aria-label="Páginas del documento">
        <div ref={interior} className="pdfViewer" />
      </div>
      {cargando && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground">
          Abriendo documento…
        </div>
      )}
    </div>
  );
});

export default MotorPdf;
