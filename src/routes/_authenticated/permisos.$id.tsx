import { createFileRoute } from "@tanstack/react-router";
import { PermisoForm } from "@/components/permiso-form";

export const Route = createFileRoute("/_authenticated/permisos/$id")({
  head: () => ({ meta: [
    { title: "Detalle de Permiso VUCE | ADECOMEX" },
    { name: "description", content: "Consulta y actualización de permisos VUCE en ADECOMEX." },
    { property: "og:title", content: "Detalle de Permiso VUCE | ADECOMEX" },
    { property: "og:description", content: "Consulta y actualización de permisos VUCE en ADECOMEX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: EditPermiso,
});

function EditPermiso() {
  const { id } = Route.useParams();
  return <PermisoForm mode="edit" id={id} />;
}
