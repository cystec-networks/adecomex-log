import { createFileRoute } from "@tanstack/react-router";
import { PermisoForm } from "@/components/permiso-form";

export const Route = createFileRoute("/_authenticated/permisos/$id")({
  component: EditPermiso,
});

function EditPermiso() {
  const { id } = Route.useParams();
  return <PermisoForm mode="edit" id={id} />;
}
