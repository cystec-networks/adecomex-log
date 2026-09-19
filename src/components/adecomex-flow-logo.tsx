import flowLogoAsset from "@/assets/logo-adecomex-flow-oficial.png.asset.json";
import flowMarkAsset from "@/assets/adecomex-flow-mark.webp.asset.json";
import flowWordmarkAsset from "@/assets/adecomex-flow-wordmark.png.asset.json";
import { cn } from "@/lib/utils";

type AdecomexFlowLogoProps = {
  compact?: boolean;
  wordmarkOnly?: boolean;
  className?: string;
  markClassName?: string;
};

export function AdecomexFlowLogo({ compact = false, wordmarkOnly = false, className, markClassName }: AdecomexFlowLogoProps) {
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
          src={wordmarkOnly ? flowWordmarkAsset.url : flowLogoAsset.url}
          alt={wordmarkOnly ? "ADECOMEX Flow" : "ADECOMEX Flow — Plataforma inteligente de gestión de importación"}
          className={cn(wordmarkOnly ? "h-full w-full object-contain" : "h-11 w-auto shrink-0 object-contain", markClassName)}
        />
      )}
    </div>
  );
}
