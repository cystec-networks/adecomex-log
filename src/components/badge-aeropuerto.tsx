import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { nombreAeropuertoDga } from "@/lib/aeropuertos-dga";

/**
 * Etiqueta "Aeropuerto" para los códigos de aeropuerto del catálogo maestro de
 * puertos de la DGA. El tooltip muestra el nombre completo del aeropuerto.
 *
 * No se renderiza nada para puertos marítimos, pasos fronterizos, códigos
 * vacíos o códigos sin nombre (como DOJQB), para no confundir al usuario.
 */
export function BadgeAeropuerto({
  codigo,
  compacto = false,
  className,
}: {
  codigo?: string | null;
  compacto?: boolean;
  className?: string;
}) {
  const nombre = nombreAeropuertoDga(codigo);
  if (!nombre) return null;
  return (
    <span
      title={nombre}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
        compacto ? "px-1 py-0 text-[11px] leading-4" : "px-1.5 py-0.5 text-[11px]",
        className,
      )}
    >
      <Plane className={cn("shrink-0", compacto ? "h-2.5 w-2.5" : "h-3 w-3")} aria-hidden="true" />
      Aeropuerto
    </span>
  );
}
