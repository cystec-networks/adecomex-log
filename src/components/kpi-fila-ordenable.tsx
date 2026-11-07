import { useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CLAVE_ORDEN_KPI_PANEL,
  KPI_PANEL_IDS,
  esOrdenPorDefecto,
  guardarOrdenKpi,
  leerOrdenKpi,
  moverKpi,
  type KpiPanelId,
} from "@/lib/panel-kpi-orden";

const ETIQUETAS: Record<KpiPanelId, string> = {
  correos: "Correos pendientes",
  "pagos-transportista": "Pagos transportista pendientes",
  logistica: "Logística en curso",
  "expedientes-transito": "Expedientes en tránsito",
  "expedientes-por-llegar": "Expedientes por llegar",
  "permisos-vuce": "Permisos VUCE por vencer",
  transportes: "Transportes en tránsito",
  alertas: "Alertas activas",
};

/** Orden de las tarjetas KPI del usuario actual, guardado en sus preferencias (por usuario). */
export function useOrdenKpiPanel() {
  const qc = useQueryClient();
  const { data: userId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
    staleTime: Infinity,
  });
  const queryKey = ["preferencia-usuario", CLAVE_ORDEN_KPI_PANEL, userId];
  const { data: orden } = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: () => leerOrdenKpi(supabase, userId!),
    staleTime: Infinity,
  });

  const guardar = useMutation({
    mutationFn: (nuevo: KpiPanelId[]) => guardarOrdenKpi(supabase, userId!, nuevo),
    onMutate: async (nuevo) => {
      await qc.cancelQueries({ queryKey });
      const anterior = qc.getQueryData<KpiPanelId[]>(queryKey);
      qc.setQueryData(queryKey, nuevo);
      return { anterior };
    },
    onError: (_e, _nuevo, ctx) => {
      qc.setQueryData(queryKey, ctx?.anterior ?? [...KPI_PANEL_IDS]);
      toast.error("No se pudo guardar el orden de las tarjetas");
    },
  });

  const actual = orden ?? [...KPI_PANEL_IDS];
  return {
    orden: actual,
    personalizado: !esOrdenPorDefecto(actual),
    cambiar: (nuevo: KpiPanelId[]) => { if (userId) guardar.mutate(nuevo); },
    restablecer: () => { if (userId) guardar.mutate([...KPI_PANEL_IDS]); },
  };
}

function TarjetaOrdenable({ id, children, bloquearClic }: { id: KpiPanelId; children: ReactNode; bloquearClic: React.MutableRefObject<boolean> }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  // Ratón/táctil desde toda la tarjeta; teclado solo desde el asa para no interferir con Enter en el enlace.
  const evento = listeners as Record<string, ((e: unknown) => void) | undefined> | undefined;
  return (
    <div
      ref={setNodeRef}
      data-kpi-id={id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative h-full min-w-0 ${isDragging ? "z-10 cursor-grabbing opacity-80 shadow-lg" : "cursor-grab"}`}
      onMouseDown={evento?.onMouseDown}
      onTouchStart={evento?.onTouchStart}
      onClickCapture={(e) => {
        if (bloquearClic.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        onKeyDown={evento?.onKeyDown}
        aria-label={`Mover tarjeta ${ETIQUETAS[id]}`}
        title="Arrastra para reordenar"
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded text-muted-foreground opacity-40 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Fila de KPI del Panel de operaciones reordenable con arrastrar y soltar (ratón, táctil o teclado). */
export function KpiFilaOrdenable({
  tarjetas,
  orden,
  onCambiar,
}: {
  tarjetas: Record<KpiPanelId, ReactNode>;
  orden: KpiPanelId[];
  onCambiar: (nuevo: KpiPanelId[]) => void;
}) {
  const bloquearClic = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const finalizar = (e: DragEndEvent) => {
    // El clic que sigue al soltar no debe abrir la tarjeta.
    window.setTimeout(() => { bloquearClic.current = false; }, 0);
    if (!e.over || e.active.id === e.over.id) return;
    onCambiar(moverKpi(orden, String(e.active.id), String(e.over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => { bloquearClic.current = true; }}
      onDragCancel={() => { window.setTimeout(() => { bloquearClic.current = false; }, 0); }}
      onDragEnd={finalizar}
      accessibility={{
        screenReaderInstructions: { draggable: "Pulsa espacio para tomar la tarjeta, usa las flechas para moverla y espacio para soltarla." },
      }}
    >
      <SortableContext items={orden} strategy={rectSortingStrategy}>
        <div
          aria-label="Indicadores de operaciones"
          className="grid grid-flow-col auto-cols-[168px] gap-2 overflow-x-auto pb-2 xl:grid-flow-row xl:auto-cols-auto xl:grid-cols-[repeat(8,minmax(0,1fr))] xl:overflow-x-visible"
        >
          {orden.map((id) => (
            <TarjetaOrdenable key={id} id={id} bloquearClic={bloquearClic}>
              {tarjetas[id]}
            </TarjetaOrdenable>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
