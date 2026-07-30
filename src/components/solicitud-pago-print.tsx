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
@page { size: A4 portrait; margin: 12mm; }
`;

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-medium text-foreground">{value || "—"}</div>
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
        className="mx-auto w-full max-w-[680px] bg-background p-3 text-foreground"
        style={{ margin: "0 auto" }}
      >
        <div className="flex items-start justify-between border-b pb-2">
          <div>
            <div className="font-display text-base font-bold leading-tight">ADECOMEX SRL</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gestión y Logística</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold">Solicitud de Pago de Transporte</div>
            <div className="text-[10px] text-muted-foreground">
              Fecha: {fmtLocalDate(s.created_at ?? undefined)}
            </div>
          </div>
        </div>

        <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Número de control</div>
          <div className="font-mono text-xl font-bold leading-tight text-primary">{s.numero_control}</div>
        </div>

        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Datos del transportista
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md border p-2">
            <Campo label="Nombre" value={s.transportista_nombre} />
            <Campo label="RNC / Cédula" value={s.transportista_rnc} />
            <Campo label="Teléfono" value={s.telefono} />
          </div>
        </div>

        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Detalle del servicio
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md border p-2">
            <div className="col-span-3">
              <Campo label="Ruta / Referencia del viaje" value={s.referencia_viaje} />
            </div>
            <Campo label="Cantidad de viajes" value={cant} />
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Monto total</div>
              <div className="text-sm font-bold">{fmtMoney(Number(s.monto), s.moneda)}</div>
            </div>
          </div>
        </div>

        <div className="mt-2 rounded-md border-2 border-foreground/20 p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Número(s) de contenedor
          </div>
          <div className="mt-0.5 break-words font-mono text-lg font-bold leading-snug">
            {s.placa_contenedor?.trim() || "—"}
          </div>
        </div>

        {s.descripcion?.trim() ? (
          <div className="mt-2 rounded-md border p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Descripción / Notas</div>
            <div className="mt-0.5 whitespace-pre-wrap text-xs">{s.descripcion}</div>
          </div>
        ) : null}

        <div className="mt-3 border-t pt-1.5 text-center text-[10px] text-muted-foreground">
          ADECOMEX SRL · Documento generado electrónicamente · {s.numero_control}
        </div>
      </div>
    </>
  );
}
