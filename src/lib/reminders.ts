import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  | "hito_atrasado";

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

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
}

export function useDismissedReminders() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  };
  const clearAll = () => {
    setDismissed(new Set());
    saveDismissed(new Set());
  };
  return { dismissed, dismiss, clearAll };
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// Parsea 'YYYY-MM-DD' como fecha local para evitar el desfase UTC de un día.
import { parseLocalDate } from "@/lib/dates";

export function useReminders() {
  const query = useQuery({
    queryKey: ["reminders"],
    queryFn: async (): Promise<Reminder[]> => {
      const [sol, exp, per, tra, hit] = await Promise.all([
        supabase
          .from("solicitudes")
          .select("id,numero,estado,created_at,cliente_id, cliente:clientes(nombre)")
          .is("eliminado_en", null),
        supabase
          .from("expedientes")
          .select("id,numero,estado,updated_at,fecha_compromiso,cliente_id, cliente:clientes(nombre)")
          .is("eliminado_en", null),
        supabase
          .from("permisos")
          .select("id,numero,estado,fecha_vencimiento")
          .is("eliminado_en", null),
        supabase
          .from("transportes")
          .select("id,numero_viaje,estado,eta")
          .is("eliminado_en", null),
        supabase
          .from("expediente_hitos")
          .select("id,expediente_id,estado,fecha_programada,hito_codigo, catalogo_hitos(nombre), expedientes!inner(numero,eliminado_en)")
          .in("estado", ["pendiente", "en_curso"])
          .not("fecha_programada", "is", null),
      ]);

      const now = new Date();
      const out: Reminder[] = [];
      const cfg = REMINDER_CONFIG;

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
          const dias = daysBetween(eta, now);
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
        const dias = daysBetween(parseLocalDate(p.fecha_vencimiento), now);
        if (dias < 0) {
          out.push({
            id: `permiso_vencido:${p.id}`,
            kind: "permiso_vencido",
            severity: "critica",
            title: `Permiso ${p.numero} vencido`,
            detail: `Venció hace ${Math.abs(dias)} días`,
            href: `/permisos/${p.id}`,
            createdAt: p.fecha_vencimiento,
          });
        } else if (dias <= cfg.permisoPorVencerDias) {
          out.push({
            id: `permiso_por_vencer:${p.id}`,
            kind: "permiso_por_vencer",
            severity: dias <= 5 ? "alta" : "media",
            title: `Permiso ${p.numero} por vencer`,
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
        const dias = daysBetween(now, parseLocalDate(t.eta));
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
        const dias = daysBetween(parseLocalDate(h.fecha_programada), now);
        const nombre = h.catalogo_hitos?.nombre ?? h.hito_codigo;
        const numExp = h.expedientes?.numero ?? "";
        const esCritico = h.hito_codigo === HITO_CRITICO;
        // Hito crítico: alerta desde el mismo día (dias === 0). Otros: solo cuando vencido (dias > 0).
        if (dias > 0 || (esCritico && dias === 0)) {
          out.push({
            id: `hito_atrasado:${h.id}`,
            kind: "hito_atrasado",
            severity: "critica",
            title: esCritico
              ? `⚠️ CRÍTICO · ${nombre}${dias === 0 ? " (hoy)" : ""}`
              : `Hito atrasado · ${nombre}`,
            detail: esCritico
              ? `Exp. ${numExp} · ${dias === 0 ? "vence hoy — riesgo de cargos por demora en puerto" : `vencido hace ${dias} días — cargos por demora activos`}`
              : `Exp. ${numExp} · vencido hace ${dias} días`,
            href: `/expedientes/${h.expediente_id}`,
            createdAt: h.fecha_programada,
          });
        } else if (Math.abs(dias) <= 3) {
          out.push({
            id: `hito_proximo:${h.id}`,
            kind: "hito_proximo",
            severity: esCritico ? "critica" : Math.abs(dias) <= 1 ? "alta" : "media",
            title: esCritico ? `⚠️ CRÍTICO próximo · ${nombre}` : `Hito próximo · ${nombre}`,
            detail: `Exp. ${numExp} · en ${Math.abs(dias)} días${esCritico ? " — riesgo de cargos por demora" : ""}`,
            href: `/expedientes/${h.expediente_id}`,
            createdAt: h.fecha_programada,
          });
        }
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
    refetchInterval: 60_000,
  });

  const { dismissed, dismiss, clearAll } = useDismissedReminders();
  const visible = (query.data ?? []).filter((r) => !dismissed.has(r.id));

  // Prune dismissed IDs that no longer exist (avoid unbounded growth)
  useEffect(() => {
    if (!query.data) return;
    const alive = new Set(query.data.map((r) => r.id));
    const stale = [...dismissed].filter((id) => !alive.has(id));
    if (stale.length > 0) {
      const next = new Set([...dismissed].filter((id) => alive.has(id)));
      saveDismissed(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return { all: query.data ?? [], visible, dismiss, clearAll, isLoading: query.isLoading };
}
