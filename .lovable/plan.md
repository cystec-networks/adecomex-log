## 1. Diagnóstico (8 vs 13)

Revisé `src/routes/_authenticated/dashboard.tsx` (líneas 106 y 113):

- El **badge del encabezado** muestra `reminders.length` → total real de alertas visibles del hook `useReminders` (los 13 correctos, ya filtrados por las descartadas).
- La **lista** se renderiza con `reminders.slice(0, 8)` → hay un **corte fijo hardcoded a 8**, sin scroll, sin paginación y sin indicación de "hay más".

Por eso ves 13 en el contador y solo 8 filas. No es un bug de datos: el conteo es correcto; el bug es puramente de presentación (`slice(0, 8)`).

Nota adicional: el hook ya ordena por severidad (crítica → alta → media) y pone los hitos "CRÍTICO" primero, así que las 5 que se pierden actualmente son siempre las menos urgentes — pero igual deben ser visibles.

## 2. Rediseño propuesto (mockup)

Reemplazo la lista plana por un **acordeón agrupado por categoría**, con contador por grupo y ordenado por urgencia. El grupo más crítico se abre por defecto; los demás inician colapsados y son expandibles de forma independiente (multi-open).

```text
┌─ Atención requerida ──────────────────────── [13] ─┐
│                                                    │
│  🔴 Hitos atrasados / críticos            (4) ▾   │  ← abierto por defecto
│     • ⚠️ CRÍTICO · Verificación mercancía puerto  │
│       Exp. EXP-0012 · vence hoy — cargos por…    │
│     • Hito atrasado · Pago de impuestos           │
│       Exp. EXP-0009 · vencido hace 2 días         │
│     • …                                            │
│                                                    │
│  🟡 ETA / Expedientes                     (5) ▸   │
│  🟠 Permisos por vencer                   (2) ▸   │
│  🚚 Transportes retrasados                (1) ▸   │
│  📥 Solicitudes sin convertir             (1) ▸   │
│                                                    │
│  ────────────────────────────────────────────────  │
│  [ Marcar todo visto ]           [ Ver todas → ]  │
└────────────────────────────────────────────────────┘
```

### Reglas de agrupación

Mapeo de `ReminderKind` (definido en `src/lib/reminders.ts`) a grupos:

| Grupo                     | Kinds incluidos                              | Prioridad |
| ------------------------- | -------------------------------------------- | --------- |
| Hitos atrasados/críticos  | `hito_atrasado`, `hito_proximo`              | 1 (abierto) |
| ETA / Expedientes         | `eta_proximo`, `expediente_inactivo`         | 2         |
| Permisos                  | `permiso_vencido`, `permiso_por_vencer`      | 3         |
| Transportes retrasados    | `transporte_retrasado`                       | 4         |
| Solicitudes sin convertir | `solicitud_sin_convertir`                    | 5         |

Dentro de cada grupo se mantiene el orden actual del hook (severidad + CRÍTICO primero). Un grupo con 0 alertas no se renderiza.

### Comportamiento

- **Multi-open**: usar `Accordion type="multiple"` de shadcn.
- **Default open**: solo el primer grupo con contenido (normalmente Hitos).
- **Altura máxima con scroll interno** dentro del acordeón (`max-h-[420px] overflow-auto`) para que aunque todos se expandan el dashboard no crezca sin control.
- **Sin corte de datos**: eliminar el `slice(0, 8)`. Todas las alertas quedan accesibles.
- **Acciones al pie**: "Marcar todo visto" (llama a `dismiss` sobre las visibles) y opcional "Ver todas" (por ahora abre la campana de notificaciones ya existente; una ruta dedicada `/alertas` la dejo fuera de este cambio salvo que la pidas).
- Cada fila conserva: link al recurso, título, detalle, severity badge.

## 3. Alcance del cambio

Solo frontend, un único archivo:

- `src/routes/_authenticated/dashboard.tsx` — reemplazar el bloque de la Card "Atención requerida" (líneas ~101-126) por el acordeón agrupado. Importar `Accordion*` de `@/components/ui/accordion` (ya existe en el proyecto).

Sin cambios en `useReminders`, sin cambios de BD, sin nuevas rutas.

¿Apruebas para implementarlo así, o prefieres que además cree la ruta dedicada `/alertas` con tabla y filtros?