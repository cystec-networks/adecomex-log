import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Gauge, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUNCIONES_IA, nombreFuncionIa, presupuestoBajo, type FuncionIa } from "@/lib/ia-consumo";

const TITULO = "Consumo de IA | ADECOMEX";
const DESCRIPCION = "Créditos de IA estimados por función, día y modelo, con límites diarios y presupuesto mensual.";

export const Route = createFileRoute("/_authenticated/admin/consumo-ia")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: ConsumoIa,
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

type Periodo = "hoy" | "7" | "mes" | "30";
const hoySD = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
function rango(p: Periodo): { desde: string; hasta: string } {
  const hasta = hoySD();
  const d = new Date(`${hasta}T12:00:00Z`);
  if (p === "hoy") return { desde: hasta, hasta };
  if (p === "mes") return { desde: `${hasta.slice(0, 8)}01`, hasta };
  d.setUTCDate(d.getUTCDate() - (Number(p) - 1));
  return { desde: d.toISOString().slice(0, 10), hasta };
}
const creditos = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
const entero = (n: number) => n.toLocaleString("es-DO");
const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-DO", { day: "2-digit", month: "short", timeZone: "UTC" });

type Fila = { dia: string; funcion: string; modelo: string; llamadas: number; reutilizadas: number; via_texto: number; tokens_entrada: number; tokens_salida: number; costo: number };

// Valores vacíos estables: un [] nuevo en cada render reiniciaría los borradores en bucle.
const SIN_FILAS: Fila[] = [];
const SIN_LIMITES: Array<{ funcion: string; limite_diario: number | null }> = [];

function ConsumoIa() {
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const { desde, hasta } = rango(periodo);

  const { data: filas = SIN_FILAS, isLoading } = useQuery({
    queryKey: ["consumo-ia", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resumen_consumo_ia", { p_desde: desde, p_hasta: hasta });
      if (error) throw error;
      return (data ?? []).map((f) => ({ ...f, llamadas: Number(f.llamadas), reutilizadas: Number(f.reutilizadas), via_texto: Number(f.via_texto), tokens_entrada: Number(f.tokens_entrada), tokens_salida: Number(f.tokens_salida), costo: Number(f.costo) })) as Fila[];
    },
  });
  const { data: limites = SIN_LIMITES } = useQuery({
    queryKey: ["ia-limites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ia_limites").select("funcion, limite_diario");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: estado } = useQuery({
    queryKey: ["ia-presupuesto"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estado_presupuesto_ia");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const totales = useMemo(() => filas.reduce((t, f) => ({ costo: t.costo + f.costo, llamadas: t.llamadas + f.llamadas, reutilizadas: t.reutilizadas + f.reutilizadas }), { costo: 0, llamadas: 0, reutilizadas: 0 }), [filas]);
  const porFuncion = useMemo(() => {
    const m = new Map<string, { funcion: string; llamadas: number; reutilizadas: number; via_texto: number; tokens: number; costo: number; modelos: Set<string> }>();
    for (const k of Object.keys(FUNCIONES_IA)) m.set(k, { funcion: k, llamadas: 0, reutilizadas: 0, via_texto: 0, tokens: 0, costo: 0, modelos: new Set() });
    for (const f of filas) {
      const r = m.get(f.funcion) ?? { funcion: f.funcion, llamadas: 0, reutilizadas: 0, via_texto: 0, tokens: 0, costo: 0, modelos: new Set<string>() };
      r.llamadas += f.llamadas; r.reutilizadas += f.reutilizadas; r.via_texto += f.via_texto; r.tokens += f.tokens_entrada + f.tokens_salida; r.costo += f.costo; r.modelos.add(f.modelo);
      m.set(f.funcion, r);
    }
    return [...m.values()].sort((a, b) => b.costo - a.costo || b.llamadas - a.llamadas);
  }, [filas]);
  const porDia = useMemo(() => {
    const m = new Map<string, { llamadas: number; costo: number }>();
    for (const f of filas) { const r = m.get(f.dia) ?? { llamadas: 0, costo: 0 }; r.llamadas += f.llamadas; r.costo += f.costo; m.set(f.dia, r); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filas]);
  const maxDia = Math.max(0.0001, ...porDia.map(([, r]) => r.costo));

  const [borradorLimites, setBorradorLimites] = useState<Record<string, string>>({});
  useEffect(() => {
    setBorradorLimites(Object.fromEntries(limites.map((l) => [l.funcion, l.limite_diario != null ? String(l.limite_diario) : ""])));
  }, [limites]);
  const guardarLimite = useMutation({
    mutationFn: async (funcion: string) => {
      const texto = (borradorLimites[funcion] ?? "").trim().replace(",", ".");
      const valor = texto === "" ? null : Number(texto);
      if (valor != null && (!Number.isFinite(valor) || valor <= 0)) throw new Error("Escribe un límite mayor que 0 o déjalo vacío");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("ia_limites").upsert({ funcion, limite_diario: valor, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null }, { onConflict: "funcion" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Límite guardado"); qc.invalidateQueries({ queryKey: ["ia-limites"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [presupuesto, setPresupuesto] = useState("");
  useEffect(() => { setPresupuesto(estado?.presupuesto != null ? String(estado.presupuesto) : ""); }, [estado?.presupuesto]);
  const guardarPresupuesto = useMutation({
    mutationFn: async () => {
      const texto = presupuesto.trim().replace(",", ".");
      const valor = texto === "" ? null : Number(texto);
      if (valor != null && (!Number.isFinite(valor) || valor <= 0)) throw new Error("Escribe un presupuesto mayor que 0 o déjalo vacío");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("ia_configuracion").upsert({ singleton: true, presupuesto_mensual: valor, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null }, { onConflict: "singleton" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Presupuesto guardado"); qc.invalidateQueries({ queryKey: ["ia-presupuesto"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const limiteDe = (f: string) => limites.find((l) => l.funcion === f)?.limite_diario;
  const restante = estado?.restante_pct != null ? Number(estado.restante_pct) : null;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold"><Gauge className="h-4 w-4" /> Consumo de IA</h1>
          <p className="text-[12px] text-muted-foreground">Créditos estimados con la tarifa de cada modelo; el cobro real de Lovable puede variar ligeramente.</p>
        </div>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-44 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hoy">Hoy</SelectItem>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="mes">Mes actual</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {estado?.creditos_agotados_at && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{estado.creditos_agotados_mensaje ?? "Créditos de IA agotados."} Las lecturas con IA están detenidas hasta que se añadan créditos al espacio de trabajo.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="Créditos estimados" valor={creditos(totales.costo)} />
        <Kpi titulo="Llamadas a IA" valor={entero(totales.llamadas)} />
        <Kpi titulo="Resultados reutilizados" valor={entero(totales.reutilizadas)} nota="sin costo" />
        <Kpi titulo="Promedio por llamada" valor={totales.llamadas ? creditos(totales.costo / totales.llamadas) : "—"} nota="créditos" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px]">Presupuesto mensual</CardTitle>
          <CardDescription className="text-[12px]">Cuando quede menos del 20 %, el Panel de operaciones muestra una alerta. Déjalo vacío para no usar presupuesto.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-[13px]">
          <Input value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} inputMode="decimal" placeholder="Créditos al mes" className="w-40" />
          <Button size="sm" onClick={() => guardarPresupuesto.mutate()} disabled={guardarPresupuesto.isPending}><Save className="mr-1 h-4 w-4" /> Guardar</Button>
          <span className="text-muted-foreground">Gastado este mes: <strong className="text-foreground">{creditos(Number(estado?.gastado_mes ?? 0))}</strong></span>
          {restante != null && <Badge variant={presupuestoBajo(restante) ? "destructive" : "secondary"}>{restante <= 0 ? "Presupuesto superado" : `Queda ${restante} %`}</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px]">Por función</CardTitle>
          <CardDescription className="text-[12px]">Límite diario en créditos: al alcanzarlo, esa función deja de usar IA hasta el día siguiente (los correos quedan para reintento). Vacío = sin límite.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12px] [&_td]:px-2 [&_th]:whitespace-nowrap [&_th]:px-2">
            <thead className="text-left text-[11px] uppercase text-muted-foreground">
              <tr><th className="py-1.5">Función</th><th className="text-right">Llamadas</th><th className="text-right">Reutilizadas</th><th className="text-right" title="Clasificaciones hechas con el texto del PDF en lugar de la imagen">Por texto</th><th className="text-right">Tokens</th><th className="text-right">Créditos</th><th className="pl-3">Modelo</th><th className="pl-3">Límite diario</th></tr>
            </thead>
            <tbody className="divide-y">
              {porFuncion.map((r) => (
                <tr key={r.funcion}>
                  <td className="py-1.5 pr-2">{nombreFuncionIa(r.funcion)}</td>
                  <td className="text-right tabular-nums">{entero(r.llamadas)}</td>
                  <td className="text-right tabular-nums">{entero(r.reutilizadas)}</td>
                  <td className="text-right tabular-nums">{entero(r.via_texto)}</td>
                  <td className="text-right tabular-nums">{entero(r.tokens)}</td>
                  <td className="text-right font-medium tabular-nums">{creditos(r.costo)}</td>
                  <td className="max-w-[12rem] truncate pl-3 text-muted-foreground" title={[...r.modelos].join(", ")}>{[...r.modelos].join(", ") || "—"}</td>
                  <td className="pl-3">
                    {r.funcion in FUNCIONES_IA ? (
                      <div className="flex items-center gap-1">
                        <Input value={borradorLimites[r.funcion] ?? ""} onChange={(e) => setBorradorLimites((b) => ({ ...b, [r.funcion]: e.target.value }))} inputMode="decimal" placeholder="Sin límite" className="h-7 w-24 text-[12px]" aria-label={`Límite diario de ${nombreFuncionIa(r.funcion)}`} />
                        {(borradorLimites[r.funcion] ?? "") !== (limiteDe(r.funcion) != null ? String(limiteDe(r.funcion)) : "") && (
                          <Button size="icon-sm" variant="ghost" onClick={() => guardarLimite.mutate(r.funcion as FuncionIa)} aria-label="Guardar límite"><Save className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading && <p className="py-2 text-[12px] text-muted-foreground">Cargando…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[14px]">Por día</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {porDia.length === 0 ? <p className="text-[12px] text-muted-foreground">Sin consumo registrado en el período.</p> : porDia.map(([dia, r]) => (
            <div key={dia} className="flex items-center gap-3 text-[12px]">
              <span className="w-16 shrink-0 text-muted-foreground">{fecha(dia)}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-primary" style={{ width: `${Math.max(2, (100 * r.costo) / maxDia)}%` }} /></div>
              <span className="w-24 shrink-0 text-right tabular-nums">{creditos(r.costo)}</span>
              <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">{entero(r.llamadas)} llam.</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase text-muted-foreground">{titulo}</p>
        <p className="text-[16px] font-semibold tabular-nums">{valor}</p>
        {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}
