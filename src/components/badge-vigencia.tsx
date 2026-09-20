import { Badge } from "@/components/ui/badge";
import { daysFromToday, fmtLocalDate, parseLocalDate } from "@/lib/dates";

/**
 * Indicador de countdown por color, con el mismo esquema visual usado
 * en Documentos Legales / Permisos.
 *
 * `conHora`: interpreta el valor como fecha y hora (timestamp) y muestra
 * las horas restantes cuando falta menos de un día — usado para ventanas
 * cortas como la vigencia del PIN de pago de la DGA (96 horas).
 */
export function BadgeVigencia({
  fecha,
  umbralAmarillo = 15,
  conHora = false,
}: {
  fecha: string | null | undefined;
  umbralAmarillo?: number;
  conHora?: boolean;
}) {
  if (!fecha) return <span className="text-muted-foreground">—</span>;

  if (conHora) {
    const limite = new Date(fecha);
    if (isNaN(limite.getTime())) return <span className="text-muted-foreground">—</span>;
    const ms = limite.getTime() - Date.now();
    const fmtFull = limite.toLocaleString("es-DO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    if (ms <= 0) {
      const horas = Math.floor(-ms / 3600000);
      return (
        <Badge title={fmtFull} className="bg-rose-100 text-rose-700 border-rose-200">
          {horas < 24 ? `Vencido hace ${horas} h` : `Vencido hace ${Math.floor(horas / 24)} d`}
        </Badge>
      );
    }
    const horasRest = Math.floor(ms / 3600000);
    if (horasRest < 24) {
      const minutos = Math.floor((ms % 3600000) / 60000);
      return (
        <Badge title={fmtFull} className="bg-amber-100 text-amber-700 border-amber-200">
          Vence en {horasRest} h {minutos} min
        </Badge>
      );
    }
    const dias = Math.floor(horasRest / 24);
    const resto = horasRest % 24;
    const cls =
      dias <= 1
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-emerald-100 text-emerald-700 border-emerald-200";
    return (
      <Badge title={fmtFull} className={cls}>
        Vence en {dias} d {resto} h
      </Badge>
    );
  }

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

/**
 * Vigencia del PIN de pago DGA: countdown hasta la Fecha de Término.
 * Si ya hay Fecha de pago, deja de contar y muestra "Pagado" (con
 * advertencia si el pago fue posterior al vencimiento del PIN).
 */
export function BadgeVigenciaPinDga({
  terminoAt,
  fechaPago,
}: {
  terminoAt: string | null | undefined;
  fechaPago?: string | null;
}) {
  if (fechaPago) {
    // Fecha de pago es solo fecha: se compara contra el fin de ese día local.
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(String(fechaPago));
    const pago = soloFecha ? parseLocalDate(fechaPago) : new Date(fechaPago);
    if (soloFecha) pago.setHours(23, 59, 59, 999);
    const limite = terminoAt ? new Date(terminoAt) : null;
    const tarde = limite && !isNaN(limite.getTime()) && !isNaN(pago.getTime()) && pago.getTime() > limite.getTime();
    return tarde ? (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200" title="El pago se registró después del vencimiento del PIN">
        Pagado fuera de vigencia
      </Badge>
    ) : (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Pagado</Badge>
    );
  }
  if (!terminoAt) return null;
  return <BadgeVigencia fecha={terminoAt} conHora />;
}
