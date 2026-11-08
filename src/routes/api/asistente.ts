import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/asistente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { manejarAsistente } = await import("@/lib/asistente-virtual.server");
        return manejarAsistente(request);
      },
    },
  },
});
