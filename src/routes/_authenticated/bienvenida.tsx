import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import bienvenidaAsset from "@/assets/bienvenida-adecomex-flow-hd.webp";

export const Route = createFileRoute("/_authenticated/bienvenida")({
  head: () => ({
    meta: [
      { title: "Bienvenido — ADECOMEX FLOW" },
      { name: "description", content: "Pantalla de bienvenida de ADECOMEX SRL. Tu aliado en importaciones." },
      { property: "og:title", content: "Bienvenido — ADECOMEX FLOW" },
      { property: "og:description", content: "Toda tu operación de importación, en un solo lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Bienvenida,
});

function Bienvenida() {
  return (
    <div className="relative min-h-full w-full bg-background">
      <img
        src={bienvenidaAsset}
        alt="Bienvenido — ADECOMEX FLOW, tu aliado en importaciones"
        className="absolute inset-0 h-full w-full object-contain"
      />
      <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          Entrar al Panel de Operaciones
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
