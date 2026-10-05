import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { PermisoForm } from "@/components/permiso-form";

const searchSchema = z.object({
  expediente: z.string().optional(),
  orden: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/permisos/nuevo")({
  head: () => ({ meta: [
    { title: "Nuevo Permiso VUCE | ADECOMEX" },
    { name: "description", content: "Registro de permisos VUCE vinculados a expedientes en ADECOMEX." },
    { property: "og:title", content: "Nuevo Permiso VUCE | ADECOMEX" },
    { property: "og:description", content: "Registro de permisos VUCE vinculados a expedientes en ADECOMEX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: searchSchema,
  component: NuevoPermiso,
});

function NuevoPermiso() {
  const { expediente, orden } = useSearch({ from: Route.id });
  return <PermisoForm mode="new" expedienteId={expediente} ordenId={orden} />;
}
