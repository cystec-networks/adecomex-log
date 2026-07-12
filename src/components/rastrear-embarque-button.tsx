import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ship, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export interface RastrearEmbarqueButtonProps {
  containerNumber?: string | null;
  blNumber?: string | null;
  expedienteNumber?: string | null;
  variant?: "default" | "icon";
  className?: string;
}

export function RastrearEmbarqueButton({
  containerNumber,
  blNumber,
  expedienteNumber,
  variant = "default",
  className,
}: RastrearEmbarqueButtonProps) {
  const container = (containerNumber ?? "").trim();
  const bl = (blNumber ?? "").trim();

  const handleTrack = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const url = container
      ? `https://e-tracking.net/tracking/container-tracking?container=${encodeURIComponent(container)}`
      : bl
        ? `https://e-tracking.net/tracking/bl-tracking?bl=${encodeURIComponent(bl)}`
        : "https://e-tracking.net/";

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!container) {
      toast.error("No hay número de contenedor para copiar");
      return;
    }
    navigator.clipboard.writeText(container);
    toast.success("Número de contenedor copiado");
  };

  const title = container
    ? `Rastrear embarque en e-tracking.net (contenedor ${container})`
    : bl
      ? `Rastrear embarque en e-tracking.net (BL/AWB ${bl})`
      : "Rastrear embarque en e-tracking.net";

  if (variant === "icon") {
    return (
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleTrack}
          title={title}
          aria-label={title}
          className={`text-cyan-600 hover:text-cyan-700 hover:bg-cyan-500/10 ${className ?? ""}`}
        >
          <Ship className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 flex-wrap ${className ?? ""}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleTrack}
        title={title}
        className="gap-1.5 border-cyan-500/40 text-cyan-700 hover:bg-cyan-500/10 hover:text-cyan-700"
      >
        <Ship className="h-4 w-4" />
        Rastrear Embarque
        <ExternalLink className="h-3 w-3 ml-0.5 opacity-70" />
      </Button>

      {container && (
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="font-mono text-xs">
            Contenedor: {container}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
            title="Copiar número de contenedor"
            aria-label="Copiar número de contenedor"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      )}

      {!container && bl && (
        <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
          BL/AWB: {bl}
        </Badge>
      )}
    </div>
  );
}
