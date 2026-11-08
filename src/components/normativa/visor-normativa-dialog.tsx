// Visor integrado de la «Base normativa»: misma ventana de vista previa que el
// resto de módulos, con búsqueda de texto, navegación por páginas y descarga
// del original. El PDF se lee por partes para que los documentos pesados abran
// rápido.
import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisorPdf } from "./visor-pdf";

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
  const urlRef = useRef<{ url: string; vence: number } | null>(null);
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

  const sinArchivo = !isLoading && (!doc || !path);

  return (
    <VisorPdf
      claveArchivo={doc && path ? path : null}
      obtenerUrl={obtenerUrl}
      bytes={doc?.archivo_bytes}
      paginasIniciales={precargado?.paginas ?? null}
      pagina={pagina}
      cargando={isLoading}
      errorCarga={
        errorDoc
          ? "No se pudo leer el documento."
          : sinArchivo
            ? "Este documento no está disponible o no tiene un PDF cargado."
            : null
      }
      onDescargar={descargar}
      descargando={descargando}
      onCerrar={onCerrar}
      className={className}
    />
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
