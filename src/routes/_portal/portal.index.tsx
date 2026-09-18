import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_portal/portal/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal/bienvenida" });
  },
  component: () => null,
});
