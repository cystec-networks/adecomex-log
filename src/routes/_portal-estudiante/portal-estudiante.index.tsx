import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtLocalDate } from "@/lib/dates";
import { GraduationCap, BookOpen, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_portal-estudiante/portal-estudiante/")({
  component: PortalEstudianteListado,
});

const ESTADO_COLOR: Record<string, string> = {
  inscrito: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  en_curso: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  completado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  retirado: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  cancelado: "bg-red-500/15 text-red-700 border-red-500/30",
};

const ESTADO_LABEL: Record<string, string> = {
  inscrito: "Inscrito",
  en_curso: "En curso",
  completado: "Completado",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

const TIPO_LABEL: Record<string, string> = {
  diplomado: "Diplomado",
  curso: "Curso",
  taller: "Taller",
};

const fmtMoney = (n: number | null | undefined) =>
  `RD$ ${Number(n ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PortalEstudianteListado() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-estudiante-inscripciones"],
    queryFn: async () => {
      const { data: inscripciones, error } = await (supabase as any)
        .from("v_inscripciones_estudiante")
        .select("id, programa_id, estado, monto_total, monto_pagado, fecha_inscripcion, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = inscripciones ?? [];
      const programaIds = Array.from(new Set(list.map((i: any) => i.programa_id).filter(Boolean)));
      let programasById: Record<string, any> = {};
      if (programaIds.length > 0) {
        const { data: programas } = await (supabase as any)
          .from("v_programas_estudiante")
          .select("id, nombre, tipo, modalidad")
          .in("id", programaIds);
        programasById = Object.fromEntries((programas ?? []).map((p: any) => [p.id, p]));
      }
      return list.map((i: any) => ({ ...i, programa: programasById[i.programa_id] }));
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" /> Mis programas
        </h1>
        <p className="text-sm text-muted-foreground">Consulta tus inscripciones, contenido y estado de pagos.</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <BookOpen className="h-10 w-10 opacity-40" />
            <div className="font-medium text-foreground">Aún no tienes inscripciones activas</div>
            <div className="text-sm">Cuando la Academia registre una inscripción a tu nombre, aparecerá aquí.</div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((ins: any) => {
          const saldo = Number(ins.monto_total ?? 0) - Number(ins.monto_pagado ?? 0);
          return (
            <Link
              key={ins.id}
              to="/portal-estudiante/programas/$id"
              params={{ id: ins.programa_id }}
              className="block"
            >
              <Card className="hover:border-primary/50 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{ins.programa?.nombre ?? "Programa"}</div>
                      <div className="text-xs text-muted-foreground">
                        {TIPO_LABEL[ins.programa?.tipo] ?? ins.programa?.tipo ?? "—"}
                        {ins.programa?.modalidad ? ` · ${ins.programa.modalidad}` : ""}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="outline" className={ESTADO_COLOR[ins.estado] ?? ""}>
                      {ESTADO_LABEL[ins.estado] ?? ins.estado}
                    </Badge>
                    <div className="text-[11px] text-muted-foreground">
                      Inscrito: {fmtLocalDate(ins.fecha_inscripcion)}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
                    <div>
                      <div className="text-muted-foreground">Total</div>
                      <div className="font-medium">{fmtMoney(ins.monto_total)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Pagado</div>
                      <div className="font-medium text-emerald-700">{fmtMoney(ins.monto_pagado)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Saldo</div>
                      <div className={`font-medium ${saldo > 0 ? "text-red-700" : ""}`}>{fmtMoney(saldo)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
