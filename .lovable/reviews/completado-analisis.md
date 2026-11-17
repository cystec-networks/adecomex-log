# Estado «Completado»: análisis previo (sin construir)

Datos leídos el 17/11/2026 sobre los **101 Expedientes en «Facturado»** (todos de importación).

## 1. Estados actuales

Recibido → En Tránsito → Manifestado → Presentado → Verificado → Despachado → Entregado → **Facturado** (el último hoy).
Activos: 2 Recibido, 28 En Tránsito, 1 Manifestado, 4 Presentado, 19 Despachado, 19 Entregado, 101 Facturado.
Hay una columna «Fecha de cierre» que nunca se ha usado (0 valores): sirve para guardar la fecha de Completado.

## 2. Qué datos hay para cada requisito

| Requisito | Dato del sistema | En los 101 Facturados | ¿Se puede verificar? |
|---|---|---|---|
| Despacho completo en SIGA | Procesos del Seguimiento SIGA (proceso «Despacho», estado «Completo») | Solo **2** tienen Seguimiento SIGA cargado (ambos Completo) | Sí, pero casi ningún histórico lo tiene |
| Documentos requeridos | Documentos recibidos por tipo | Factura comercial 77, BL 77, DUA 42, Liquidación 42. **41** tienen los cuatro | Sí. El número DUA está escrito en los 101; falta el PDF en 59 | **Elegido: los cuatro básicos.**
| Checklist completo o «No aplica» | 8 pasos activos del Checklist | Solo **10** cumplen. Pendientes: Documentos físicos 77, Enviado al gestor 79, Turno de verificación 69, Preferencia 57, Oficio DGA 47, Factura enviada 39 | Sí |
| Viajes entregados | Estado del viaje | Solo **9** tienen viajes; los 9 están Entregado/Facturado. 92 sin viaje (N/A) | Sí |
| Pagos de transporte registrados | Solicitud de pago del viaje y TF | 8 de 9 tienen TF; 1 sin solicitud de pago | Sí |
| Factura emitida | Factura e-CF vinculada | **101** con e-CF (1 compartida por dos Expedientes) | Sí |
| Saldo cobrado | Cobros registrados contra la e-CF | Solo **8** cobradas. Hay solo 46 cobros en todo el sistema | Sí, pero los cobros históricos no están registrados |
| Incidencias abiertas | Incidencias abierta/en gestión | **3**: 202607I274, 202607I270, 202607I268 | Sí |
| Pagos conciliados en el Diario | TF del viaje conciliado con el banco | 0 de 8 TF de estos viajes conciliados | Sí (solo advertencia) |

**Simulación preliminar con reglas estrictas: 0 de 101 cumplirían todo.** Aun sin exigir SIGA: 0.
Motivos (un Expediente puede tener varios): saldo sin cobrar 93, Checklist incompleto 91, documentos faltantes 60, sin SIGA 99, incidencias 3, pago de transporte sin registrar 1. Solo 4 tienen un único pendiente (2 solo cobro, 1 solo Checklist).

## 3. Línea de tiempo: qué fechas existen

| Hito | Fuente | Disponibles (de 101) |
|---|---|---|
| Llegada | Fecha de Llegada Real (o SIGA) | 67 |
| Manifiesto / Entrada | Procesos SIGA | 2 |
| DUA presentada | Fecha Presentado | 97 |
| DUA aprobada | Fecha de Aprobación del despacho (o SIGA) | 55 |
| Despacho completo | SIGA; respaldo: fecha en que pasó a Despachado | 2 SIGA / 97 respaldo |
| Entrega | Fecha Entregado | 97 |
| Facturación | Fecha de emisión de la e-CF | 101 |
| Cobro | Último cobro registrado | 8 |

Días calculables: llegada → despacho completo, despacho → entrega, y almacenaje (llegada → retiro del puerto: salida del primer viaje o, si no hay, entrega). Si falta una fecha se muestra «sin dato», nunca una fecha inventada.

## 4. Diseño propuesto

- **Nuevo estado «Completado»** después de Facturado. Nunca automático.
- **Panel «Requisitos de cierre»** en el Expediente (visible desde Facturado): cada punto ✔ / ✖ / N/A con enlace a su pestaña. «Pagos conciliados» solo como advertencia (⚠).
- Todo ✔ → «Listo para completar» y botón **Marcar Completado**. Con pendientes → mismo botón con **motivo obligatorio**, guardado en Auditoría con la lista de pendientes.
- Aviso antes de cerrar si el último Seguimiento SIGA no dice «Despacho completo».
- Al completar: guardar Fecha de cierre y una **foto de la línea de tiempo** con los días calculados.
- **Bloqueo** de datos críticos: DUA, N.º de despacho, Liquidación SIGA (número, PIN, montos, fechas), totales FOB/CIF/flete/seguro, montos de mercancías, costos y gastos, Liquidación, fechas de estado y llegada. Se pueden seguir agregando documentos y notas. El bloqueo se aplica también en la base de datos, no solo en la pantalla.
- **Reabrir**: botón con motivo obligatorio y línea en Auditoría; vuelve a Facturado.
- **Listas**: Completados ocultos por defecto en Expedientes, con filtro «Completados». **Dashboards** los siguen contando (igual que Facturado).
- **Lote**: vista previa por Expediente con motivo, desmarcar filas, aplicar solo con tu confirmación y deshacer el lote completo.
