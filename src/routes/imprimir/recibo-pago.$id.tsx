import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { fmtLocalDate } from "@/lib/dates";

export const Route = createFileRoute("/imprimir/recibo-pago/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recibo de pago quincenal · ADECOMEX SRL" },
      { name: "description", content: "Recibo de pago quincenal imprimible de ADECOMEX SRL." },
      { property: "og:title", content: "Recibo de pago quincenal · ADECOMEX SRL" },
      { property: "og:description", content: "Recibo de pago quincenal imprimible." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImprimirReciboPago,
});

type Recibo = {
  id: string;
  periodo_inicio: string;
  periodo_fin: string;
  salario_quincena: number;
  descuento_prestamo: number;
  afp_monto: number;
  ars_monto: number;
  isr_monto: number;
  otros_descuentos: number;
  otros_descuentos_concepto: string | null;
  neto_pagado: number;
  notas: string | null;
  created_at: string;
  empleados: { nombre: string; cedula: string | null; cargo: string | null } | null;
};

const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print { .rp-no-print { display: none !important; } body { background: #fff; } }
`;

function money(n: number | null | undefined) {
  return `DOP ${Number(n ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ImprimirReciboPago() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Recibo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/recibo-pago/${id}`);
        const json = await res.json();
        setData(res.ok ? (json.recibo as Recibo) : null);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-sm text-muted-foreground">Recibo no encontrado</div>;

  const emp = data.empleados;

  const filas: Array<[string, number, boolean]> = [
    ["Salario quincena", Number(data.salario_quincena), false],
    ["(-) Descuento préstamo", Number(data.descuento_prestamo), true],
    ["(-) AFP", Number(data.afp_monto), true],
    ["(-) ARS", Number(data.ars_monto), true],
    ["(-) ISR", Number(data.isr_monto), true],
    [
      `(-) Otros descuentos${data.otros_descuentos_concepto ? ` — ${data.otros_descuentos_concepto}` : ""}`,
      Number(data.otros_descuentos),
      true,
    ],
  ];

  return (
    <div className="min-h-screen bg-background py-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="mx-auto max-w-[720px] bg-card p-8 text-sm text-foreground">
        <div className="border-b pb-3">
          <div className="font-display text-xl font-bold tracking-tight">ADECOMEX SRL</div>
          <div className="text-xs text-muted-foreground">Recibo de pago quincenal</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div><span className="text-muted-foreground">Empleado: </span><span className="font-medium">{emp?.nombre ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Cédula: </span>{emp?.cedula ?? "—"}</div>
          <div><span className="text-muted-foreground">Cargo: </span>{emp?.cargo ?? "—"}</div>
          <div>
            <span className="text-muted-foreground">Período: </span>
            {fmtLocalDate(data.periodo_inicio)} — {fmtLocalDate(data.periodo_fin)}
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <tbody>
            {filas.map(([label, val, isDesc]) => (
              <tr key={label} className="border-b">
                <td className="py-1.5">{label}</td>
                <td className={`py-1.5 text-right tabular-nums ${isDesc && val > 0 ? "text-destructive" : ""}`}>
                  {money(val)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 text-base font-bold">Neto a Pagar</td>
              <td className="pt-3 text-right text-base font-bold tabular-nums">{money(data.neto_pagado)}</td>
            </tr>
          </tbody>
        </table>

        {data.notas && (
          <div className="mt-4 text-xs">
            <span className="text-muted-foreground">Notas: </span>{data.notas}
          </div>
        )}

        <div className="mt-6 text-xs text-muted-foreground">
          Fecha de generación: {fmtLocalDate(data.created_at)}
        </div>

        <div className="mt-6 border-t pt-2 text-[10px] leading-snug text-muted-foreground">
          Este recibo es un documento interno de referencia, no reemplaza los cálculos oficiales de nómina.
        </div>
      </div>

      <div className="rp-no-print fixed bottom-6 right-6">
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimir / Guardar PDF
        </Button>
      </div>
    </div>
  );
}
