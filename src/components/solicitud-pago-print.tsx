import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { fmtLocalDate } from "@/lib/dates";

export type SolicitudPagoPrintData = {
  numero_control: string;
  transportista_nombre: string;
  transportista_rnc?: string | null;
  telefono?: string | null;
  referencia_viaje?: string | null;
  placa_contenedor?: string | null;
  cantidad_viajes?: number | null;
  monto: number;
  moneda: string;
  descripcion?: string | null;
  created_at?: string | null;
};

const fmtMoney = (n: number, m: string) =>
  `${m === "USD" ? "US$" : m === "EUR" ? "€" : "RD$"} ${(n || 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #spt-print-area, #spt-print-area * { visibility: visible !important; }
  #spt-print-area {
    position: absolute !important;
    left: 0; top: 0; width: 100%;
    padding: 0; margin: 0; border: 0; box-shadow: none;
  }
  .spt-no-print { display: none !important; }
  [role="dialog"] {
    position: static !important;
    max-height: none !important;
    overflow: visible !important;
    transform: none !important;
    box-shadow: none !important;
  }
  @page { size: A4 portrait; margin: 16mm; }
}
`;

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value || "—"}</div>
    </div>
  );
}

export function SolicitudPagoPrintView({ solicitud }: { solicitud: SolicitudPagoPrintData }) {
  const s = solicitud;
  const cant = s.cantidad_viajes ?? 1;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        id="spt-print-area"
        className="mx-auto w-full max-w-[800px] bg-background p-6 text-foreground print:p-0"
      >
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <div className="font-display text-xl font-bold">ADECOMEX SRL</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Gestión y Logística</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">Solicitud de Pago de Transporte</div>
            <div className="text-xs text-muted-foreground">
              Fecha: {fmtLocalDate(s.created_at ?? undefined)}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-primary/40 bg-primary/5 px-4 py-3 text-center">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Número de control</div>
          <div className="font-mono text-3xl font-bold text-primary">{s.numero_control}</div>
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Datos del transportista
          </div>
          <div className="grid grid-cols-3 gap-4 rounded-md border p-4">
            <Campo label="Nombre" value={s.transportista_nombre} />
            <Campo label="RNC / Cédula" value={s.transportista_rnc} />
            <Campo label="Teléfono" value={s.telefono} />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Detalle del servicio
          </div>
          <div className="grid grid-cols-3 gap-4 rounded-md border p-4">
            <div className="col-span-3">
              <Campo label="Ruta / Referencia del viaje" value={s.referencia_viaje} />
            </div>
            <Campo label="Cantidad de viajes" value={cant} />
            <div className="col-span-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Monto total</div>
              <div className="text-lg font-bold">{fmtMoney(Number(s.monto), s.moneda)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border-2 border-foreground/20 p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Número(s) de contenedor
          </div>
          <div className="mt-1 break-words font-mono text-2xl font-bold leading-snug">
            {s.placa_contenedor?.trim() || "—"}
          </div>
        </div>

        {s.descripcion?.trim() ? (
          <div className="mt-4 rounded-md border p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Descripción / Notas</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{s.descripcion}</div>
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-2 gap-10">
          <div className="border-t pt-2 text-center text-xs text-muted-foreground">Firma del transportista</div>
          <div className="border-t pt-2 text-center text-xs text-muted-foreground">Recibido por ADECOMEX SRL</div>
        </div>

        <div className="mt-8 border-t pt-3 text-center text-[11px] text-muted-foreground">
          ADECOMEX SRL · Documento generado electrónicamente · {s.numero_control}
        </div>
      </div>
    </>
  );
}

export function SolicitudPagoPrintDialog({
  solicitud,
  open,
  onOpenChange,
}: {
  solicitud: SolicitudPagoPrintData | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="spt-no-print">
          <DialogTitle>Comprobante de solicitud de pago</DialogTitle>
        </DialogHeader>
        {solicitud ? <SolicitudPagoPrintView solicitud={solicitud} /> : null}
        <DialogFooter className="spt-no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir / Guardar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
