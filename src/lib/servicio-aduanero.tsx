/**
 * Tasa de Servicio Aduanero + Formulario DUA.
 * Lógica compartida entre la Calculadora Rápida, el Expediente
 * (Pre-Liquidación, Liquidación Final y Detalle de Mercancía) y los PDFs.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Cargo fijo del Formulario DUA en pesos dominicanos (monto oficial SIGA). */
export const FORMULARIO_DUA_RD = 258.26;

export type TarifaServicio = { id: string; tipo_despacho: string; unidad: string; tarifa_usd: number };

export const ETIQUETA_CANTIDAD: Record<string, string> = {
  kg: "Peso total (kg)",
  contenedor20: "N° de contenedores de 20'",
  contenedor4045: "N° de contenedores de 40-45'",
  vehiculo: "N° de vehículos",
  tm: "Toneladas métricas",
};

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

/** El Formulario DUA es un monto fijo en RD$; sólo se divide por la tasa para mostrarlo en US$. */
export function formularioDuaEnUsd(tasaCambio: number | null | undefined): number {
  const t = Number(tasaCambio) || 0;
  return t > 0 ? FORMULARIO_DUA_RD / t : 0;
}

/**
 * Cálculo del Servicio Aduanero + Formulario DUA para un Expediente.
 * `tipoDespacho` es el nombre del tipo (columna `tipo_despacho_aduanero`).
 */
export function useServicioAduaneroExpediente(
  tipoDespacho: string | null | undefined,
  cantidad: number | string | null | undefined,
  tasaCambio: number | null | undefined,
) {
  const { data: tarifas = [] } = useTarifasServicioAduanero();
  const tarifa = tarifas.find((t) => t.tipo_despacho === (tipoDespacho ?? "")) ?? null;
  const servicioUsd = calcServicioAduaneroUsd(tarifa, cantidad);
  const tasa = Number(tasaCambio) || 0;
  return {
    tarifas,
    tarifa,
    servicioUsd,
    servicioRd: tasa > 0 ? servicioUsd * tasa : null,
    formularioDuaRd: FORMULARIO_DUA_RD,
    formularioDuaUsd: formularioDuaEnUsd(tasa),
  };
}

/** Campos reutilizables: Tipo de despacho + cantidad con etiqueta dinámica. */
export function ServicioAduaneroFields({
  tipoDespacho,
  cantidad,
  onChange,
  disabled,
}: {
  tipoDespacho: string;
  cantidad: string | number | null | undefined;
  onChange: (tipoDespacho: string, cantidad: string) => void;
  disabled?: boolean;
}) {
  const { data: tarifas = [] } = useTarifasServicioAduanero();
  const tarifa = tarifas.find((t) => t.tipo_despacho === tipoDespacho);
  const cantidadStr = cantidad == null ? "" : String(cantidad);

  return (
    <>
      <div className="grid gap-1.5">
        <Label>Tipo de despacho (Servicio Aduanero)</Label>
        <Select
          value={tipoDespacho || undefined}
          onValueChange={(v) => onChange(v, cantidadStr)}
          disabled={disabled}
        >
          <SelectTrigger><SelectValue placeholder="Seleccionar tipo de despacho" /></SelectTrigger>
          <SelectContent>
            {tarifas.map((t) => (
              <SelectItem key={t.id} value={t.tipo_despacho}>
                {t.tipo_despacho} — US$ {Number(t.tarifa_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label>{tarifa ? (ETIQUETA_CANTIDAD[tarifa.unidad] ?? "Cantidad") : "Cantidad"}</Label>
        <Input
          type="number"
          step={tarifa && (tarifa.unidad === "kg" || tarifa.unidad === "tm") ? "0.01" : "1"}
          min="0"
          value={cantidadStr}
          disabled={disabled || !tarifa}
          onChange={(e) => onChange(tipoDespacho, e.target.value)}
          placeholder={tarifa ? "0" : "Selecciona primero el tipo"}
          className="tabular-nums"
        />
      </div>
    </>
  );
}

/** Versión sin hooks (para generación de PDFs): calcula el Servicio Aduanero de un Expediente. */
export async function servicioAduaneroDeExpediente(exp: any): Promise<number> {
  const tipo = exp?.tipo_despacho_aduanero;
  const cant = Number(exp?.cantidad_despacho);
  if (!tipo || !Number.isFinite(cant) || cant <= 0) return 0;
  const { data } = await supabase
    .from("catalogo_tasa_servicio_aduanero")
    .select("tarifa_usd")
    .eq("tipo_despacho", tipo)
    .maybeSingle();
  if (!data) return 0;
  return (Number(data.tarifa_usd) || 0) * cant;
}
