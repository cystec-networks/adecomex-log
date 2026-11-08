// Enlace de una novedad (Panel de operaciones y lista de Novedades).
// - Páginas web: enlace HTML normal en otra pestaña (sin window.open tras una
//   espera, que el navegador bloquea como ventana emergente).
// - Avisos PDF: se abren en el visor integrado (el sitio oficial se lee desde
//   el servidor) con un enlace secundario «Abrir en el sitio oficial».
// - Enlaces que no responden: «Enlace no disponible» con opción de reintentar,
//   en lugar de abrir una pestaña en blanco.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisorPdf } from "@/components/normativa/visor-pdf";
import { abreEnVisorPdf } from "@/lib/novedades-comercio";
import { leerPdfNovedad, verificarEnlacesNovedad } from "@/lib/novedades-comercio.functions";
import { cn } from "@/lib/utils";

export type NovedadEnlace = {
  id: string;
  titulo: string;
  url: string;
  fuente_nombre?: string | null;
  enlace_estado?: string | null;
  enlace_es_pdf?: boolean | null;
  enlace_mensaje?: string | null;
};

/** Claves de consulta que muestran novedades (se refrescan al cambiar el estado de un enlace). */
const CLAVES_NOVEDADES = [["novedades-panel"], ["novedades-comercio"]];

function useRefrescarNovedades() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const k of CLAVES_NOVEDADES) void qc.invalidateQueries({ queryKey: k });
  }, [qc]);
}

function EnlaceOficial({ url, className, children }: { url: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

export function EnlaceNovedad({
  novedad: n,
  className,
}: {
  novedad: NovedadEnlace;
  className?: string;
}) {
  const verificar = useServerFn(verificarEnlacesNovedad);
  const refrescar = useRefrescarNovedades();
  const [visorAbierto, setVisorAbierto] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const titulo = cn("text-[13px] font-medium", className);

  async function reintentar() {
    setReintentando(true);
    try {
      const [r] = await verificar({ data: { ids: [n.id] } });
      if (r?.estado === "no_disponible") toast.error(`Enlace no disponible: ${r.mensaje}`);
      else toast.success("El enlace vuelve a responder");
      refrescar();
    } catch {
      toast.error("No se pudo comprobar el enlace");
    } finally {
      setReintentando(false);
    }
  }

  if (n.enlace_estado === "no_disponible") {
    return (
      <div className="min-w-0">
        <span className={titulo}>{n.titulo}</span>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          <span
            className="inline-flex items-center gap-1 font-medium text-destructive"
            title={n.enlace_mensaje ?? "El sitio oficial no respondió"}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> Enlace no disponible
          </span>
          <button
            type="button"
            onClick={reintentar}
            disabled={reintentando}
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
          >
            {reintentando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (abreEnVisorPdf(n)) {
    return (
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setVisorAbierto(true)}
          className={cn(titulo, "inline-flex items-center gap-1 text-left hover:underline")}
          title="Abrir el aviso en el visor de la plataforma"
        >
          {n.titulo} <FileText className="h-3 w-3 shrink-0" aria-hidden />
        </button>
        <div className="text-[11px]">
          <EnlaceOficial
            url={n.url}
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Abrir en el sitio oficial <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </EnlaceOficial>
        </div>
        {visorAbierto && (
          <VisorPdfNovedadDialog novedad={n} onCerrar={() => setVisorAbierto(false)} />
        )}
      </div>
    );
  }

  return (
    <EnlaceOficial url={n.url} className={cn(titulo, "inline-flex items-center gap-1 hover:underline")}>
      {n.titulo} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </EnlaceOficial>
  );
}

type EstadoPdf =
  | { fase: "cargando" }
  | { fase: "listo"; url: string; bytes: number; nombre: string }
  | { fase: "error"; mensaje: string };

function decodificarBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Visor integrado para el aviso PDF de una novedad. */
export function VisorPdfNovedadDialog({ novedad: n, onCerrar }: { novedad: NovedadEnlace; onCerrar: () => void }) {
  const leer = useServerFn(leerPdfNovedad);
  const refrescar = useRefrescarNovedades();
  const [estado, setEstado] = useState<EstadoPdf>({ fase: "cargando" });
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await leer({ data: { id: n.id } });
        if (!vivo) return;
        if (!r.ok) {
          setEstado({
            fase: "error",
            mensaje: r.motivo === "no_disponible" ? `Enlace no disponible. ${r.mensaje}` : r.mensaje,
          });
          if (r.motivo === "no_disponible") refrescar();
          return;
        }
        const blob = new Blob([decodificarBase64(r.base64) as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setEstado({ fase: "listo", url, bytes: r.bytes, nombre: r.nombre });
      } catch {
        if (vivo) setEstado({ fase: "error", mensaje: "No se pudo traer el documento del sitio oficial." });
      }
    })();
    return () => {
      vivo = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [leer, n.id, refrescar]);

  const obtenerUrl = useCallback(async () => {
    if (estado.fase !== "listo") throw new Error("Documento no disponible");
    return estado.url;
  }, [estado]);

  function descargar() {
    if (estado.fase !== "listo") return;
    const a = document.createElement("a");
    a.href = estado.url;
    a.download = estado.nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-3 pr-12 text-left">
          <DialogTitle className="truncate text-base" title={n.titulo}>
            {n.titulo}
          </DialogTitle>
          <DialogDescription className="truncate text-[12px]">
            {n.fuente_nombre ? `${n.fuente_nombre} · ` : ""}Aviso del sitio oficial
          </DialogDescription>
        </DialogHeader>
        <VisorPdf
          claveArchivo={estado.fase === "listo" ? estado.url : null}
          obtenerUrl={obtenerUrl}
          bytes={estado.fase === "listo" ? estado.bytes : null}
          sinRangos
          cargando={estado.fase === "cargando"}
          mensajeCargando="Trayendo el aviso del sitio oficial…"
          errorCarga={estado.fase === "error" ? estado.mensaje : null}
          onDescargar={descargar}
          extraPie={
            <EnlaceOficial
              url={n.url}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Abrir en el sitio oficial <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </EnlaceOficial>
          }
          onCerrar={onCerrar}
          className="flex-1"
        />
      </DialogContent>
    </Dialog>
  );
}
