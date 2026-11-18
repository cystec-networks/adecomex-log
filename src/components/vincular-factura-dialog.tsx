import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmtRD } from "@/lib/facturas-ecf";
import { estadoInicialVinculacion, tipoConceptoSugerido, validarAsignaciones, type Candidato, type TipoConcepto } from "@/lib/factura-ecf-asignacion";
import { guardarVinculacionFactura } from "@/lib/factura-ecf-vinculacion";
import {
  VinculacionFacturaEcf, ESTADO_VINCULACION_VACIO, CLAVES_VINCULOS_FACTURA, agregarDestinoEstado, cargarVinculacionGuardada,
  faltanConfirmaciones, pistasFactura, quitarDestinoEstado, type EstadoVinculacion,
} from "@/components/factura-ecf-vinculacion";
import { useConfirmarIngresoTransporte } from "@/components/confirmar-ingreso-transporte";

/** «Vincular»: reparte una factura ya registrada entre Expedientes y Transportes sin editar sus datos fiscales. */
export function VincularFacturaDialog({ facturaId, open, onOpenChange, agregarDestino, quitarDestino, onSaved }: {
  facturaId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Destino a añadir al abrir (p. ej. desde la ficha del Expediente). */
  agregarDestino?: string;
  /** Destino a quitar al abrir (desvincular desde la ficha). */
  quitarDestino?: string;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["vincular-factura", facturaId],
    enabled: open && !!facturaId,
    queryFn: async () => {
      const { data: f, error: e } = await supabase.from("facturas_ecf").select("id,encf,cliente_id,cliente_razon_social,fecha_emision,monto_total,notas").eq("id", facturaId!).single();
      if (e) throw e;
      return { f, ...(await cargarVinculacionGuardada(facturaId!)) };
    },
    staleTime: 0,
  });

  const [tipos, setTipos] = useState<TipoConcepto[]>([]);
  const [estado, setEstado] = useState<EstadoVinculacion>(ESTADO_VINCULACION_VACIO);
  const [info, setInfo] = useState<Map<string, Candidato>>(new Map());
  const ingreso = useConfirmarIngresoTransporte();

  const renglones = useMemo(() => (data?.lineas ?? []).map((l, i) => ({
    importe: Math.round((Number(l.valor || 0) + Number(l.itbis || 0)) * 100) / 100,
    tipo: tipos[i] ?? ((l.tipo_concepto as TipoConcepto | null) ?? tipoConceptoSugerido(l.descripcion)),
    descripcion: l.descripcion ?? "",
  })), [data, tipos]);

  useEffect(() => {
    if (!data || !open) return;
    const t = data.lineas.map((l) => (l.tipo_concepto as TipoConcepto | null) ?? tipoConceptoSugerido(l.descripcion));
    setTipos(t);
    const base = data.lineas.map((l, i) => ({ id: l.id, expediente_id: l.expediente_id, transporte_id: l.transporte_id, importe: Math.round((Number(l.valor || 0) + Number(l.itbis || 0)) * 100) / 100, tipo: t[i] }));
    let v: EstadoVinculacion = { ...estadoInicialVinculacion(base, data.asignaciones, data.legado), confirmados: {} };
    if (quitarDestino) v = quitarDestinoEstado(base, v, quitarDestino);
    if (agregarDestino) v = agregarDestinoEstado(base, v, agregarDestino);
    setEstado(v);
  }, [data, open, agregarDestino, quitarDestino]);

  const pistas = useMemo(() => pistasFactura((data?.lineas ?? []).map((l) => l.descripcion ?? ""), data?.f.notas), [data]);
  const total = Number(data?.f.monto_total || 0);

  const guardar = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Factura no disponible");
      const v = validarAsignaciones(renglones, estado.filas, total);
      if (!v.valida) throw new Error(v.errores[0]);
      if (faltanConfirmaciones(estado, info).length) throw new Error("Confirma los destinos que ya tienen otra factura vinculada.");
      return guardarVinculacionFactura(data.f.id, data.lineas.map((l) => l.id), renglones.map((r) => r.tipo), estado.filas);
    },
    onSuccess: (r) => {
      const n = (r.expedientes?.length ?? 0) + (r.transportes?.length ?? 0);
      toast.success(n ? `Vinculación guardada (${n} ${n === 1 ? "destino" : "destinos"})` : "Factura sin vincular");
      for (const a of r.avisos) toast.warning(a);
      for (const k of CLAVES_VINCULOS_FACTURA) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ["vincular-factura", facturaId] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar la vinculación"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle>Vincular factura {data?.f.encf ?? ""}</DialogTitle>
          <DialogDescription>
            {data ? `${data.f.cliente_razon_social ?? "Cliente"} · ${fmtRD(total)}. ` : ""}
            Asigna cada renglón a un Expediente o a un Transporte; los montos deben sumar exactamente el total.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {error && <p className="text-sm text-destructive">No se pudo cargar la factura.</p>}
        {data && (
          <VinculacionFacturaEcf
            facturaId={data.f.id}
            clienteId={data.f.cliente_id}
            fechaEmision={data.f.fecha_emision}
            total={total}
            renglones={renglones}
            onTipo={(i, t) => setTipos((prev) => prev.map((x, k) => (k === i ? t : x)))}
            pistas={pistas}
            value={estado}
            onChange={setEstado}
            autoPreseleccionar={!data.asignaciones.length && !data.legado.expedientes.length && !data.legado.transportes.length && !agregarDestino}
            onInfo={setInfo}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!data) return;
              // Errores de reparto o confirmaciones pendientes se muestran sin pasar por el aviso de ingreso.
              if (!validarAsignaciones(renglones, estado.filas, total).valida || faltanConfirmaciones(estado, info).length) return guardar.mutate();
              void ingreso.pedirPorVinculacion(data.f.id, estado, () => guardar.mutate());
            }}
            disabled={!data || guardar.isPending || ingreso.calculando}
          >{guardar.isPending ? "Guardando…" : ingreso.calculando ? "Revisando…" : "Guardar vinculación"}</Button>
        </DialogFooter>
        {ingreso.dialogo}
      </DialogContent>
    </Dialog>
  );
}
