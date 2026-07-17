import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ExternalLink, Eye, Loader2 } from "lucide-react";

const IMG_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];

function extOf(path: string): string {
  const clean = path.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return "";
  return clean.slice(dot + 1).toLowerCase();
}

type Kind = "pdf" | "image" | "other";

function kindOf(path: string): Kind {
  const e = extOf(path);
  if (e === "pdf") return "pdf";
  if (IMG_EXT.includes(e)) return "image";
  return "other";
}

export function DocumentoPreviewButton({
  path,
  bucket = "documentos",
  label = "Ver",
  variant = "outline",
  size = "sm",
  className,
  children,
  icon,
}: {
  path: string;
  bucket?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  children?: React.ReactNode;
  /** Icono opcional dentro del botón (default: <Eye />) */
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = kindOf(path);

  useEffect(() => {
    if (!open) {
      setUrl(null);
      setError(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 300)
      .then(({ data, error }) => {
        if (cancel) return;
        if (error || !data?.signedUrl) {
          setError(error?.message ?? "No se pudo generar el enlace");
        } else {
          setUrl(data.signedUrl);
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, bucket, path]);

  const openExternal = () => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          {children ?? (
            <>
              {icon ?? <Eye className="h-3.5 w-3.5 mr-1" />}
              {label}
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="text-base truncate">{path.split("/").pop()}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-muted/30 flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando documento…
            </div>
          )}
          {!loading && error && (
            <div className="text-sm text-center px-6 space-y-3">
              <p className="text-destructive">No se pudo previsualizar este archivo.</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}
          {!loading && !error && url && kind === "pdf" && (
            <iframe
              src={url}
              title="Vista previa PDF"
              className="w-full h-full border-0"
            />
          )}
          {!loading && !error && url && kind === "image" && (
            <img
              src={url}
              alt="Vista previa"
              className="max-w-full max-h-full object-contain"
            />
          )}
          {!loading && !error && url && kind === "other" && (
            <div className="text-sm text-center px-6 space-y-3">
              <p>No se pudo previsualizar este archivo en el navegador.</p>
              <Button variant="outline" size="sm" onClick={openExternal}>
                <ExternalLink className="h-4 w-4 mr-1" /> Abrir en pestaña nueva
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={openExternal}
            disabled={!url}
          >
            <ExternalLink className="h-4 w-4 mr-1" /> Abrir en pestaña nueva
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DocumentoPreviewButton;
