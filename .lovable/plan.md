# Reglas de validación en los estados del Expediente

## Cómo queda el comportamiento

**Avance de estado (bloqueo con mensaje).** Al cambiar el Estado en el selector, si falta el dato oficial de esa etapa el cambio NO se aplica: el estado vuelve a mostrarse como estaba y aparece un mensaje claro, por ejemplo: "No se puede pasar a Manifestado: falta la Fecha de Llegada Real (Información General)".

Requisitos:

| Transición | Requisito |
|---|---|
| Recibido → Tránsito | BL / AWB / Guía |
| Tránsito → Manifestado | Fecha de Llegada Real |
| Manifestado → Presentado | Declaración DUA |
| Presentado → Verificado | Número de despacho |
| Verificado → Despachado | N.º Liquidación SIGA |
| Despachado → Entregado | Al menos 1 registro en Gastos operativos |
| Entregado → Facturado | Una factura e-CF vinculada al Expediente |

Si se salta etapas (por ejemplo de Recibido a Presentado), se exigen todos los requisitos intermedios.

**No se puede retroceder.** Cualquier intento de volver a un estado anterior queda bloqueado para todos los roles.

**Regreso forzado (solo admin y operaciones).** En el encabezado del Expediente, junto al selector de Estado, aparece un botón discreto "Corregir estado" visible únicamente para esos dos roles. Abre un diálogo donde se elige el estado anterior al que se quiere regresar y se escribe un motivo breve; al confirmar se aplica sin exigir ningún requisito y se registra en la auditoría quién lo hizo, desde qué estado, hacia cuál y el motivo. Para el resto de los roles la opción no existe.

## Detalle técnico

**Base de datos (migración):**
- Columna nueva `expedientes.forzar_regreso_estado boolean not null default false`, usada como bandera por actualización.
- Trigger `BEFORE UPDATE OF estado ON public.expedientes` (nombre con prefijo `z_` para correr después de los triggers existentes) con función `validar_transicion_expediente()`:
  - Si el nuevo estado está antes en el orden y la bandera no viene activa → `RAISE EXCEPTION`.
  - Si la bandera viene activa: exige `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operaciones')`, permite el retroceso sin validar requisitos, y la deja en `false` de nuevo.
  - En avance: recorre cada paso del orden entre `OLD.estado` y `NEW.estado` y valida `bl_awb`, `fecha_llegada_real`, `numero_dua`, `numero_igra` (Número de despacho), `liq_siga_numero`, `EXISTS gastos_operativos` y `EXISTS facturas_ecf` por `expediente_id`, con mensaje específico del dato faltante.
- `expedientes_auto_en_transito()` se ajusta para auto-avanzar a `en_transito` solo cuando `bl_awb` no está vacío, de modo que guardar la fecha de compromiso sin BL no rompa el guardado.
- Trigger de auditoría: la función de validación inserta en `auditoria` la acción `regreso_forzado_estado:<old>-><new>` con `usuario_id = auth.uid()` y el motivo en `cambios` cuando aplica el regreso.

**Frontend (`src/routes/_authenticated/expedientes.$id.tsx`):**
- `updateEstado` valida los mismos requisitos antes de enviar (consulta `gastos_operativos` y `facturas_ecf`) y muestra el mensaje con `toast.error`; se elimina la regla actual ad-hoc de "Despachado requiere factura e-CF" y se reemplaza por la tabla anterior.
- Nuevo componente de diálogo `ForzarRegresoEstadoDialog` (en el mismo archivo, junto al selector): select de estados anteriores, campo motivo, confirmación; envía el update con `forzar_regreso_estado: true` y refresca la consulta.
- Helpers de orden/requisitos en `src/lib/estados-expediente.ts` para reutilizarlos en ambos lados.
