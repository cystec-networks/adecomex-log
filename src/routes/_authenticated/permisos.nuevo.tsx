import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { PermisoForm } from "@/components/permiso-form";

const searchSchema = z.object({
  expediente: z.string().optional(),
  orden: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/permisos/nuevo")({
  head: () => ({ meta: [
    { title: "Nuevo permiso VUCE | ADECOMEX Flow" },
    { name: "description", content: "Registra un permiso VUCE y su Detalle Solicitud para un expediente ADECOMEX." },
    { property: "og:title", content: "Nuevo permiso VUCE | ADECOMEX Flow" },
    { property: "og:description", content: "Registra un permiso VUCE y su Detalle Solicitud para un expediente ADECOMEX." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: searchSchema,
  component: NuevoPermiso,
});

function NuevoPermiso() {
  const { expediente, orden } = useSearch({ from: Route.id });
  return <PermisoForm mode="new" expedienteId={expediente} ordenId={orden} />;
}
