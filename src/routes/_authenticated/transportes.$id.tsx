import { createFileRoute } from "@tanstack/react-router";
import { TransporteForm } from "@/components/transporte-form";

export const Route = createFileRoute("/_authenticated/transportes/$id")({
  head: () => ({ meta: [
    { title: "Transporte y facturas e-CF | ADECOMEX" },
    { name: "description", content: "Detalle del Transporte, costos y facturas e-CF vinculadas al cliente." },
    { property: "og:title", content: "Transporte y facturas e-CF | ADECOMEX" },
    { property: "og:description", content: "Consulta las facturas y el total facturado de cada Transporte." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: EditTransporte,
});

function EditTransporte() {
  const { id } = Route.useParams();
  return <TransporteForm mode="edit" id={id} />;
}
