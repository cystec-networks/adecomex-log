import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { TransporteForm } from "@/components/transporte-form";

const searchSchema = z.object({ expediente: z.string().optional(), control: z.string().optional() });

export const Route = createFileRoute("/_authenticated/transportes/nuevo")({
  validateSearch: searchSchema,
  component: NuevoTransporte,
});

function NuevoTransporte() {
  const { expediente, control } = useSearch({ from: Route.id });
  return <TransporteForm mode="new" expedienteId={expediente} controlInicial={control} />
}
