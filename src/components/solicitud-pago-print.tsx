import { fmtLocalDate } from "@/lib/dates";

export type SolicitudPagoPrintData = {
  numero_control: string;
  transportista_nombre: string;
  transportista_rnc?: string | null;
  telefono?: string | null;
  referencia_viaje?: string | null;
  placa_contenedor?: string | null;
  cantidad_viajes?: number | null;
  precio_viaje?: number | null;
  porcentaje_margen?: number | null;
  monto: number;
  descuento_cxc?: number | null;
  factura_costo_numero?: string | null;
  factura_costo_fecha?: string | null;
  moneda: string;
  cliente_nombre?: string | null;
  descripcion?: string | null;
  created_at?: string | null;
  numero_viaje?: string | null;
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
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {s.numero_viaje?.trim() ? "N° Viaje / Ref." : "Número de control"}
          </div>
          <div className="font-mono text-xl font-bold leading-tight text-primary">
            {s.numero_viaje?.trim() || s.numero_control}
          </div>
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

        {s.cliente_nombre?.trim() ? (
          <div className="mt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cliente
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs font-semibold">{s.cliente_nombre}</div>
            </div>
          </div>
        ) : null}

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
              {(() => {
                const hayMargen = s.cantidad_viajes != null && s.precio_viaje != null;
                const montoFacturar = hayMargen ? Number(s.cantidad_viajes) * Number(s.precio_viaje) : null;
                const costoCalc = montoFacturar != null && s.porcentaje_margen != null
                  ? montoFacturar * (1 - Number(s.porcentaje_margen) / 100)
                  : null;
                const costoFinal = costoCalc ?? Number(s.monto);
                const descuento = Number(s.descuento_cxc ?? 0);
                const neto = costoFinal - descuento;
                return hayMargen || descuento > 0 ? (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Desglose del pago</div>
                    <div className="grid grid-cols-2 gap-x-2 text-xs">
                      {hayMargen ? (
                        <>
                          <span className="text-muted-foreground">Cantidad de Viajes</span>
                          <span className="text-right font-medium">{Number(s.cantidad_viajes)}</span>
                          <span className="text-muted-foreground">Precio por Viaje</span>
                          <span className="text-right font-medium">{fmtMoney(Number(s.precio_viaje), s.moneda)}</span>
                          <span className="text-muted-foreground">Monto a Facturar al Cliente</span>
                          <span className="text-right font-medium">{fmtMoney(Number(montoFacturar), s.moneda)}</span>
                          <span className="text-muted-foreground">% Margen de Ganancia</span>
                          <span className="text-right font-medium">{Number(s.porcentaje_margen ?? 0)}%</span>
                        </>
                      ) : null}
                      <span className="text-muted-foreground">Costo del Viaje</span>
                      <span className="text-right font-medium">{fmtMoney(costoFinal, s.moneda)}</span>
                      {descuento > 0 ? (
                        <>
                          <span className="text-muted-foreground">Descuento por CxC</span>
                          <span className="text-right font-medium text-destructive">-{fmtMoney(descuento, s.moneda)}</span>
                        </>
                      ) : null}
                      <span className="font-semibold">Monto Neto a Pagar</span>
                      <span className="text-right font-bold">{fmtMoney(neto, s.moneda)}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Monto total</div>
                    <div className="text-sm font-bold">{fmtMoney(Number(s.monto), s.moneda)}</div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {s.factura_costo_numero?.trim() ? (
          <div className="mt-2 rounded-md border p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Factura de Costo</div>
            <div className="text-xs font-medium">
              {s.factura_costo_numero}
              {s.factura_costo_fecha ? ` — ${fmtLocalDate(s.factura_costo_fecha)}` : null}
            </div>
          </div>
        ) : null}

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
