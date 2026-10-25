import { createFileRoute } from "@tanstack/react-router";
import { PermisoForm } from "@/components/permiso-form";

export const Route = createFileRoute("/_authenticated/permisos/$id")({
  head: () => ({ meta: [
    { title: "Editar permiso VUCE | ADECOMEX Flow" },
    { name: "description", content: "Revisa datos, aprobación y documentos del permiso VUCE en ADECOMEX Flow." },
    { property: "og:title", content: "Editar permiso VUCE | ADECOMEX Flow" },
    { property: "og:description", content: "Revisa datos, aprobación y documentos del permiso VUCE en ADECOMEX Flow." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: EditPermiso,
});

function EditPermiso() {
  const { id } = Route.useParams();
  return <PermisoForm mode="edit" id={id} />;
}
