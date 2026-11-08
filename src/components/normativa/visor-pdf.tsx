// Visor PDF integrado genérico: cabecera con búsqueda de texto, navegación por
// páginas y zoom, área de páginas (pdf.js por partes) y pie con «Descargar
// original». Lo usan la «Base normativa» y los avisos PDF de «Novedades».
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Loader2, Maximize2, Search, X, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EstadoBusqueda, MotorPdfApi } from "./visor-pdf-motor";

const MotorPdf = lazy(() => import("./visor-pdf-motor"));

export type VisorPdfProps = {
  /** Identifica el archivo cargado; `null` mientras no hay archivo listo. */
  claveArchivo: string | null;
  obtenerUrl: (renovar: boolean) => Promise<string>;
  bytes?: number | null;
  /** Archivo completo en memoria (URL local): se abre sin pedir partes. */
  sinRangos?: boolean;
  paginasIniciales?: number | null;
  pagina?: number | null;
  /** Se está preparando el archivo (antes de que el motor pueda abrirlo). */
  cargando?: boolean;
  mensajeCargando?: string;
  /** Error que impide mostrar el documento. */
  errorCarga?: ReactNode | null;
  onDescargar?: () => void;
  descargando?: boolean;
  /** Acciones adicionales del pie (p. ej. «Abrir en el sitio oficial»). */
  extraPie?: ReactNode;
  onCerrar?: () => void;
  className?: string;
};

export function VisorPdf({
  claveArchivo,
  obtenerUrl,
  bytes,
  sinRangos,
  paginasIniciales,
  pagina,
  cargando,
  mensajeCargando = "Cargando documento…",
  errorCarga,
  onDescargar,
  descargando,
  extraPie,
  onCerrar,
  className,
}: VisorPdfProps) {
  const motor = useRef<MotorPdfApi>(null);
  const [total, setTotal] = useState<number | null>(paginasIniciales ?? null);
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

  const textoResultado =
    resultado.estado === "buscando"
      ? "Buscando…"
      : resultado.estado === "sin-resultados"
        ? "Sin resultados"
        : resultado.total > 0
          ? `${resultado.actual} de ${resultado.total}${resultado.estado === "vuelta" ? " · desde el inicio" : ""}`
          : "";

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
        {cargando && (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {mensajeCargando}
          </div>
        )}
        {!cargando && errorCarga && (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-destructive">
            {errorCarga}
          </div>
        )}
        {error && (
          <div className="absolute inset-x-0 top-0 z-10 border-b bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}
        {!cargando && !errorCarga && claveArchivo && (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Preparando el visor…
              </div>
            }
          >
            <MotorPdf
              key={claveArchivo}
              ref={motor}
              obtenerUrl={obtenerUrl}
              bytes={bytes}
              sinRangos={sinRangos}
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
        <div className="flex flex-wrap items-center gap-2">
          {onDescargar && (
            <Button variant="outline" size="sm" onClick={onDescargar} disabled={!claveArchivo || !!errorCarga || descargando}>
              {descargando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              Descargar original
            </Button>
          )}
          {extraPie}
        </div>
        {onCerrar && (
          <Button size="sm" onClick={onCerrar}>
            Cerrar
          </Button>
        )}
      </div>
    </div>
  );
}
