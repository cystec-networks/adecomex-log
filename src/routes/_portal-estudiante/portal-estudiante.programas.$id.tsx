import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtLocalDate, daysFromToday } from "@/lib/dates";
import { ArrowLeft, ExternalLink, BookOpen, Users, Calendar, Award, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_portal-estudiante/portal-estudiante/programas/$id")({
  component: PortalEstudianteProgramaDetalle,
});

const ESTADO_INS_COLOR: Record<string, string> = {
  inscrito: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  en_curso: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  completado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  retirado: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  cancelado: "bg-red-500/15 text-red-700 border-red-500/30",
};
const ESTADO_INS_LABEL: Record<string, string> = {
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

function cuotaBadge(estado: string, fechaVenc: string | null | undefined) {
  if (estado === "pagada") return { cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", label: "Pagada" };
  const dias = fechaVenc ? daysFromToday(fechaVenc) : NaN;
  if (!isNaN(dias) && dias < 0) return { cls: "bg-red-500/15 text-red-700 border-red-500/30", label: "Vencida" };
  if (!isNaN(dias) && dias <= 7) return { cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", label: "Por vencer" };
  return { cls: "bg-slate-500/15 text-slate-700 border-slate-500/30", label: "Pendiente" };
}

function PortalEstudianteProgramaDetalle() {
  const { id } = Route.useParams();

  const { data: inscripcion, isLoading: insLoading } = useQuery({
    queryKey: ["portal-est-inscripcion", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("v_inscripciones_estudiante")
        .select("*")
        .eq("programa_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: programa } = useQuery({
    queryKey: ["portal-est-programa", id],
    enabled: !!inscripcion,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("v_programas_estudiante")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: cuotas } = useQuery({
    queryKey: ["portal-est-cuotas", inscripcion?.id],
    enabled: !!inscripcion?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("v_cuotas_estudiante")
        .select("*")
        .eq("inscripcion_id", inscripcion.id)
        .order("numero_cuota", { ascending: true });
      return data ?? [];
    },
  });

  if (insLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  if (!inscripcion) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Programa no encontrado o sin acceso.
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/portal-estudiante"><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const temario = Array.isArray(programa?.temario) ? programa.temario : [];
  const metodologia = Array.isArray(programa?.metodologia) ? programa.metodologia : [];
  const saldo = Number(inscripcion.monto_total ?? 0) - Number(inscripcion.monto_pagado ?? 0);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/portal-estudiante"><ArrowLeft className="h-4 w-4 mr-1" /> Mis programas</Link>
      </Button>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {TIPO_LABEL[programa?.tipo] ?? programa?.tipo ?? "Programa"}
                {programa?.modalidad ? ` · ${programa.modalidad}` : ""}
              </div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                {programa?.nombre ?? "—"}
              </CardTitle>
              {programa?.descripcion && (
                <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{programa.descripcion}</p>
              )}
            </div>
            <Badge variant="outline" className={ESTADO_INS_COLOR[inscripcion.estado] ?? ""}>
              {ESTADO_INS_LABEL[inscripcion.estado] ?? inscripcion.estado}
            </Badge>
          </div>
        </CardHeader>
        {programa?.enlace_classroom && (
          <CardContent className="pt-0">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href={programa.enlace_classroom} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Ir a Google Classroom
              </a>
            </Button>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Información general</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {programa?.dirigido_a && (
            <div className="flex gap-2">
              <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Dirigido a</div>
                <div className="text-sm">{programa.dirigido_a}</div>
              </div>
            </div>
          )}
          {(programa?.cantidad_encuentros || programa?.horas_por_encuentro) && (
            <div className="flex gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Encuentros</div>
                <div className="text-sm">
                  {programa?.cantidad_encuentros ?? "—"} encuentros
                  {programa?.horas_por_encuentro ? ` · ${programa.horas_por_encuentro} h c/u` : ""}
                </div>
              </div>
            </div>
          )}
          {(programa?.fecha_inicio || programa?.fecha_fin) && (
            <div className="flex gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Fechas</div>
                <div className="text-sm">
                  {fmtLocalDate(programa?.fecha_inicio)} — {fmtLocalDate(programa?.fecha_fin)}
                </div>
              </div>
            </div>
          )}
          {programa?.certificacion && (
            <div className="flex gap-2">
              <Award className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Certificación</div>
                <div className="text-sm">{programa.certificacion}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {temario.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Temario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {temario.map((mod: any, idx: number) => (
              <div key={idx} className="border-l-2 border-primary/40 pl-3">
                <div className="font-medium text-sm">
                  Módulo {mod.numero ?? idx + 1}: {mod.titulo ?? "—"}
                </div>
                {Array.isArray(mod.subtemas) && mod.subtemas.length > 0 && (
                  <ul className="mt-1 list-disc list-inside text-sm text-muted-foreground space-y-0.5">
                    {mod.subtemas.map((s: string, si: number) => (
                      <li key={si}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {metodologia.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Metodología</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm space-y-1">
              {metodologia.map((m: any, i: number) => (
                <li key={i}>{typeof m === "string" ? m : m?.titulo ?? JSON.stringify(m)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mis pagos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 pb-4 mb-4 border-b text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="font-semibold">{fmtMoney(inscripcion.monto_total)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pagado</div>
              <div className="font-semibold text-emerald-700">{fmtMoney(inscripcion.monto_pagado)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Saldo</div>
              <div className={`font-semibold ${saldo > 0 ? "text-red-700" : ""}`}>{fmtMoney(saldo)}</div>
            </div>
          </div>

          {(cuotas?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">
              Este programa no tiene cuotas registradas (pago único).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Descripción</th>
                    <th className="py-2 pr-2 text-right">Monto</th>
                    <th className="py-2 pr-2 text-right">Pagado</th>
                    <th className="py-2 pr-2">Vencimiento</th>
                    <th className="py-2 pr-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(cuotas ?? []).map((c: any) => {
                    const b = cuotaBadge(c.estado, c.fecha_vencimiento);
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-mono">{c.numero_cuota}</td>
                        <td className="py-2 pr-2">{c.descripcion ?? "—"}</td>
                        <td className="py-2 pr-2 text-right">{fmtMoney(c.monto)}</td>
                        <td className="py-2 pr-2 text-right text-emerald-700">{fmtMoney(c.monto_pagado)}</td>
                        <td className="py-2 pr-2">{fmtLocalDate(c.fecha_vencimiento)}</td>
                        <td className="py-2 pr-2">
                          <Badge variant="outline" className={b.cls}>{b.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
