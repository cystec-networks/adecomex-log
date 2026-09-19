import flowMarkAsset from "@/assets/adecomex-flow-mark.webp.asset.json";
import flowHorizontalAsset from "@/assets/adecomex-flow-horizontal.webp.asset.json";
import { cn } from "@/lib/utils";

type AdecomexFlowLogoProps = {
  compact?: boolean;
  className?: string;
  markClassName?: string;
};

export function AdecomexFlowLogo({ compact = false, className, markClassName }: AdecomexFlowLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center overflow-hidden rounded-md bg-brand-surface text-primary shadow-sm ring-1 ring-border/60",
        compact ? "aspect-square justify-center p-1" : "gap-2 px-2.5 py-1.5",
        className,
      )}
    >
      <img
        src={compact ? flowMarkAsset.url : flowHorizontalAsset.url}
        alt="ADECOMEX Flow — Plataforma inteligente de gestión de importación"
        className={cn("shrink-0 object-contain", compact ? "h-full w-full" : "h-full w-full", markClassName)}
      />
    </div>
  );
}