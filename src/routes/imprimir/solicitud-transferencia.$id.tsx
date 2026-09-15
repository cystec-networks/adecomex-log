import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  SolicitudTransferenciaPrintView,
  type SolicitudTransferenciaPrintData,
} from "@/components/solicitud-transferencia-print";

export const Route = createFileRoute("/imprimir/solicitud-transferencia/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Comprobante de pago por transferencia · ADECOMEX SRL" },
      {
        name: "description",
        content: "Comprobante imprimible de la solicitud de pago por transferencia de ADECOMEX SRL.",
      },
      { property: "og:title", content: "Comprobante de pago por transferencia · ADECOMEX SRL" },
      { property: "og:description", content: "Comprobante imprimible de la solicitud de pago por transferencia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImprimirSolicitudTransferencia,
});

function ImprimirSolicitudTransferencia() {
  const { id } = Route.useParams();
  const [data, setData] = useState<SolicitudTransferenciaPrintData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: row } = await supabase
        .from("solicitudes_pago_transferencia")
        .select("*, solicitudes_pago_transporte(numero_control)")
        .eq("id", id)
        .maybeSingle();
      if (row) {
        const rel = (row as any).solicitudes_pago_transporte as { numero_control: string } | null;
        setData({
          secuencia: (row as any).secuencia,
          fecha: (row as any).fecha,
          categoria: (row as any).categoria,
          factura_compra: (row as any).factura_compra,
          beneficiario: (row as any).beneficiario,
          concepto: (row as any).concepto,
          monto: Number((row as any).monto),
          descuento_cxc: (row as any).descuento_cxc,
          transporte_numero_control: rel?.numero_control ?? null,
        });
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-sm text-muted-foreground">Solicitud no encontrada</div>;

  return (
    <div className="min-h-screen bg-background py-6">
      <style dangerouslySetInnerHTML={{ __html: "@media print { .spt-no-print { display: none !important; } }" }} />
      <SolicitudTransferenciaPrintView solicitud={data} />
      <div className="spt-no-print fixed bottom-6 right-6">
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimir / Guardar PDF
        </Button>
      </div>
    </div>
  );
}
