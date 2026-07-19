import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { estadoLabel } from "@/lib/estados-expediente";
import { fmtLocalDate } from "@/lib/dates";
import { FolderKanban, PackageOpen, ChevronRight, Search } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_portal/portal/")({
  component: PortalListado,
});

const ESTADO_COLOR: Record<string, string> = {
  digitar: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  en_transito: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  presentar: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  verificar: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  facturar: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  despachado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  entregado: "bg-teal-500/15 text-teal-700 border-teal-500/30",
};

function normalizeSearch(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function PortalListado() {
  const navigate = useNavigate({ from: "/_portal/portal" });
  const [query, setQuery] = useState("");

  const { data: expedientes, isLoading } = useQuery({
    queryKey: ["portal-expedientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_expedientes_cliente")
        .select("id, numero, bl_awb, estado, created_at, fecha_compromiso")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const normalizedQuery = normalizeSearch(query);

  const filtered = normalizedQuery
    ? (expedientes ?? []).filter((exp) => {
        const normNum = normalizeSearch(exp.numero);
        const normBl = normalizeSearch(exp.bl_awb);
        return normNum.includes(normalizedQuery) || normBl.includes(normalizedQuery);
      })
    : (expedientes ?? []);

  const handleSearch = (value: string) => {
    setQuery(value);
    const normalized = normalizeSearch(value);
    if (!normalized || !expedientes?.length) return;

    const exactMatches = expedientes.filter((exp) => {
      const normNum = normalizeSearch(exp.numero);
      const normBl = normalizeSearch(exp.bl_awb);
      return normNum === normalized || normBl === normalized;
    });

    if (exactMatches.length === 1) {
      navigate({
        to: "/portal/expedientes/$id",
        params: { id: exactMatches[0].id! },
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" /> Mis expedientes
        </h1>
        <p className="text-sm text-muted-foreground">Consulta el estado y documentos de tus operaciones.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Busca por número de expediente o BL/AWB..."
          className="pl-12 pr-4 py-5 text-lg w-full"
          aria-label="Buscar expediente por número o BL/AWB"
        />
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}

      {!isLoading && (expedientes?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <PackageOpen className="h-10 w-10 opacity-40" />
            <div className="font-medium text-foreground">Aún no tienes expedientes activos</div>
            <div className="text-sm">Cuando ADECOMEX inicie una operación para ti, aparecerá aquí.</div>
          </CardContent>
        </Card>
      )}

      {!isLoading && query && filtered.length === 0 && (expedientes?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <div className="font-medium text-foreground">No se encontró ningún expediente con ese número o BL/AWB</div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((exp) => (
          <Link
            key={exp.id!}
            to="/portal/expedientes/$id"
            params={{ id: exp.id! }}
            className="block"
          >
            <Card className="hover:border-primary/50 hover:shadow-sm transition-all h-full">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold truncate">{exp.numero ?? "—"}</div>
                    {exp.bl_awb && (
                      <div className="text-xs text-muted-foreground truncate">BL/AWB: {exp.bl_awb}</div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Badge variant="outline" className={ESTADO_COLOR[exp.estado ?? ""] ?? ""}>
                    {estadoLabel(exp.estado)}
                  </Badge>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtLocalDate(exp.created_at)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
