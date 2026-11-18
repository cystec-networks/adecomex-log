// Simulación, aplicación en lote y deshacer del autocompletado desde BL/AWB o Factura comercial.
// EN DESUSO por decisión del usuario (18/11/2026): no hay botón que lo llame. Los Expedientes
// existentes se leen uno por uno con «Leer ahora» en su documento.
// Solo usa lecturas ya guardadas en el documento (no vuelve a pagar IA) y nunca toca los Completados.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  TIPOS_OPERATIVOS, fuenteOperativa, type DecisionOperativa, type FuenteOperativa, type LecturaOperativaGuardada,
} from "./autocompletar-operativo";
import {
  aplicarAutocompletadoOperativo, evaluarAutocompletadoOperativo, lecturaOperativaParaGuardar,
  type CatalogoOperativoCache, type EvaluacionOperativa,
} from "./autocompletar-operativo-evaluar";
import type { OcrExtraction } from "./ai-ocr.functions";

const TIPOS = TIPOS_OPERATIVOS as readonly string[];

/** Valores que viajan en la respuesta de la función de servidor. */
type Json = string | number | boolean | null | Json[] | { [clave: string]: Json };

export type FilaLoteOperativo = {
  expediente_id: string; numero: string; estado: string; cliente: string | null;
  documento_id: string; tipo: string; fuente: FuenteOperativa; archivo: string | null; leido_en: string | null;
  ok: boolean; errores: string[]; avisos: string[];
  completados: string[]; cambios: Record<string, Json>; alertas: string[]; coincidencias: string[];
};

const datosDe = (lectura: { datos?: Record<string, unknown> } | null | undefined): Partial<OcrExtraction> & Record<string, unknown> =>
  (lectura?.datos ?? {}) as Partial<OcrExtraction> & Record<string, unknown>;

/** Documentos BL/AWB o Factura con lectura guardada, de Expedientes que no están Completados. */
async function candidatos(db: any, desde: number, limite: number) {
  const { data: docs, error } = await db.from("documentos")
    .select("id, expediente_id, tipo, storage_path, lectura_operativa")
    .in("tipo", [...TIPOS]).not("storage_path", "is", null).not("lectura_operativa", "is", null)
    .order("expediente_id").order("fecha_recepcion", { ascending: false })
    .range(desde, desde + limite - 1);
  if (error) throw new Error(error.message);
  const ids = [...new Set((docs ?? []).map((d: any) => d.expediente_id) as string[])];
  if (!ids.length) return { docs: [] as any[], exps: [] as any[] };
  const { data: exps, error: e2 } = await db.from("expedientes")
    .select("id, numero, estado, eliminado_en, cliente:clientes(nombre)")
    .in("id", ids).is("eliminado_en", null).neq("estado", "completado");
  if (e2) throw new Error(e2.message);
  return { docs: docs ?? [], exps: exps ?? [] };
}

/** Vista previa del lote: qué se llenaría en cada Expediente con las lecturas ya guardadas. */
export const simularLoteOperativo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ desde: z.number().int().min(0).default(0), limite: z.number().int().min(1).max(40).default(20) }).parse(data))
  .handler(async ({ context, data }): Promise<{ filas: FilaLoteOperativo[]; desde: number; limite: number }> => {
    const { docs, exps } = await candidatos(context.supabase, data.desde, data.limite);
    const porExp = new Map<string, any>((exps ?? []).map((e: any) => [e.id, e]));
    const cache: CatalogoOperativoCache = { res: new Map() };
    const filas: FilaLoteOperativo[] = [];
    for (const d of docs as any[]) {
      const exp = porExp.get(d.expediente_id);
      const fuente = fuenteOperativa(d.tipo);
      const lectura = d.lectura_operativa as { archivo?: string | null; leido_en?: string | null; datos?: Record<string, unknown> } | null;
      if (!exp || !fuente || !lectura || lectura.archivo !== d.storage_path) continue;
      try {
        const ev = await evaluarAutocompletadoOperativo(context.supabase, { expedienteId: exp.id, tipo: d.tipo, datos: datosDe(lectura), cache });
        filas.push({
          expediente_id: exp.id, numero: exp.numero, estado: exp.estado, cliente: exp.cliente?.nombre ?? null,
          documento_id: d.id, tipo: d.tipo, fuente, archivo: d.storage_path, leido_en: lectura.leido_en ?? null,
          ok: ev.validacion.ok, errores: ev.validacion.errores, avisos: ev.validacion.avisos,
          completados: ev.decision.completados, cambios: ev.decision.cambios as Record<string, Json>, alertas: ev.decision.alertas,
          coincidencias: ev.decision.coincidencias,
        });
      } catch (e) {
        filas.push({
          expediente_id: exp.id, numero: exp.numero, estado: exp.estado, cliente: exp.cliente?.nombre ?? null,
          documento_id: d.id, tipo: d.tipo, fuente, archivo: d.storage_path, leido_en: lectura.leido_en ?? null,
          ok: false, errores: [`No se pudo evaluar: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`],
          avisos: [], completados: [], cambios: {}, alertas: [], coincidencias: [],
        });
      }
    }
    return { filas, desde: data.desde, limite: data.limite };
  });

/** Aplica los Expedientes elegidos y guarda el valor anterior de cada campo para poder deshacer. */
export const aplicarLoteOperativo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ documentoIds: z.array(z.string().uuid()).min(1).max(60) }).parse(data))
  .handler(async ({ context, data }): Promise<{ lote_id: string; aplicados: number; campos: number; contenedores: number; avisos: string[] }> => {
    const db = context.supabase;
    const { data: docs, error } = await db.from("documentos")
      .select("id, expediente_id, tipo, storage_path, lectura_operativa").in("id", data.documentoIds);
    if (error) throw new Error(error.message);
    const cache: CatalogoOperativoCache = { res: new Map() };
    const lote_id = crypto.randomUUID();
    const avisos: string[] = [];
    let aplicados = 0, campos = 0, contenedores = 0;
    for (const d of (docs ?? []) as any[]) {
      const fuente = fuenteOperativa(d.tipo);
      const lectura = d.lectura_operativa as { archivo?: string | null; datos?: Record<string, unknown> } | null;
      if (!fuente || !lectura || lectura.archivo !== d.storage_path) { avisos.push(`${d.tipo}: la lectura guardada ya no corresponde al archivo.`); continue; }
      let ev: EvaluacionOperativa;
      try {
        ev = await evaluarAutocompletadoOperativo(db, { expedienteId: d.expediente_id, tipo: d.tipo, datos: datosDe(lectura), cache });
      } catch (e) { avisos.push(`${d.tipo}: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`); continue; }
      if (!ev.validacion.ok) { avisos.push(`Expediente ${d.expediente_id.slice(0, 8)}: ${ev.validacion.errores.join(" ")}`); continue; }
      const anterior: Record<string, Json> = {};
      for (const campo of ev.decision.completados) anterior[campo] = (ev.actual[campo] ?? null) as Json;
      const lista = Array.isArray(ev.decision.cambios.contenedores) ? (ev.decision.cambios.contenedores as OcrExtraction["contenedores"]) : [];
      const lecturaGuardar = lecturaOperativaParaGuardar({ datos: datosDe(lectura), fuente, origen: "lote", archivo: d.storage_path }, ev.decision);
      const r = await aplicarAutocompletadoOperativo(db, {
        expedienteId: d.expediente_id, documentoId: d.id, origen: "lote", evaluacion: ev, lectura: lecturaGuardar,
      });
      const { error: ie } = await db.from("autocompletado_lotes").insert({
        lote_id, expediente_id: d.expediente_id, documento_id: d.id, fuente,
        anterior, contenedores: r.contenedores ? lista : [],
      } as never);
      if (ie) throw new Error(`Se aplicó pero no se pudo registrar el lote para deshacer: ${ie.message}`);
      aplicados += 1; campos += r.completados.length; contenedores += r.contenedores;
    }
    return { lote_id, aplicados, campos, contenedores, avisos };
  });

/** Devuelve cada campo a su valor anterior y quita los contenedores que se agregaron. */
export const deshacerLoteOperativo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ loteId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ restaurados: number; contenedores: number }> => {
    const { data: r, error } = await context.supabase.rpc("deshacer_autocompletado_lote", { p_lote: data.loteId });
    if (error) throw new Error(error.message);
    const v = (r ?? {}) as { restaurados?: number; contenedores?: number };
    return { restaurados: v.restaurados ?? 0, contenedores: v.contenedores ?? 0 };
  });

/** Últimos lotes aplicados, para poder deshacerlos desde la pantalla. */
export const listarLotesOperativo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ lote_id: string; aplicado_en: string; expedientes: number; campos: number; deshecho_en: string | null }>> => {
    const { data, error } = await context.supabase.from("autocompletado_lotes")
      .select("lote_id, aplicado_en, deshecho_en, expediente_id, anterior")
      .order("aplicado_en", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const por = new Map<string, { lote_id: string; aplicado_en: string; expedientes: number; campos: number; deshecho_en: string | null }>();
    for (const f of (data ?? []) as any[]) {
      const g = por.get(f.lote_id) ?? { lote_id: f.lote_id, aplicado_en: f.aplicado_en, expedientes: 0, campos: 0, deshecho_en: f.deshecho_en ?? null };
      g.expedientes += 1;
      g.campos += Object.keys(f.anterior ?? {}).length;
      if (f.deshecho_en) g.deshecho_en = f.deshecho_en;
      por.set(f.lote_id, g);
    }
    return [...por.values()].slice(0, 20);
  });

export type { LecturaOperativaGuardada };
