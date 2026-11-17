// Funciones de servidor para el recibo de pago de la DGA. Todas leen con las reglas fijas de
// `recibo-dga` y con el cliente del usuario (RLS): ninguna escribe en el Expediente.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  estadoPagoTardio, leerBalanceLiquidacion, validarReciboDga, decidirGuardadoRecibo,
  type ReciboDga, type ValidacionRecibo,
} from "./recibo-dga";
import type { ResultadoLecturaRecibo } from "./recibo-dga.server";

export type { ResultadoLecturaRecibo };

/** Lee un PDF de recibo (reglas fijas, sin IA) para el panel del Expediente. */
export const leerReciboDgaDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ filename: z.string().max(300), base64: z.string().min(20) }).parse(data))
  .handler(async ({ data }): Promise<ResultadoLecturaRecibo> => {
    const { leerReciboDgaPdf } = await import("./recibo-dga.server");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    return leerReciboDgaPdf(bytes);
  });

/** Lee los saldos de una Liquidación de Impuestos (reglas fijas, sin IA) para comparar el recibo. */
export const leerBalanceLiquidacionDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ filename: z.string().max(300), base64: z.string().min(20) }).parse(data))
  .handler(async ({ data }): Promise<{ balance: ReturnType<typeof leerBalanceLiquidacion>; texto: boolean }> => {
    const { textoPdfRenglones } = await import("./pdf-texto.server");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const texto = await textoPdfRenglones(bytes);
    return { balance: texto ? leerBalanceLiquidacion(texto) : null, texto: !!texto?.trim() };
  });

export type FilaSimulacionRecibo = {
  expediente_id: string;
  numero: string;
  estado: "ok" | "difiere" | "sin_emparejar" | "sin_lectura";
  recibo: string | null;
  fecha_pago: string | null;
  banco: string | null;
  transaccion: string | null;
  total_recibo: number | null;
  total_liquidacion: number | null;
  conceptos_difieren: string[];
  avisos: string[];
  pago_tardio: "a_tiempo" | "tardio" | "sin_dato";
  debito_bancario: "encontrado" | "no_encontrado" | "sin_dato";
  motivo: string | null;
  completaria: string[];
};

const TIPO_RECIBO = "Recibo Pago de Impuestos";
const TIPO_LIQUIDACION = "Reporte de Liquidación de Impuestos";

/**
 * Simulación sin escrituras: para cada Expediente con recibo cargado, lee el comprobante, lo compara
 * con la Liquidación guardada y reporta qué campos se completarían. Nunca actualiza nada.
 */
export const simularRecibosDga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ expedienteIds: z.array(z.string().uuid()).min(1).max(20) }).parse(data))
  .handler(async ({ data, context }): Promise<FilaSimulacionRecibo[]> => {
    const { leerReciboDgaPdf } = await import("./recibo-dga.server");
    const filas: FilaSimulacionRecibo[] = [];
    for (const id of data.expedienteIds) {
      const { data: exp } = await context.supabase.from("expedientes")
        .select("id, numero, cliente_id, liq_siga_numero, liq_siga_pin_pago, liq_siga_fecha_pago, liq_siga_termino_at, liq_recibo_numero, liq_recibo_banco, liq_recibo_transaccion, clientes(nombre, rnc)")
        .eq("id", id).maybeSingle();
      if (!exp) continue;
      const base: FilaSimulacionRecibo = {
        expediente_id: id, numero: String(exp.numero ?? ""), estado: "sin_lectura", recibo: null, fecha_pago: null,
        banco: null, transaccion: null, total_recibo: null, total_liquidacion: null, conceptos_difieren: [],
        avisos: [], pago_tardio: "sin_dato", debito_bancario: "sin_dato", motivo: null, completaria: [],
      };
      const { data: docs } = await context.supabase.from("documentos")
        .select("id, tipo, storage_path").eq("expediente_id", id).in("tipo", [TIPO_RECIBO, TIPO_LIQUIDACION]);
      const reciboDoc = (docs ?? []).find((d) => d.tipo === TIPO_RECIBO && d.storage_path);
      const liqDoc = (docs ?? []).find((d) => d.tipo === TIPO_LIQUIDACION && d.storage_path);
      if (!reciboDoc?.storage_path) { filas.push({ ...base, motivo: "No hay archivo en la casilla Recibo Pago de Impuestos." }); continue; }
      const descarga = async (ruta: string) => {
        const { data: blob, error } = await context.supabase.storage.from("documentos").download(ruta);
        if (error || !blob) return null;
        return new Uint8Array(await blob.arrayBuffer());
      };
      const bytesRecibo = await descarga(reciboDoc.storage_path);
      if (!bytesRecibo) { filas.push({ ...base, motivo: "No se pudo descargar el PDF del recibo." }); continue; }
      const lectura = await leerReciboDgaPdf(bytesRecibo);
      if (!lectura.recibo) { filas.push({ ...base, motivo: lectura.motivo ?? "No se pudo leer el comprobante." }); continue; }
      const recibo = lectura.recibo;
      const bytesLiq = liqDoc?.storage_path ? await descarga(liqDoc.storage_path) : null;
      const balance = bytesLiq ? leerBalanceLiquidacion((await textoDe(bytesLiq)) ?? "") : null;
      const liquidaciones = balance ? [balance] : [];
      const validacion = validarReciboDga(recibo, liquidaciones);
      const guardado = decidirGuardadoRecibo(exp as unknown as Record<string, unknown>, recibo, validacion);
      const trans = recibo.formas[0]?.transaccion ?? null;
      let debito: FilaSimulacionRecibo["debito_bancario"] = "sin_dato";
      if (trans) {
        const { data: mov } = await context.supabase.from("banco_movimientos")
          .select("id, fecha, monto, descripcion").ilike("descripcion", `%${trans}%`).limit(1);
        debito = mov?.length ? "encontrado" : "no_encontrado";
      }
      filas.push({
        ...base,
        estado: validacion.estado === "ok" ? "ok" : validacion.estado === "difiere" ? "difiere" : "sin_emparejar",
        recibo: recibo.recibo, fecha_pago: recibo.fecha_pago, banco: recibo.formas[0]?.banco ?? null,
        transaccion: trans, total_recibo: recibo.total, total_liquidacion: validacion.total_liquidacion,
        conceptos_difieren: validacion.filas.filter((f) => f.estado === "difiere").map((f) => f.etiqueta),
        avisos: [...validacion.avisos, ...guardado.avisos.filter((a) => !validacion.avisos.includes(a))],
        pago_tardio: estadoPagoTardio(recibo, exp.liq_siga_termino_at),
        debito_bancario: debito,
        motivo: validacion.estado === "sin_emparejar" ? "El número de liquidación del recibo no coincide con el guardado." : null,
        completaria: Object.keys(guardado.cambios),
      });
    }
    return filas;
  });

async function textoDe(bytes: Uint8Array): Promise<string | null> {
  const { textoPdfRenglones } = await import("./pdf-texto.server");
  return textoPdfRenglones(bytes);
}

export type { ReciboDga, ValidacionRecibo };
