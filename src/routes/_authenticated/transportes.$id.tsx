import { createFileRoute } from "@tanstack/react-router";
import { TransporteForm } from "@/components/transporte-form";

export const Route = createFileRoute("/_authenticated/transportes/$id")({
  component: EditTransporte,
});

function EditTransporte() {
  const { id } = Route.useParams();
  return <TransporteForm mode="edit" id={id} />;
}
