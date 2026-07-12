import { Button } from "@/components/ui/button";
import { MailSearch } from "lucide-react";
import { toast } from "sonner";
import { useGmailAuthuser } from "@/lib/system-settings";

export interface SearchEmailButtonProps {
  /** Number/identifier used as Gmail search term (e.g. expediente numero). */
  recordNumber?: string | null;
  /** Optional label context, e.g. "Expediente", used only for tooltip. */
  recordType?: string;
  variant?: "default" | "icon";
  className?: string;
}

export function SearchEmailButton({
  recordNumber,
  recordType,
  variant = "icon",
  className,
}: SearchEmailButtonProps) {
  const { authuser } = useGmailAuthuser();
  const term = (recordNumber ?? "").trim();
  const disabled = !term;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      toast.error("Guarda el registro primero para tener un número de búsqueda");
      return;
    }
    const url = `https://mail.google.com/mail/u/${encodeURIComponent(authuser)}/#search/${encodeURIComponent(term)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const title = disabled
    ? "Sin número para buscar"
    : `Buscar en Gmail: ${recordType ? recordType + " " : ""}${term}`;

  if (variant === "icon") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClick}
        title={title}
        aria-label={title}
        className={`${disabled ? "text-muted-foreground opacity-50" : "text-primary hover:text-primary hover:bg-primary/10"} ${className ?? ""}`}
      >
        <MailSearch className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      title={title}
      disabled={disabled}
      className={`gap-1.5 ${className ?? ""}`}
    >
      <MailSearch className="h-4 w-4" />
      Buscar en Correo
    </Button>
  );
}
