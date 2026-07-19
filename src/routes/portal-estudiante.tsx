import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/portal-estudiante")({
  ssr: false,
  component: () => (
    <div className="min-h-screen grid place-items-center p-8 text-center">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold">Portal de estudiantes</h1>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
      </div>
    </div>
  ),
});
