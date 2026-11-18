import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtRD } from "@/lib/facturas-ecf";
import type { CambioIngreso } from "@/lib/factura-ecf-asignacion";
import { cambiosIngresoPorVinculacion, type EstadoVinculacion } from "@/components/factura-ecf-vinculacion";

export type CambioIngresoMostrado = CambioIngreso & { clave: string; numero: string; facturas: string[] };

const plural = (n: number) => `${n} ${n === 1 ? "factura vinculada" : "facturas vinculadas"}`;

/** Aviso previo al guardado: el ingreso del Transporte pasa a la suma de sus facturas (o a 0 al quitar la última). */
export function DialogoIngresoTransporte({ cambios, onConfirmar, onCancelar }: {
  cambios: readonly CambioIngresoMostrado[] | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <AlertDialog open={!!cambios} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Cambio en el ingreso del Transporte</AlertDialogTitle>
          <AlertDialogDescription>Revisa el cambio antes de guardar.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-2">
          {(cambios ?? []).map((c) => (
            <li key={c.clave} className="rounded-md border border-warning bg-warning/10 p-2 text-sm text-warning-text space-y-1">
              <p className="font-semibold">{c.numero}</p>
              <p>
                El ingreso cambiará de <strong className="tabular-nums">{fmtRD(c.antes)}</strong> ({c.manualAntes ? "escrito a mano" : `suma de ${plural(c.vinculadasAntes)}`}) a{" "}
                <strong className="tabular-nums">{fmtRD(c.despues)}</strong> ({c.vinculadasDespues > 0 ? `suma de ${plural(c.vinculadasDespues)}` : "sin facturas vinculadas"}).
              </p>
              <p className="text-xs">
                {c.vinculadasAntes === 0
                  ? "Este Transporte aún no tiene facturas vinculadas."
                  : `Ya tiene ${plural(c.vinculadasAntes)}${c.facturas.length ? `: ${c.facturas.join(", ")}` : ""}.`}
              </p>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>Confirmar y guardar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Calcula el cambio de ingreso de los Transportes afectados y pide confirmación solo si hay alguno. */
export function useConfirmarIngresoTransporte() {
  const [pendiente, setPendiente] = useState<{ cambios: CambioIngresoMostrado[]; continuar: () => void } | null>(null);
  const [calculando, setCalculando] = useState(false);

  const mostrar = (cambios: CambioIngresoMostrado[], continuar: () => void) => {
    if (cambios.length) setPendiente({ cambios, continuar });
    else continuar();
  };

  const pedirPorVinculacion = async (facturaId: string | undefined, estado: EstadoVinculacion, continuar: () => void) => {
    setCalculando(true);
    try {
      mostrar(await cambiosIngresoPorVinculacion(facturaId, estado), continuar);
    } catch (e: any) {
      toast.error(`No se pudo calcular el cambio de ingreso del Transporte: ${e?.message ?? "error"}`);
    } finally {
      setCalculando(false);
    }
  };

  const dialogo = (
    <DialogoIngresoTransporte
      cambios={pendiente?.cambios ?? null}
      onCancelar={() => setPendiente(null)}
      onConfirmar={() => { const p = pendiente; setPendiente(null); p?.continuar(); }}
    />
  );
  return { mostrar, pedirPorVinculacion, calculando, dialogo };
}
