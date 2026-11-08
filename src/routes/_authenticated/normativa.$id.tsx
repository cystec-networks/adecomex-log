import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { VisorNormativa } from "@/components/normativa/visor-normativa-dialog";
import { paginaValida } from "@/lib/normativa-visor";

const TITULO = "Documento de la Base normativa | ADECOMEX";
const DESCRIPCION = "Lectura del documento normativo en el visor integrado, con búsqueda y navegación por páginas.";

export const Route = createFileRoute("/_authenticated/normativa/$id")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { pagina?: number } => {
    const p = paginaValida(s.pagina);
    return p ? { pagina: p } : {};
  },
  component: PaginaVisorNormativa,
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRIPCION },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRIPCION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PaginaVisorNormativa() {
  const { id } = Route.useParams();
  const { pagina } = Route.useSearch();
  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-2">
      <div className="flex items-center gap-2">
        <Link
          to="/admin/base-normativa"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Base normativa
        </Link>
      </div>
      <VisorNormativa
        key={id}
        documentoId={id}
        pagina={pagina ?? null}
        className="flex-1 overflow-hidden rounded-lg border bg-card"
      />
    </div>
  );
}
