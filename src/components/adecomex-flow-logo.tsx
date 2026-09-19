import flowLogoAsset from "@/assets/logo-adecomex-flow-oficial.png.asset.json";
import flowMarkAsset from "@/assets/adecomex-flow-mark.webp.asset.json";
import { cn } from "@/lib/utils";

type AdecomexFlowLogoProps = {
  compact?: boolean;
  className?: string;
  markClassName?: string;
};

export function AdecomexFlowLogo({ compact = false, className, markClassName }: AdecomexFlowLogoProps) {
  return (
    <div
      aria-label="ADECOMEX Flow — Plataforma inteligente de gestión de importación"
      className={cn(
        "flex items-center overflow-hidden rounded-md bg-brand-surface shadow-sm ring-1 ring-border/60",
        compact ? "aspect-square justify-center p-1" : "px-3 py-1.5",
        className,
      )}
    >
      {compact ? (
        <img
          src={flowMarkAsset.url}
          alt="ADECOMEX Flow"
          className={cn("h-full w-full shrink-0 object-contain", markClassName)}
        />
      ) : (
        <img
          src={flowLogoAsset.url}
          alt="ADECOMEX Flow — Plataforma inteligente de gestión de importación"
          className={cn("h-11 w-auto shrink-0 object-contain", markClassName)}
        />
      )}
    </div>
  );
}
