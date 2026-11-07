import type { ReactNode } from "react";
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
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { esOrdenPorDefecto, guardarOrdenPreferencia, leerOrdenPreferencia, moverEnOrden } from "@/lib/orden-preferencia";

/** Orden personal (por usuario) de un conjunto de elementos, guardado en sus preferencias. */
export function useOrdenPreferencia<T extends string>(
  clave: string,
  ids: readonly T[],
  mensajeError: string,
  /** Ids nuevos que, si faltan en un orden ya guardado, se anteponen en vez de ir al final. */
  alInicio: readonly T[] = [],
) {
  const qc = useQueryClient();
  const { data: userId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
    staleTime: Infinity,
  });
  const queryKey = ["preferencia-usuario", clave, userId];
  const { data: orden } = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: () => leerOrdenPreferencia(supabase, userId!, clave, ids, alInicio),
    staleTime: Infinity,
  });

  const guardar = useMutation({
    mutationFn: (nuevo: T[]) => guardarOrdenPreferencia(supabase, userId!, clave, ids, nuevo),
    onMutate: async (nuevo) => {
      await qc.cancelQueries({ queryKey });
      const anterior = qc.getQueryData<T[]>(queryKey);
      qc.setQueryData(queryKey, nuevo);
      return { anterior };
    },
    onError: (_e, _nuevo, ctx) => {
      qc.setQueryData(queryKey, ctx?.anterior ?? [...ids]);
      toast.error(mensajeError);
    },
  });

  const actual = orden ?? [...ids];
  return {
    orden: actual,
    personalizado: !esOrdenPorDefecto(actual, ids),
    cambiar: (nuevo: T[]) => { if (userId) guardar.mutate(nuevo); },
    mover: (activo: string, destino: string) => { if (userId) guardar.mutate(moverEnOrden(actual, activo, destino)); },
    restablecer: () => { if (userId) guardar.mutate([...ids]); },
  };
}

function useSensoresOrden(distancia: number) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: distancia } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

const claseAsa =
  "grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-40 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100";

// ---------- Recuadros KPI ----------

function RecuadroOrdenable({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  // Ratón/táctil desde todo el recuadro; teclado solo desde el asa.
  const evento = listeners as Record<string, ((e: unknown) => void) | undefined> | undefined;
  return (
    <div
      ref={setNodeRef}
      data-kpi-id={id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative h-full min-w-0 touch-manipulation ${isDragging ? "z-10 cursor-grabbing opacity-80 shadow-lg" : "cursor-grab"}`}
      onMouseDown={evento?.onMouseDown}
      onTouchStart={evento?.onTouchStart}
    >
      {children}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        onKeyDown={evento?.onKeyDown}
        aria-label={`Mover recuadro ${etiqueta}`}
        title="Arrastra para reordenar"
        className={`absolute right-1 top-1 ${claseAsa}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Fila de recuadros KPI reordenable con arrastrar y soltar (ratón, táctil o teclado). */
export function FilaRecuadrosOrdenable<T extends string>({
  orden,
  recuadros,
  etiquetas,
  onMover,
  ariaLabel,
  className,
}: {
  orden: T[];
  recuadros: Record<T, ReactNode>;
  etiquetas: Record<T, string>;
  onMover: (activo: string, destino: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const sensors = useSensoresOrden(6);
  const finalizar = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onMover(String(e.active.id), String(e.over.id));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={finalizar}
      accessibility={{ screenReaderInstructions: { draggable: "Pulsa espacio para tomar el recuadro, usa las flechas para moverlo y espacio para soltarlo." } }}
    >
      <SortableContext items={orden} strategy={rectSortingStrategy}>
        <div aria-label={ariaLabel} className={className}>
          {orden.map((id) => (
            <RecuadroOrdenable key={id} id={id} etiqueta={etiquetas[id]}>{recuadros[id]}</RecuadroOrdenable>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ---------- Bloques grandes (tarjetas con gráficas) ----------

function BloqueOrdenable({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-bloque-id={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative min-w-0 ${isDragging ? "z-10 opacity-80 shadow-lg" : ""}`}
    >
      {children}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Mover bloque ${etiqueta}`}
        title="Arrastra para reordenar"
        className={`absolute right-2 top-2 touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"} ${claseAsa}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Bloques apilados reordenables arrastrando su asa (arriba a la derecha);
 * el contenido (gráficas, recuadros anidados) sigue funcionando con normalidad.
 */
export function BloquesOrdenables<T extends string>({
  orden,
  bloques,
  etiquetas,
  onMover,
  ariaLabel,
  className,
}: {
  orden: T[];
  bloques: Record<T, ReactNode>;
  etiquetas: Record<T, string>;
  onMover: (activo: string, destino: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const sensors = useSensoresOrden(4);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => { if (e.over && e.active.id !== e.over.id) onMover(String(e.active.id), String(e.over.id)); }}
      accessibility={{ screenReaderInstructions: { draggable: "Pulsa espacio para tomar el bloque, usa las flechas arriba y abajo para moverlo y espacio para soltarlo." } }}
    >
      <SortableContext items={orden} strategy={rectSortingStrategy}>
        <div aria-label={ariaLabel} className={className}>
          {orden.map((id) => (
            <BloqueOrdenable key={id} id={id} etiqueta={etiquetas[id]}>{bloques[id]}</BloqueOrdenable>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ---------- Columnas de tabla ----------

/** Envuelve la fila de encabezados: sus `ThOrdenable` se reordenan arrastrando el asa. */
export function EncabezadosOrdenables({
  orden,
  onMover,
  children,
}: {
  orden: string[];
  onMover: (activo: string, destino: string) => void;
  children: ReactNode;
}) {
  const sensors = useSensoresOrden(4);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => { if (e.over && e.active.id !== e.over.id) onMover(String(e.active.id), String(e.over.id)); }}
      accessibility={{ screenReaderInstructions: { draggable: "Pulsa espacio para tomar la columna, usa las flechas izquierda y derecha para moverla y espacio para soltarla." } }}
    >
      <SortableContext items={orden} strategy={horizontalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** Encabezado de columna arrastrable por su asa; el contenido (p. ej. el botón de ordenar) sigue funcionando con clic. */
export function ThOrdenable({
  id,
  etiqueta,
  align = "left",
  className = "",
  children,
}: {
  id: string;
  etiqueta: string;
  align?: "left" | "right" | "center";
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const alinear = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      ref={setNodeRef}
      data-columna-id={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative px-3 py-2.5 ${alignClass} ${isDragging ? "z-20 bg-muted shadow-md" : ""} ${className}`}
    >
      <div className={`flex items-center gap-0.5 ${alinear}`}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Mover columna ${etiqueta}`}
          title="Arrastra para mover la columna"
          className={`-ml-1.5 touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"} ${claseAsa}`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        {children}
      </div>
    </th>
  );
}
