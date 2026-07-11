import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { PermisoForm } from "@/components/permiso-form";

const searchSchema = z.object({ expediente: z.string().optional() });

export const Route = createFileRoute("/_authenticated/permisos/nuevo")({
  validateSearch: searchSchema,
  component: NuevoPermiso,
});

function NuevoPermiso() {
  const { expediente } = useSearch({ from: Route.id });
  return <PermisoForm mode="new" expedienteId={expediente} />;
}
