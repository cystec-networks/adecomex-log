import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { estadoLabel } from "@/lib/estados-expediente";
import { fmtLocalDate } from "@/lib/dates";
import { FolderKanban, PackageOpen, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_portal/portal/")({
  component: PortalListado,
});

const ESTADO_COLOR: Record<string, string> = {
  digitar: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  presentar: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  verificar: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  facturar: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  despachado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

function PortalListado() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" /> Mis expedientes
        </h1>
        <p className="text-sm text-muted-foreground">Consulta el estado y documentos de tus operaciones.</p>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(expedientes ?? []).map((exp) => (
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
