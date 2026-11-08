// Visor integrado de la «Base normativa»: misma ventana de vista previa que el
// resto de módulos, con búsqueda de texto, navegación por páginas y descarga
// del original. El PDF se lee por partes para que los documentos pesados abran
// rápido.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Loader2, Maximize2, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EstadoBusqueda, MotorPdfApi } from "./visor-pdf-motor";

const MotorPdf = lazy(() => import("./visor-pdf-motor"));

const BUCKET = "base-normativa";
const VIGENCIA_URL_S = 3600;

export type DocumentoVisor = {
  id: string;
  titulo: string;
  tipo?: string | null;
  numero?: string | null;
  archivo_path: string | null;
  archivo_nombre: string | null;
  archivo_bytes: number | null;
  paginas?: number | null;
};

function useDocumentoVisor(documentoId: string | null, precargado?: DocumentoVisor | null) {
  return useQuery({
    queryKey: ["base-normativa", "visor", documentoId],
    enabled: !!documentoId && !precargado,
    initialData: precargado ?? undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("normativa_documentos")
        .select("id, titulo, tipo, numero, archivo_path, archivo_nombre, archivo_bytes, paginas")
        .eq("id", documentoId!)
        .maybeSingle();
      if (error) throw error;
      return (data as DocumentoVisor | null) ?? null;
    },
  });
}

/** Contenido del visor (cabecera de herramientas + páginas + pie). Reutilizable a pantalla completa. */
export function VisorNormativa({
  documentoId,
  documento: precargado,
  pagina,
  onCerrar,
  className,
}: {
  documentoId: string;
  documento?: DocumentoVisor | null;
  pagina?: number | null;
  onCerrar?: () => void;
  className?: string;
}) {
  const { data: doc, isLoading, error: errorDoc } = useDocumentoVisor(documentoId, precargado);
  const motor = useRef<MotorPdfApi>(null);
  const urlRef = useRef<{ url: string; vence: number } | null>(null);
  const [total, setTotal] = useState<number | null>(precargado?.paginas ?? null);
  const [actual, setActual] = useState<number>(pagina ?? 1);
  const [paginaTexto, setPaginaTexto] = useState(String(pagina ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultado, setResultado] = useState<{ estado: EstadoBusqueda; actual: number; total: number }>({
    estado: "inactiva",
    actual: 0,
    total: 0,
  });
  const [descargando, setDescargando] = useState(false);

  const path = doc?.archivo_path ?? null;

  const obtenerUrl = useCallback(
    async (renovar: boolean) => {
      if (!path) throw new Error("Sin archivo");
      const vigente = urlRef.current && urlRef.current.vence > Date.now() + 60_000;
      if (!renovar && vigente) return urlRef.current!.url;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, VIGENCIA_URL_S);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "No se pudo generar el enlace");
      urlRef.current = { url: data.signedUrl, vence: Date.now() + VIGENCIA_URL_S * 1000 };
      return data.signedUrl;
    },
    [path],
  );

  // Una cita nueva sobre el documento ya abierto salta a su página.
  useEffect(() => {
    if (pagina && listo) motor.current?.irAPagina(pagina);
  }, [pagina, listo]);

  useEffect(() => setPaginaTexto(String(actual)), [actual]);

  const irA = (n: number) => {
    if (!total) return;
    const p = Math.min(total, Math.max(1, Math.round(n)));
    motor.current?.irAPagina(p);
    setPaginaTexto(String(p));
  };

  async function descargar() {
    if (!path) return;
    setDescargando(true);
    try {
      const nombre = doc?.archivo_nombre || `${doc?.titulo ?? "documento"}.pdf`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120, { download: nombre });
      if (error || !data?.signedUrl) throw error ?? new Error("Sin enlace");
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("No se pudo descargar el original");
    } finally {
      setDescargando(false);
    }
  }

  const textoResultado =
    resultado.estado === "buscando"
      ? "Buscando…"
      : resultado.estado === "sin-resultados"
        ? "Sin resultados"
        : resultado.total > 0
          ? `${resultado.actual} de ${resultado.total}${resultado.estado === "vuelta" ? " · desde el inicio" : ""}`
          : "";

  const sinArchivo = !isLoading && (!doc || !path);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            motor.current?.buscar(busqueda, { repetir: true });
          }}
        >
          <div className="relative min-w-[10rem] flex-1">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                motor.current?.buscar(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault();
                  motor.current?.buscar(busqueda, { repetir: true, anterior: true });
                }
              }}
              placeholder="Buscar en el documento…"
              aria-label="Buscar en el documento"
              className="h-8 pl-8 pr-7 text-[13px]"
              disabled={!listo}
            />
            {busqueda && (
              <button
                type="button"
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setBusqueda("");
                  motor.current?.buscar("");
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Resultado anterior (Mayús + Intro)"
            aria-label="Resultado anterior"
            disabled={!busqueda.trim() || !listo}
            onClick={() => motor.current?.buscar(busqueda, { repetir: true, anterior: true })}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Resultado siguiente (Intro)"
            aria-label="Resultado siguiente"
            disabled={!busqueda.trim() || !listo}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <span
            className={cn(
              "min-w-[5.5rem] whitespace-nowrap text-[12px] text-muted-foreground",
              resultado.estado === "sin-resultados" && "text-destructive",
            )}
            aria-live="polite"
          >
            {busqueda.trim() ? textoResultado : ""}
          </span>
        </form>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Página anterior"
            disabled={!listo || actual <= 1}
            onClick={() => irA(actual - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <form
            className="flex items-center gap-1 text-[12px]"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number.parseInt(paginaTexto, 10);
              if (Number.isFinite(n)) irA(n);
              else setPaginaTexto(String(actual));
            }}
          >
            <span className="text-muted-foreground">Página</span>
            <Input
              value={paginaTexto}
              onChange={(e) => setPaginaTexto(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setPaginaTexto(String(actual))}
              inputMode="numeric"
              aria-label="Ir a la página"
              className="h-8 w-14 px-1 text-center text-[13px]"
              disabled={!listo}
            />
            <span className="whitespace-nowrap text-muted-foreground">de {total ?? "…"}</span>
          </form>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Página siguiente"
            disabled={!listo || !total || actual >= total}
            onClick={() => irA(actual + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Reducir" disabled={!listo} onClick={() => motor.current?.zoom("menos")}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ampliar" disabled={!listo} onClick={() => motor.current?.zoom("mas")}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Ajustar al ancho"
            aria-label="Ajustar al ancho"
            disabled={!listo}
            onClick={() => motor.current?.zoom("ancho")}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {isLoading && (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando documento…
          </div>
        )}
        {(errorDoc || sinArchivo) && (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-destructive">
            {errorDoc ? "No se pudo leer el documento." : "Este documento no está disponible o no tiene un PDF cargado."}
          </div>
        )}
        {error && (
          <div className="absolute inset-x-0 top-0 z-10 border-b bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}
        {doc && path && (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Preparando el visor…
              </div>
            }
          >
            <MotorPdf
              key={path}
              ref={motor}
              obtenerUrl={obtenerUrl}
              bytes={doc.archivo_bytes}
              paginaInicial={pagina}
              onPaginas={setTotal}
              onPagina={setActual}
              onBusqueda={(estado, a, t) => setResultado({ estado, actual: a, total: t })}
              onError={setError}
              onListo={() => setListo(true)}
            />
          </Suspense>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
        <Button variant="outline" size="sm" onClick={descargar} disabled={!path || descargando}>
          {descargando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
          Descargar original
        </Button>
        {onCerrar && (
          <Button size="sm" onClick={onCerrar}>
            Cerrar
          </Button>
        )}
      </div>
    </div>
  );
}

/** Ventana de vista previa con el visor integrado. */
export function VisorNormativaDialog({
  abierto,
  onCerrar,
  documentoId,
  documento,
  pagina,
}: {
  abierto: boolean;
  onCerrar: () => void;
  documentoId: string | null;
  documento?: DocumentoVisor | null;
  pagina?: number | null;
}) {
  const { data: doc } = useDocumentoVisor(abierto ? documentoId : null, documento);
  const titulo = doc?.titulo ?? documento?.titulo ?? "Documento";
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-3 pr-12 text-left">
          <DialogTitle className="truncate text-base" title={titulo}>
            {titulo}
          </DialogTitle>
          <DialogDescription className="truncate text-[12px]">
            {[doc?.tipo, doc?.numero ? `núm. ${doc.numero}` : null, pagina ? `abierto en la página ${pagina}` : null]
              .filter(Boolean)
              .join(" · ") || "Base normativa"}
          </DialogDescription>
        </DialogHeader>
        {abierto && documentoId && (
          <VisorNormativa
            key={documentoId}
            documentoId={documentoId}
            documento={documento}
            pagina={pagina}
            onCerrar={onCerrar}
            className="flex-1"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
