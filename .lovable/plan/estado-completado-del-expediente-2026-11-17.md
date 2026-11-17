# Estado «Completado» del Expediente

## Reglas confirmadas
- Nuevo estado final **Completado**, después de Facturado. Nunca se marca solo.
- **Documentos obligatorios:** Factura comercial, BL (o Guía aérea), DUA y Liquidación de Impuestos, con su archivo.
- **Despacho completo:** basta con el N.º de despacho y la fecha de aprobación. Si no hay Seguimiento SIGA cargado, o el último no dice «Despacho completo», se muestra un aviso sin bloquear.
- **Cobro:** obligatorio solo para facturas e-CF emitidas desde el **01/11/2026**. Las anteriores quedan exentas.
- **Checklist:** obligatorio en Expedientes nuevos. En el lote histórico, los pasos pendientes pasan a «No aplica».
- **Otros requisitos:** viajes entregados, pago de transporte registrado y ninguna incidencia abierta. Que los pagos estén conciliados en el Diario es solo una advertencia.
- **Permisos:** Administrador, Operaciones y Finanzas pueden completar. Solo el Administrador puede reabrir.

## Simulación final (sin guardar)
- Hay 101 Expedientes en Facturado y 41 tienen los cuatro documentos.
- **25 se podrían completar** con estas reglas.
- 16 quedan bloqueados solo por el cobro (factura de noviembre sin pago registrado).
- Ninguno de los 41 se bloquea por despacho, incidencias o transporte.
- 39 mostrarían el aviso de que falta el Seguimiento SIGA.
- Los 60 que no tienen los cuatro documentos se quedan en Facturado.

## Qué vas a ver
1. **Panel «Requisitos de cierre»** en el Expediente, visible desde Facturado. Cada requisito muestra ✔, ✖ o N/A, con un enlace a la pestaña donde se corrige. Las advertencias se muestran aparte.
2. **Botón «Marcar Completado»:**
   - Con todo en ✔ dice «Listo para completar».
   - Con pendientes pide un motivo obligatorio, que queda en Auditoría junto con la lista de pendientes.
   - Antes de cerrar avisa si falta el Seguimiento SIGA.
3. **Al completar** se guarda la fecha de cierre y la línea de tiempo con los días calculados: llegada → despacho, despacho → entrega y almacenaje. Si falta una fecha se muestra «sin dato».
4. **Bloqueo de datos importantes** (DUA, N.º de despacho, Liquidación SIGA, montos, costos y fechas), tanto en pantalla como en la base de datos. Se pueden seguir agregando documentos y notas.
5. **Botón «Reabrir»**, solo para el Administrador. Pide un motivo, deja una línea en Auditoría y devuelve el Expediente a Facturado.
6. **Lista de Expedientes:** los Completados se ocultan por defecto y aparece el filtro «Completados». Los paneles y dashboards los siguen contando igual que a los Facturados.
7. **Lote histórico** sobre los Facturados:
   - Muestra una vista previa por Expediente con sus pendientes y los pasos del Checklist que pasarían a «No aplica».
   - Puedes desmarcar filas.
   - Solo se aplica cuando lo confirmas, y todo el lote se puede deshacer.
   - No se ejecuta sin tu confirmación.

## Detalles técnicos
- Migración:
  - Añadir `completado` al enum `expediente_estado`.
  - Usar la columna `expedientes.fecha_cierre`.
  - Nueva columna `cierre_snapshot` jsonb para la línea de tiempo y los pendientes aceptados.
  - Tabla de lotes de cierre para poder deshacerlos.
  - RPC `completar_expediente` y `reabrir_expediente` (security definer, con verificación de rol mediante `has_role`).
  - Ampliar `validar_transicion_expediente()`: solo se llega a Completado desde Facturado y por la RPC.
  - Trigger de bloqueo de campos críticos mientras el estado sea `completado`.
- Módulo puro `src/lib/expediente-cierre.ts`:
  - Evalúa los requisitos (documentos, despacho, cobro con corte 01/11/2026 definido como constante, Checklist, viajes, pago de transporte, incidencias y conciliación).
  - Calcula la línea de tiempo.
  - Lo comparten el panel, el lote y las pruebas.
- `estados-expediente.ts`: añadir la etiqueta y el orden de «Completado», fuera del avance normal.
- Pruebas con valores concretos para cada regla: los cuatro documentos, el corte de cobro (31/10 exenta y 01/11 exigida), los permisos de completar y reabrir, y el aviso de SIGA.
