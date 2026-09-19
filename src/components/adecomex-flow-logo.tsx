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
        "flex items-center overflow-hidden rounded-md bg-brand-surface text-primary shadow-sm ring-1 ring-border/60",
        compact ? "aspect-square justify-center p-1" : "gap-2 px-2.5 py-1.5",
        className,
      )}
    >
      <img
        src={flowMarkAsset.url}
        alt=""
        className={cn("shrink-0 object-contain", compact ? "h-full w-full" : "h-10 w-10", markClassName)}
      />
      {!compact && (
        <div className="min-w-0 leading-none">
          <div className="whitespace-nowrap font-display text-lg font-extrabold text-primary">
            ADECOMEX <span className="text-brand-red">FLOW</span>
          </div>
          <div className="mt-1 whitespace-nowrap text-[7px] font-semibold uppercase text-primary">
            Plataforma inteligente de gestión de importación
          </div>
        </div>
      )}
    </div>
  );
}