import { Bell, AlertTriangle, Clock, FileWarning, Truck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { useReminders, type Reminder } from "@/lib/reminders";

const KIND_ICON = {
  solicitud_sin_convertir: Inbox,
  expediente_inactivo: Clock,
  eta_proximo: AlertTriangle,
  permiso_por_vencer: FileWarning,
  permiso_vencido: FileWarning,
  transporte_retrasado: Truck,
} as const;

const SEV_STYLE = {
  critica: "text-destructive",
  alta: "text-[var(--warning-foreground)]",
  media: "text-[var(--info)]",
} as const;

export function NotificationsBell() {
  const { visible, dismiss, clearAll } = useReminders();
  const count = visible.length;
  const critical = visible.filter((r) => r.severity === "critica").length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold grid place-items-center ${
                critical > 0 ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-semibold">Atención requerida</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{count} activos</Badge>
            {count > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => visible.forEach((r) => dismiss(r.id))}>
                Marcar todo visto
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          {count === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sin alertas pendientes 🎉</div>
          ) : (
            <ul className="divide-y">
              {visible.map((r) => (
                <ReminderRow key={r.id} r={r} onDismiss={() => dismiss(r.id)} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ReminderRow({ r, onDismiss }: { r: Reminder; onDismiss: () => void }) {
  const Icon = KIND_ICON[r.kind];
  return (
    <li className="p-3 hover:bg-muted/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${SEV_STYLE[r.severity]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <Link to={r.href} className="text-sm font-medium hover:underline block truncate">
            {r.title}
          </Link>
          <div className="text-xs text-muted-foreground truncate">{r.detail}</div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onDismiss}>
          Visto
        </Button>
      </div>
    </li>
  );
}
