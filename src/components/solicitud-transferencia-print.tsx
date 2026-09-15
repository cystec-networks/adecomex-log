import { fmtLocalDate } from "@/lib/dates";

export type SolicitudTransferenciaPrintData = {
  secuencia: string;
  fecha: string;
  categoria: string;
  factura_compra?: string | null;
  beneficiario: string;
  concepto: string;
  monto: number;
  descuento_cxc?: number | null;
  transporte_numero_control?: string | null;
};

const fmtMoney = (n: number) =>
  `RD$ ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export function SolicitudTransferenciaPrintView({
  solicitud,
}: {
  solicitud: SolicitudTransferenciaPrintData;
}) {
  const s = solicitud;
  const descuento = Number(s.descuento_cxc ?? 0);
  const neto = Number(s.monto || 0) - descuento;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mx-auto w-full max-w-[680px] bg-background p-3 text-foreground" style={{ margin: "0 auto" }}>
        <div className="flex items-start justify-between border-b pb-2">
          <div>
            <div className="font-display text-base font-bold leading-tight">ADECOMEX SRL</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gestión y Logística</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold">Solicitud de Pago por Transferencia</div>
            <div className="text-[10px] text-muted-foreground">Fecha: {fmtLocalDate(s.fecha)}</div>
          </div>
        </div>

        <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Secuencia</div>
          <div className="font-mono text-xl font-bold leading-tight text-primary">{s.secuencia}</div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 rounded-md border p-2">
          <Campo label="Fecha" value={fmtLocalDate(s.fecha)} />
          <Campo label="Categoría" value={s.categoria} />
          <Campo label="Factura de Compra" value={s.factura_compra} />
          <div className="col-span-3">
            <Campo label="Beneficiario" value={s.beneficiario} />
          </div>
          <div className="col-span-3">
            <Campo label="Concepto" value={<span className="whitespace-pre-wrap">{s.concepto}</span>} />
          </div>
          {s.transporte_numero_control ? (
            <div className="col-span-3">
              <Campo label="Solicitud de Transporte vinculada" value={s.transporte_numero_control} />
            </div>
          ) : null}
        </div>

        <div className="mt-2 rounded-md border p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Desglose del pago
          </div>
          <div className="grid grid-cols-2 gap-x-2 text-xs">
            <span className="text-muted-foreground">Monto</span>
            <span className="text-right font-medium">{fmtMoney(Number(s.monto))}</span>
            <span className="text-muted-foreground">Descuento por CxC</span>
            <span className="text-right font-medium text-destructive">-{fmtMoney(descuento)}</span>
            <span className="font-semibold">Neto a Pagar</span>
            <span className="text-right font-bold">{fmtMoney(neto)}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-8 text-center text-[10px] text-muted-foreground">
          <div className="border-t pt-1">Solicitado por</div>
          <div className="border-t pt-1">Autorizado por</div>
        </div>

        <div className="mt-3 border-t pt-1.5 text-center text-[10px] text-muted-foreground">
          ADECOMEX SRL · Documento generado electrónicamente · {s.secuencia}
        </div>
      </div>
    </>
  );
}
