import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { REMINDER_CONFIG } from "./reminder-config";

export type ReminderSeverity = "critica" | "alta" | "media";
export type ReminderKind =
  | "solicitud_sin_convertir"
  | "expediente_inactivo"
  | "eta_proximo"
  | "permiso_por_vencer"
  | "permiso_vencido"
  | "transporte_retrasado"
  | "hito_proximo"
  | "hito_atrasado"
  | "logistica_eta_vencida"
  | "logistica_sin_documentos"
  | "plazo_presentacion";

export type Reminder = {
  id: string; // clave única `${kind}:${entidad_id}`
  kind: ReminderKind;
  severity: ReminderSeverity;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
};

const DISMISSED_KEY = "adecomex:reminders:dismissed";

const DISMISSED_QK = ["recordatorios-descartados"] as const;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Migra una sola vez lo descartado en localStorage hacia la tabla (por usuario).
async function migrateLocalStorageDismissed(userId: string) {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(DISMISSED_KEY);
  if (!raw) return;
  try {
    const ids = (JSON.parse(raw) as string[]).filter((s) => typeof s === "string" && s.length > 0);
    if (ids.length > 0) {
      await supabase
        .from("recordatorios_descartados")
        .upsert(ids.map((reminder_id) => ({ user_id: userId, reminder_id })), {
          onConflict: "user_id,reminder_id",
          ignoreDuplicates: true,
        });
    }
  } catch {
    // JSON corrupto: igual se limpia abajo.
  }
  localStorage.removeItem(DISMISSED_KEY);
}

export function useDismissedReminders() {
  const qc = useQueryClient();
  const migrated = useRef(false);

  const { data: dismissedRows } = useQuery({
    queryKey: DISMISSED_QK,
    queryFn: async () => {
      const userId = await currentUserId();
      if (userId && !migrated.current) {
        migrated.current = true;
        await migrateLocalStorageDismissed(userId);
      }
      return (await supabase.from("recordatorios_descartados").select("reminder_id")).data ?? [];
    },
  });

  const dismissed = new Set((dismissedRows ?? []).map((r) => r.reminder_id));

  const dismissMut = useMutation({
    mutationFn: async (id: string) => {
      const userId = await currentUserId();
      if (!userId) return;
      await supabase
        .from("recordatorios_descartados")
        .upsert({ user_id: userId, reminder_id: id }, { onConflict: "user_id,reminder_id", ignoreDuplicates: true });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DISMISSED_QK }),
  });

  const clearAllMut = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      if (!userId) return;
      await supabase.from("recordatorios_descartados").delete().eq("user_id", userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DISMISSED_QK }),
  });

  return {
    dismissed,
    dismiss: (id: string) => dismissMut.mutate(id),
    clearAll: () => clearAllMut.mutate(),
  };
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// Parsea 'YYYY-MM-DD' como fecha local para evitar el desfase UTC de un día.
import { parseLocalDate } from "@/lib/dates";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function useReminders() {
  const query = useQuery({
    queryKey: ["reminders"],
    queryFn: async (): Promise<Reminder[]> => {
      const cfg = REMINDER_CONFIG;
      const now = new Date();
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const solLimite = new Date(today); solLimite.setDate(solLimite.getDate() - cfg.solicitudSinConvertirDias);
      const expLimite = new Date(today); expLimite.setDate(expLimite.getDate() - cfg.expedienteInactivoDias);
      const permLimite = new Date(today); permLimite.setDate(permLimite.getDate() + cfg.permisoPorVencerDias);
      const etaLimite = new Date(today); etaLimite.setDate(etaLimite.getDate() + cfg.etaProximoDias);
      const hitoLimite = new Date(today); hitoLimite.setDate(hitoLimite.getDate() + 3);
      const traLimite = new Date(today); traLimite.setDate(traLimite.getDate() - cfg.transporteRetrasadoDias);

      const [sol, exp, per, tra, hit, logi, emb, pres] = await Promise.all([
        supabase
          .from("solicitudes")
          .select("id,numero,estado,created_at, cliente:clientes(nombre)")
          .is("eliminado_en", null)
          .in("estado", ["recibida", "en_revision", "aprobada"])
          .lte("created_at", solLimite.toISOString())
          .order("created_at", { ascending: true })
          .limit(200),
        supabase
          .from("expedientes")
          .select("id,numero,estado,updated_at,fecha_compromiso, cliente:clientes(nombre)")
          .is("eliminado_en", null)
          .neq("estado", "despachado")
          .or(`fecha_compromiso.lte.${isoDay(etaLimite)},updated_at.lte.${expLimite.toISOString()}`)
          .limit(300),
        supabase
          .from("permisos")
          .select("id,numero,estado,fecha_vencimiento")
          .is("eliminado_en", null)
          .in("estado", ["solicitado", "en_tramite"])
          .not("fecha_vencimiento", "is", null)
          .lte("fecha_vencimiento", isoDay(permLimite))
          .limit(200),
        supabase
          .from("transportes")
          .select("id,numero_viaje,estado,eta")
          .is("eliminado_en", null)
          .neq("estado", "entregado")
          .not("eta", "is", null)
          .lte("eta", isoDay(traLimite))
          .limit(200),
        supabase
          .from("expediente_hitos")
          .select("id,expediente_id,estado,fecha_programada,hito_codigo, catalogo_hitos(nombre), expedientes!inner(numero,eliminado_en)")
          .in("estado", ["pendiente", "en_curso"])
          .not("fecha_programada", "is", null)
          .lte("fecha_programada", isoDay(hitoLimite))
          .limit(300),
        supabase
          .from("operaciones_logistica")
          .select("id,numero,estado,eta, clientes(nombre)")
          .is("eliminado_en", null)
          .not("estado", "in", "(arribo,completada,cancelada)")
          .not("eta", "is", null)
          .lt("eta", isoDay(today))
          .limit(200),
        supabase
          .from("operacion_logistica_etapas")
          .select("operacion_logistica_id, operaciones_logistica!inner(id,numero,eliminado_en)")
          .eq("etapa_codigo", "embarque")
          .eq("estado", "completada")
          .limit(300),
        supabase
          .from("expedientes")
          .select("id,numero,estado,fecha_llegada_real, cliente:clientes(nombre)")
          .is("eliminado_en", null)
          .not("fecha_llegada_real", "is", null)
          .not("estado", "in", "(despachado,entregado,facturar)")
          .limit(300),
      ]);

      // Operaciones con etapa "Embarque" completada y sin documentos cargados.
      const opsEmbarcadas = (emb.data ?? []).filter((r: any) => !r.operaciones_logistica?.eliminado_en);
      let opsSinDocs: any[] = [];
      if (opsEmbarcadas.length) {
        const ids = opsEmbarcadas.map((r: any) => r.operacion_logistica_id);
        const { data: docs } = await supabase
          .from("logistica_documentos")
          .select("operacion_logistica_id")
          .in("operacion_logistica_id", ids);
        const conDocs = new Set((docs ?? []).map((d: any) => d.operacion_logistica_id));
        opsSinDocs = opsEmbarcadas.filter((r: any) => !conDocs.has(r.operacion_logistica_id));
      }


      const out: Reminder[] = [];


      // Solicitudes sin convertir
      for (const s of sol.data ?? []) {
        if (s.estado === "convertida" || s.estado === "rechazada") continue;
        const age = daysBetween(now, new Date(s.created_at));
        if (age >= cfg.solicitudSinConvertirDias) {
          out.push({
            id: `solicitud_sin_convertir:${s.id}`,
            kind: "solicitud_sin_convertir",
            severity: age >= cfg.solicitudSinConvertirDias * 2 ? "alta" : "media",
            title: `Solicitud ${s.numero ?? s.id.slice(0, 8)} sin convertir`,
            detail: `${(s as any).cliente?.nombre ?? "Sin cliente"} · ${age} días sin actividad`,
            href: `/solicitudes/${s.id}`,
            createdAt: s.created_at,
          });
        }
      }

      // Expedientes: ETA próximo / inactividad
      for (const e of exp.data ?? []) {
        if (e.estado === "despachado") continue;
        if (e.fecha_compromiso) {
          const eta = parseLocalDate(e.fecha_compromiso);
          const dias = daysBetween(eta, today);
          if (dias < 0) {
            out.push({
              id: `eta_proximo:${e.id}`,
              kind: "eta_proximo",
              severity: "critica",
              title: `Expediente ${e.numero} atrasado`,
              detail: `${(e as any).cliente?.nombre ?? ""} · ETA vencida hace ${Math.abs(dias)} días`,
              href: `/expedientes/${e.id}`,
              createdAt: e.updated_at,
            });
          } else if (dias <= cfg.etaProximoDias) {
            out.push({
              id: `eta_proximo:${e.id}`,
              kind: "eta_proximo",
              severity: dias <= 1 ? "alta" : "media",
              title: `Expediente ${e.numero} · ETA en ${dias} días`,
              detail: `${(e as any).cliente?.nombre ?? ""}`,
              href: `/expedientes/${e.id}`,
              createdAt: e.updated_at,
            });
          }
        }
        const inact = daysBetween(now, new Date(e.updated_at));
        if (inact >= cfg.expedienteInactivoDias) {
          out.push({
            id: `expediente_inactivo:${e.id}`,
            kind: "expediente_inactivo",
            severity: "media",
            title: `Expediente ${e.numero} sin actividad`,
            detail: `${inact} días sin cambios · estado ${e.estado}`,
            href: `/expedientes/${e.id}`,
            createdAt: e.updated_at,
          });
        }
      }

      // Permisos por vencer / vencidos
      for (const p of per.data ?? []) {
        if (!p.fecha_vencimiento) continue;
        if (p.estado === "rechazado" || p.estado === "vencido") continue;
        const dias = daysBetween(parseLocalDate(p.fecha_vencimiento), today);
        if (dias < 0) {
          out.push({
            id: `permiso_vencido:${p.id}`,
            kind: "permiso_vencido",
            severity: "critica",
            title: `Permiso VUCE ${p.numero} vencido`,
            detail: `Venció hace ${Math.abs(dias)} días`,
            href: `/permisos/${p.id}`,
            createdAt: p.fecha_vencimiento,
          });
        } else if (dias <= cfg.permisoPorVencerDias) {
          out.push({
            id: `permiso_por_vencer:${p.id}`,
            kind: "permiso_por_vencer",
            severity: dias <= 5 ? "alta" : "media",
            title: `Permiso VUCE ${p.numero} por vencer`,
            detail: `Vence en ${dias} días`,
            href: `/permisos/${p.id}`,
            createdAt: p.fecha_vencimiento,
          });
        }
      }

      // Transportes retrasados
      for (const t of tra.data ?? []) {
        if (t.estado === "entregado") continue;
        if (!t.eta) continue;
        const dias = daysBetween(today, parseLocalDate(t.eta));
        if (dias >= cfg.transporteRetrasadoDias) {
          out.push({
            id: `transporte_retrasado:${t.id}`,
            kind: "transporte_retrasado",
            severity: dias > 3 ? "critica" : "alta",
            title: `Transporte ${t.numero_viaje} retrasado`,
            detail: `ETA vencida hace ${dias} días`,
            href: `/transportes/${t.id}`,
            createdAt: t.eta,
          });
        }
      }

      // Hitos de despacho (próximos / atrasados)
      const HITO_CRITICO = "verificacion_mercancia_puerto";
      for (const h of (hit.data ?? []) as any[]) {
        if (h.expedientes?.eliminado_en) continue;
        if (!h.fecha_programada) continue;
        const dias = daysBetween(parseLocalDate(h.fecha_programada), today);
        const nombre = h.catalogo_hitos?.nombre ?? h.hito_codigo;
        const numExp = h.expedientes?.numero ?? "";
        const esCritico = h.hito_codigo === HITO_CRITICO;
        // dias > 0 = futuro, dias < 0 = atrasado, dias === 0 = hoy.
        // Hito crítico: alerta desde el mismo día. Otros: solo cuando vencido.
        const atrasadoDias = -dias; // positivo cuando ya venció
        if (dias < 0 || (esCritico && dias === 0)) {
          out.push({
            id: `hito_atrasado:${h.id}`,
            kind: "hito_atrasado",
            severity: "critica",
            title: esCritico
              ? `⚠️ CRÍTICO · ${nombre}${dias === 0 ? " (hoy)" : ""}`
              : `Hito atrasado · ${nombre}`,
            detail: esCritico
              ? `Exp. ${numExp} · ${dias === 0 ? "vence hoy — riesgo de cargos por demora en puerto" : `vencido hace ${atrasadoDias} días — cargos por demora activos`}`
              : `Exp. ${numExp} · vencido hace ${atrasadoDias} días`,
            href: `/expedientes/${h.expediente_id}`,
            createdAt: h.fecha_programada,
          });
        } else if (dias > 0 && dias <= 3) {
          out.push({
            id: `hito_proximo:${h.id}`,
            kind: "hito_proximo",
            severity: esCritico ? "critica" : dias <= 1 ? "alta" : "media",
            title: esCritico ? `⚠️ CRÍTICO próximo · ${nombre}` : `Hito próximo · ${nombre}`,
            detail: `Exp. ${numExp} · en ${dias} días${esCritico ? " — riesgo de cargos por demora" : ""}`,
            href: `/expedientes/${h.expediente_id}`,
            createdAt: h.fecha_programada,
          });
        }

      }

      // Logística: ETA vencida sin arribo
      for (const o of (logi.data ?? []) as any[]) {
        if (!o.eta) continue;
        const dias = daysBetween(today, parseLocalDate(o.eta));
        if (dias <= 0) continue;
        out.push({
          id: `logistica_eta_vencida:${o.id}`,
          kind: "logistica_eta_vencida",
          severity: dias > 3 ? "critica" : "alta",
          title: `Operación ${o.numero ?? ""} · ETA vencida sin arribo`,
          detail: `${o.clientes?.nombre ?? "Sin cliente"} · ETA vencida hace ${dias} días`,
          href: `/logistica/${o.id}`,
          createdAt: o.eta,
        });
      }

      // Logística: embarcada sin documentos cargados
      for (const r of opsSinDocs) {
        const op = r.operaciones_logistica;
        out.push({
          id: `logistica_sin_documentos:${r.operacion_logistica_id}`,
          kind: "logistica_sin_documentos",
          severity: "media",
          title: `Operación ${op?.numero ?? ""} sin documentos cargados`,
          detail: "Embarque completado y aún no hay documentos adjuntos",
          href: `/logistica/${r.operacion_logistica_id}`,
          createdAt: new Date().toISOString(),
        });
      }

      // Plazo legal de presentación: 5 días hábiles desde la llegada real.
      for (const e of (pres.data ?? []) as any[]) {
        if (!e.fecha_llegada_real) continue;
        const restantes = diasHabilesRestantes(e.fecha_llegada_real, 5);
        if (!isFinite(restantes) || restantes > 5) continue;
        const critico = restantes <= 1;
        out.push({
          id: `plazo_presentacion:${e.id}`,
          kind: "plazo_presentacion",
          severity: critico ? "critica" : "alta",
          title: critico
            ? `⚠️ CRÍTICO · Plazo de presentación · Exp. ${e.numero}`
            : `Plazo de presentación por vencer · Exp. ${e.numero}`,
          detail:
            restantes < 0
              ? `${e.cliente?.nombre ?? ""} · vencido hace ${Math.abs(restantes)} días`
              : restantes === 0
                ? `${e.cliente?.nombre ?? ""} · vence hoy (5 días hábiles desde la llegada real)`
                : `${e.cliente?.nombre ?? ""} · quedan ${restantes} días (5 días hábiles desde la llegada real)`,
          href: `/expedientes/${e.id}`,
          createdAt: e.fecha_llegada_real,
        });
      }

      const sevOrder: Record<ReminderSeverity, number> = { critica: 0, alta: 1, media: 2 };
      // Ordena por severidad; dentro de "crítica", el hito de Verificación va primero.
      out.sort((a, b) => {
        const s = sevOrder[a.severity] - sevOrder[b.severity];
        if (s !== 0) return s;
        const aC = a.title.includes("CRÍTICO") ? 0 : 1;
        const bC = b.title.includes("CRÍTICO") ? 0 : 1;
        return aC - bC;
      });
      return out;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,

  });

  const { dismissed, dismiss, clearAll } = useDismissedReminders();
  const visible = (query.data ?? []).filter((r) => !dismissed.has(r.id));

  // Limpia de la tabla los descartes de alertas que ya no existen (evita crecimiento sin límite)
  const qc = useQueryClient();
  const pruned = useRef(false);
  useEffect(() => {
    if (!query.data || pruned.current) return;
    const alive = new Set(query.data.map((r) => r.id));
    const stale = [...dismissed].filter((id) => !alive.has(id));
    if (stale.length === 0) return;
    pruned.current = true;
    void (async () => {
      const userId = await currentUserId();
      if (!userId) return;
      await supabase
        .from("recordatorios_descartados")
        .delete()
        .eq("user_id", userId)
        .in("reminder_id", stale);
      qc.invalidateQueries({ queryKey: DISMISSED_QK });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, dismissed]);

  return { all: query.data ?? [], visible, dismiss, clearAll, isLoading: query.isLoading };
}
