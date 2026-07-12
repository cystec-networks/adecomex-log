import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Simple WhatsApp SVG icon (brand green)
function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.11 17.28c-.29-.14-1.7-.84-1.96-.93-.26-.1-.45-.14-.64.14-.19.29-.74.93-.9 1.12-.17.19-.33.21-.62.07-.29-.14-1.22-.45-2.33-1.44-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.13-.59.13-.13.29-.34.43-.5.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.07-.14-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.49l-.55-.01c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.39s1.02 2.77 1.17 2.96c.14.19 2.02 3.08 4.89 4.32.68.29 1.21.47 1.62.6.68.22 1.3.19 1.79.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.33zM16 3C8.82 3 3 8.82 3 16c0 2.29.6 4.44 1.64 6.31L3 29l6.87-1.61A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.7c-1.99 0-3.86-.55-5.46-1.5l-.39-.23-3.83.9.91-3.73-.25-.4A10.68 10.68 0 0 1 5.3 16C5.3 10.1 10.1 5.3 16 5.3S26.7 10.1 26.7 16 21.9 26.7 16 26.7z"/>
    </svg>
  );
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  // If starts with country code already
  if (raw.trim().startsWith("+")) return digits;
  // Dominican Republic defaults for local numbers 10 digits starting with 809/829/849
  if (digits.length === 10 && /^(809|829|849)/.test(digits)) return "1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
}

export interface WhatsAppButtonProps {
  phone?: string | null;
  clientName?: string | null;
  recordType?: string; // e.g. "Expediente"
  recordNumber?: string | null;
  variant?: "default" | "icon";
  className?: string;
}

export function WhatsAppButton({
  phone,
  clientName,
  recordType,
  recordNumber,
  variant = "default",
  className,
}: WhatsAppButtonProps) {
  const normalized = normalizePhone(phone);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!normalized) {
      toast.error("Cliente sin número de contacto registrado");
      return;
    }
    const greeting = clientName ? `Hola ${clientName}` : "Hola";
    const ref = recordType && recordNumber ? ` con relación al ${recordType} ${recordNumber}` : "";
    const msg = `${greeting}, le contactamos desde ADECOMEX SRL${ref}.`;
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const disabled = !normalized;
  const title = disabled ? "Sin número de contacto registrado" : `Contactar por WhatsApp${clientName ? ` a ${clientName}` : ""}`;

  if (variant === "icon") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClick}
        title={title}
        aria-label={title}
        className={`${disabled ? "text-muted-foreground opacity-50" : "text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10"} ${className ?? ""}`}
      >
        <WhatsAppIcon />
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
      className={`gap-1.5 border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#128C7E] ${className ?? ""}`}
    >
      <WhatsAppIcon />
      WhatsApp
    </Button>
  );
}
