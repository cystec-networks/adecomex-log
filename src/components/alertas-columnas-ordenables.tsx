import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  CLAVE_DISPOSICION_ALERTAS,
  COLUMNAS_ALERTAS,
  columnasVisibles,
  disposicionEfectiva,
  guardarDisposicionAlertas,
  leerDisposicionAlertas,
  mismaDisposicion,
  moverGrupoAlertas,
  type DisposicionAlertas,
  type GrupoAlertaId,
} from "@/lib/panel-alertas-disposicion";

export type GrupoAlertaVista = {
  label: string;
  emoji: string;
  cantidad: number;
  contenido: ReactNode;
  /** Mostrar el bloque aunque su contador esté en 0 (p. ej. para ofrecer un filtro). */
  mostrarVacio?: boolean;
};

/** Disposición de los bloques de «Atención requerida» del usuario actual (por usuario). */
export function useDisposicionAlertas() {
  const qc = useQueryClient();
  const { data: userId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
    staleTime: Infinity,
  });
  const queryKey = ["preferencia-usuario", CLAVE_DISPOSICION_ALERTAS, userId];
  const { data } = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: () => leerDisposicionAlertas(supabase, userId!),
    staleTime: Infinity,
  });

  const guardar = useMutation({
    mutationFn: (nueva: DisposicionAlertas | null) => guardarDisposicionAlertas(supabase, userId!, nueva),
    onMutate: async (nueva) => {
      await qc.cancelQueries({ queryKey });
      const anterior = qc.getQueryData<DisposicionAlertas | null>(queryKey);
      qc.setQueryData(queryKey, nueva);
      return { anterior };
    },
    onError: (_e, _n, ctx) => {
      qc.setQueryData(queryKey, ctx?.anterior ?? null);
      toast.error("No se pudo guardar el orden de los bloques");
    },
  });

  const guardada = data ?? null;
  return {
    guardada,
    personalizada: guardada !== null,
    cambiar: (nueva: DisposicionAlertas) => { if (userId) guardar.mutate(nueva); },
    restablecer: () => { if (userId) guardar.mutate(null); },
  };
}

function Encabezado({ grupo }: { grupo: GrupoAlertaVista }) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="text-base leading-none">{grupo.emoji}</span>
      <span className="text-sm font-medium">{grupo.label}</span>
      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">{grupo.cantidad}</Badge>
    </div>
  );
}

function BloqueOrdenable({ id, grupo }: { id: GrupoAlertaId; grupo: GrupoAlertaVista }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-grupo-alerta={id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-40" : undefined}
    >
      <AccordionItem value={id} className="border-b">
        <div className="group flex items-stretch hover:bg-muted/40">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Mover bloque ${grupo.label}`}
            title="Arrastra para reordenar"
            className="grid w-7 shrink-0 cursor-grab place-items-center text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <AccordionTrigger className="py-3 pl-1 pr-4 hover:no-underline">
              <Encabezado grupo={grupo} />
            </AccordionTrigger>
          </div>
        </div>
        <AccordionContent className="pb-0">{grupo.contenido}</AccordionContent>
      </AccordionItem>
    </div>
  );
}

function Columna({
  indice,
  ids,
  grupos,
  abiertas,
  onAlternar,
  arrastrando,
  className,
}: {
  indice: 0 | 1;
  ids: GrupoAlertaId[];
  grupos: Partial<Record<GrupoAlertaId, GrupoAlertaVista>>;
  abiertas: Set<string>;
  onAlternar: (claves: string[], abiertasAqui: string[]) => void;
  arrastrando: boolean;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COLUMNAS_ALERTAS[indice] });
  if (ids.length === 0 && !arrastrando) return null;
  return (
    <SortableContext id={COLUMNAS_ALERTAS[indice]} items={ids} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        data-columna-alertas={indice}
        className={`min-w-0 ${arrastrando ? "min-h-14 pb-6" : ""} ${ids.length === 0 ? `m-2 rounded-md border-2 border-dashed ${isOver ? "border-primary bg-primary/5" : "border-border"}` : ""} ${className ?? ""}`}
      >
        {ids.length === 0 ? (
          <div className="grid h-full min-h-10 place-items-center px-4 text-xs text-muted-foreground">Suelta aquí para usar esta columna</div>
        ) : (
          <Accordion type="multiple" value={ids.filter((k) => abiertas.has(k))} onValueChange={(vals) => onAlternar(ids, vals)} className="w-full">
            {ids.map((id) => grupos[id] && <BloqueOrdenable key={id} id={id} grupo={grupos[id]!} />)}
          </Accordion>
        )}
      </div>
    </SortableContext>
  );
}

/**
 * Bloques de «Atención requerida» en dos columnas, reordenables con arrastrar
 * y soltar (ratón, táctil o teclado) dentro de una columna y entre columnas.
 */
export function AlertasColumnasOrdenables({
  grupos,
  guardada,
  onCambiar,
  abiertas,
  onAlternar,
}: {
  grupos: Partial<Record<GrupoAlertaId, GrupoAlertaVista>>;
  guardada: DisposicionAlertas | null;
  onCambiar: (nueva: DisposicionAlertas) => void;
  abiertas: Set<string>;
  onAlternar: (claves: string[], abiertasAqui: string[]) => void;
}) {
  // Conteo para decidir visibilidad y reparto; un bloque «mostrarVacio» cuenta como 1 aunque esté en 0.
  const conteos = Object.fromEntries(
    Object.entries(grupos).map(([k, g]) => [k, Math.max(g?.cantidad ?? 0, g?.mostrarVacio ? 1 : 0)]),
  ) as Partial<Record<GrupoAlertaId, number>>;
  const efectiva = disposicionEfectiva(guardada, conteos);
  const [borrador, setBorrador] = useState<DisposicionAlertas | null>(null);
  const [activo, setActivo] = useState<GrupoAlertaId | null>(null);
  const actual = borrador ?? efectiva;
  const visibles = columnasVisibles(actual, conteos);
  // El modo de una o dos columnas se decide con la disposición previa para no cambiar el ancho mientras se arrastra.
  const previas = columnasVisibles(efectiva, conteos);
  const dosColumnas = previas[0].length > 0 && previas[1].length > 0;
  const vacia = previas[0].length === 0 ? 0 : previas[1].length === 0 ? 1 : -1;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnaVisible = (d: DisposicionAlertas, id: string): number => {
    if (id === COLUMNAS_ALERTAS[0]) return 0;
    if (id === COLUMNAS_ALERTAS[1]) return 1;
    return d[0].includes(id as GrupoAlertaId) ? 0 : d[1].includes(id as GrupoAlertaId) ? 1 : -1;
  };

  const alPasar = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const base = borrador ?? efectiva;
    const desde = columnaVisible(base, String(active.id));
    const hacia = columnaVisible(base, String(over.id));
    if (desde < 0 || hacia < 0 || desde === hacia) return;
    const arriba = active.rect.current.translated?.top ?? 0;
    const despues = arriba > over.rect.top + over.rect.height / 2;
    setBorrador(moverGrupoAlertas(base, String(active.id), String(over.id), despues));
  };

  const finalizar = ({ active, over }: DragEndEvent) => {
    let final = borrador ?? efectiva;
    if (over && active.id !== over.id && columnaVisible(final, String(active.id)) === columnaVisible(final, String(over.id))) {
      final = moverGrupoAlertas(final, String(active.id), String(over.id));
    }
    setBorrador(null);
    setActivo(null);
    if (!mismaDisposicion(final, efectiva)) onCambiar(final);
  };

  const grupoActivo = activo ? grupos[activo] : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActivo(active.id as GrupoAlertaId)}
      onDragOver={alPasar}
      onDragEnd={finalizar}
      onDragCancel={() => { setBorrador(null); setActivo(null); }}
      accessibility={{
        screenReaderInstructions: { draggable: "Pulsa espacio para tomar el bloque, usa las flechas para moverlo y espacio para soltarlo." },
      }}
    >
      <div className={`grid grid-cols-1 items-start ${dosColumnas ? "lg:grid-cols-2 lg:divide-x" : ""}`}>
        {([0, 1] as const).map((i) => (
          <Columna
            key={i}
            indice={i}
            ids={visibles[i]}
            grupos={grupos}
            abiertas={abiertas}
            onAlternar={onAlternar}
            arrastrando={activo !== null}
            className={i === vacia ? "order-last" : undefined}
          />
        ))}
      </div>
      <DragOverlay>
        {grupoActivo ? (
          <div className="flex items-center rounded-md border bg-card px-2 py-3 shadow-lg">
            <GripVertical className="mr-1 h-4 w-4 text-muted-foreground" />
            <Encabezado grupo={grupoActivo} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
