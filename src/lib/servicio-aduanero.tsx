/**
 * Tasa de Servicio Aduanero + Formulario DUA.
 * Lógica compartida entre la Calculadora Rápida, el Expediente
 * (Pre-Liquidación, Liquidación Final y Detalle de Mercancía) y los PDFs.
 *
 * Desde la versión de "múltiples tipos de despacho", el Servicio Aduanero
 * se compone de una LISTA de líneas {tipo_despacho, cantidad}, donde
 * `tipo_despacho` es el código de unidad del catálogo (contenedor20,
 * contenedor4045, kg, tm, vehiculo).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Cargo fijo del Formulario DUA en pesos dominicanos (monto oficial SIGA). */
export const FORMULARIO_DUA_RD = 258.26;

export type TarifaServicio = { id: string; tipo_despacho: string; unidad: string; tarifa_usd: number };

/** Una línea de Servicio Aduanero. `tipo_despacho` guarda el código de unidad. */
export type FilaServicio = { tipo_despacho: string; cantidad: number | string };

export const ETIQUETA_CANTIDAD: Record<string, string> = {
  kg: "Peso total (kg)",
  contenedor20: "N° de contenedores de 20'",
  contenedor4045: "N° de contenedores de 40-45'",
  vehiculo: "N° de vehículos",
  tm: "Toneladas métricas",
};

const nfUsd = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function useTarifasServicioAduanero() {
  return useQuery({
    queryKey: ["catalogo-tasa-servicio-aduanero"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_tasa_servicio_aduanero")
        .select("id, tipo_despacho, unidad, tarifa_usd")
        .eq("activo", true)
        .order("tipo_despacho");
      if (error) throw error;
      return (data ?? []) as TarifaServicio[];
    },
  });
}

/** Servicio Aduanero en US$ = tarifa del tipo elegido × cantidad. */
export function calcServicioAduaneroUsd(
  tarifa: TarifaServicio | undefined | null,
  cantidad: number | string | null | undefined,
): number {
  if (!tarifa) return 0;
  const c = Number(cantidad);
  if (!Number.isFinite(c) || c <= 0) return 0;
  return Number(tarifa.tarifa_usd) * c;
}

/** Subtotal de una línea usando el catálogo (busca por código de unidad). */
export function subtotalFila(fila: FilaServicio, tarifas: TarifaServicio[]): number {
  const tarifa = tarifas.find((t) => t.unidad === fila.tipo_despacho);
  return calcServicioAduaneroUsd(tarifa, fila.cantidad);
}

/** Total del Servicio Aduanero sumando todas las líneas. */
export function totalServicioUsd(filas: FilaServicio[] | null | undefined, tarifas: TarifaServicio[]): number {
  return (filas ?? []).reduce((s, f) => s + subtotalFila(f, tarifas), 0);
}

/** El Formulario DUA es un monto fijo en RD$; sólo se divide por la tasa para mostrarlo en US$. */
export function formularioDuaEnUsd(tasaCambio: number | null | undefined): number {
  const t = Number(tasaCambio) || 0;
  return t > 0 ? FORMULARIO_DUA_RD / t : 0;
}

/** Lee las líneas de Servicio Aduanero guardadas de un Expediente. */
export function useFilasServicioAduanero(expedienteId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["expediente-servicio-aduanero", expedienteId],
    enabled: !!expedienteId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expediente_servicio_aduanero")
        .select("tipo_despacho, cantidad")
        .eq("expediente_id", expedienteId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        tipo_despacho: r.tipo_despacho as string,
        cantidad: Number(r.cantidad),
      })) as FilaServicio[];
    },
  });
}

/** Reemplaza las líneas guardadas de un Expediente por las indicadas. */
export async function guardarFilasServicioAduanero(expedienteId: string, filas: FilaServicio[]) {
  await supabase.from("expediente_servicio_aduanero").delete().eq("expediente_id", expedienteId);
  const validas = (filas ?? []).filter((f) => f.tipo_despacho && Number(f.cantidad) > 0);
  if (!validas.length) return;
  const { error } = await supabase.from("expediente_servicio_aduanero").insert(
    validas.map((f) => ({
      expediente_id: expedienteId,
      tipo_despacho: f.tipo_despacho,
      cantidad: Number(f.cantidad),
    })),
  );
  if (error) throw error;
}

/** Totales de Servicio Aduanero + Formulario DUA a partir de una lista de líneas. */
export function useServicioAduaneroTotales(
  filas: FilaServicio[] | null | undefined,
  tasaCambio: number | null | undefined,
) {
  const { data: tarifas = [] } = useTarifasServicioAduanero();
  const servicioUsd = totalServicioUsd(filas, tarifas);
  const tasa = Number(tasaCambio) || 0;
  return {
    tarifas,
    servicioUsd,
    servicioRd: tasa > 0 ? servicioUsd * tasa : null,
    formularioDuaRd: FORMULARIO_DUA_RD,
    formularioDuaUsd: formularioDuaEnUsd(tasa),
  };
}

/** Lista editable de tipos de despacho con subtotal por línea y total general. */
export function ServicioAduaneroFields({
  filas,
  onChange,
  disabled,
  extraAction,
}: {
  filas: FilaServicio[];
  onChange: (filas: FilaServicio[]) => void;
  disabled?: boolean;
  /** Acción opcional junto al botón "Agregar tipo" (ej. autocompletar). */
  extraAction?: React.ReactNode;
}) {
  const { data: tarifas = [] } = useTarifasServicioAduanero();
  const rows = filas ?? [];
  const total = totalServicioUsd(rows, tarifas);

  const setFila = (i: number, patch: Partial<FilaServicio>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-2 md:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Servicio Aduanero — tipos de despacho</Label>
        {!disabled && (
          <div className="flex items-center gap-2">
            {extraAction}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...rows, { tipo_despacho: "", cantidad: "" }])}
            >
              + Agregar tipo
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin tipos de despacho registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left w-10">#</th>
                <th className="px-2 py-2 text-left">Tipo de despacho</th>
                <th className="px-2 py-2 text-left w-48">Cantidad</th>
                <th className="px-2 py-2 text-right w-36">Subtotal US$</th>
                {!disabled && <th className="px-2 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => {
                const tarifa = tarifas.find((t) => t.unidad === f.tipo_despacho);
                return (
                  <tr key={i} className="border-t align-top">
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1">
                      <Select
                        value={f.tipo_despacho || undefined}
                        onValueChange={(v) => setFila(i, { tipo_despacho: v })}
                        disabled={disabled}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar tipo de despacho" /></SelectTrigger>
                        <SelectContent>
                          {tarifas.map((t) => (
                            <SelectItem key={t.id} value={t.unidad}>
                              {t.tipo_despacho} — US$ {nfUsd(Number(t.tarifa_usd))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        step={tarifa && (tarifa.unidad === "kg" || tarifa.unidad === "tm") ? "0.01" : "1"}
                        min="0"
                        value={f.cantidad == null ? "" : String(f.cantidad)}
                        disabled={disabled || !tarifa}
                        onChange={(e) => setFila(i, { cantidad: e.target.value })}
                        placeholder={tarifa ? (ETIQUETA_CANTIDAD[tarifa.unidad] ?? "Cantidad") : "Selecciona primero el tipo"}
                        className="tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{nfUsd(subtotalFila(f, tarifas))}</td>
                    {!disabled && (
                      <td className="px-2 py-1 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                        >
                          ✕
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 font-semibold">
                <td className="px-2 py-2" colSpan={3}>Total Servicio Aduanero</td>
                <td className="px-2 py-2 text-right tabular-nums">US$ {nfUsd(total)}</td>
                {!disabled && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground leading-tight">
        Más Formulario DUA: RD$ {FORMULARIO_DUA_RD.toFixed(2)} (cargo fijo).
      </p>
    </div>
  );
}

/** Versión sin hooks (para generación de PDFs): total de Servicio Aduanero de un Expediente. */
export async function servicioAduaneroDeExpediente(exp: any): Promise<number> {
  const expedienteId = exp?.id;
  if (!expedienteId) return 0;
  const [{ data: filas }, { data: tarifas }] = await Promise.all([
    supabase.from("expediente_servicio_aduanero").select("tipo_despacho, cantidad").eq("expediente_id", expedienteId),
    supabase.from("catalogo_tasa_servicio_aduanero").select("id, tipo_despacho, unidad, tarifa_usd"),
  ]);
  if (!filas?.length || !tarifas?.length) return 0;
  return (filas as any[]).reduce((s, f) => {
    const t = (tarifas as any[]).find((x) => x.unidad === f.tipo_despacho);
    return s + (t ? (Number(t.tarifa_usd) || 0) * (Number(f.cantidad) || 0) : 0);
  }, 0);
}
