import { Badge } from "@/components/ui/badge";
import { daysFromToday, fmtLocalDate } from "@/lib/dates";

/**
 * Indicador de countdown por color, con el mismo esquema visual usado
 * en Documentos Legales / Permisos.
 */
export function BadgeVigencia({
  fecha,
  umbralAmarillo = 15,
}: {
  fecha: string | null | undefined;
  umbralAmarillo?: number;
}) {
  if (!fecha) return <span className="text-muted-foreground">—</span>;
  const d = daysFromToday(fecha);
  if (isNaN(d)) return <span className="text-muted-foreground">—</span>;
  if (d < 0)
    return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expirada hace {Math.abs(d)} d</Badge>;
  if (d === 0)
    return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expira hoy</Badge>;
  if (d <= umbralAmarillo)
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Vence en {d} d</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{fmtLocalDate(fecha)} · {d} d</Badge>;
}
