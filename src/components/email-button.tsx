import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailButtonProps {
  email?: string | null;
  clientName?: string | null;
  recordType?: string;
  recordNumber?: string | null;
  variant?: "default" | "icon";
  className?: string;
}

export function EmailButton({
  email,
  clientName,
  recordType,
  recordNumber,
  variant = "default",
  className,
}: EmailButtonProps) {
  const clean = (email ?? "").trim();
  const valid = EMAIL_RE.test(clean);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!valid) {
      toast.error("Cliente sin correo registrado");
      return;
    }
    const ref = recordType && recordNumber ? `${recordType} ${recordNumber} - ADECOMEX SRL` : "ADECOMEX SRL";
    const greeting = clientName ? `Estimado(a) ${clientName}` : "Estimado(a) cliente";
    const refBody = recordType && recordNumber ? ` respecto a su ${recordType.toLowerCase()} ${recordNumber}` : "";
    const body = `${greeting},\n\nLe escribimos desde ADECOMEX SRL${refBody}.\n\nSaludos cordiales,\nEquipo ADECOMEX SRL`;
    const url = `mailto:${clean}?subject=${encodeURIComponent(ref)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  const disabled = !valid;
  const title = disabled
    ? "Cliente sin correo registrado"
    : `Enviar correo${clientName ? ` a ${clientName}` : ""}`;

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
        <Mail className="h-4 w-4" />
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
      <Mail className="h-4 w-4" />
      Correo
    </Button>
  );
}
