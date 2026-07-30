import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SolicitudPagoPrintView, type SolicitudPagoPrintData } from "@/components/solicitud-pago-print";

export const Route = createFileRoute("/imprimir/solicitud-pago/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Comprobante de solicitud de pago · ADECOMEX SRL" },
      {
        name: "description",
        content: "Comprobante imprimible de la solicitud de pago de transporte de ADECOMEX SRL.",
      },
      { property: "og:title", content: "Comprobante de solicitud de pago · ADECOMEX SRL" },
      {
        property: "og:description",
        content: "Comprobante imprimible de la solicitud de pago de transporte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImprimirSolicitudPago,
});

function ImprimirSolicitudPago() {
  const { id } = Route.useParams();
  const [data, setData] = useState<SolicitudPagoPrintData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/solicitud-pago-transporte/${id}`);
        const json = await res.json();
        setData(res.ok ? (json.solicitud as SolicitudPagoPrintData) : null);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Solicitud no encontrada</div>;
  }

  return (
    <div className="min-h-screen bg-background py-6">
      <style dangerouslySetInnerHTML={{ __html: "@media print { .spt-no-print { display: none !important; } }" }} />
      <SolicitudPagoPrintView solicitud={data} />
      <div className="spt-no-print fixed bottom-6 right-6">
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimir / Guardar PDF
        </Button>
      </div>
    </div>
  );
}
