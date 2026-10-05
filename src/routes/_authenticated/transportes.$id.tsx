import { createFileRoute } from "@tanstack/react-router";
import { TransporteForm } from "@/components/transporte-form";

export const Route = createFileRoute("/_authenticated/transportes/$id")({
  head: () => ({ meta: [
    { title: "Detalle de Transporte | ADECOMEX" },
    { name: "description", content: "Consulta y actualización de viajes en ADECOMEX." },
    { property: "og:title", content: "Detalle de Transporte | ADECOMEX" },
    { property: "og:description", content: "Consulta y actualización de viajes en ADECOMEX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: EditTransporte,
});

function EditTransporte() {
  const { id } = Route.useParams();
  return <TransporteForm mode="edit" id={id} />;
}
