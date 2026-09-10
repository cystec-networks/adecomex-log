# KPI clicables y filtros por URL en el Dashboard

## Objetivo

Retirar los cuatro indicadores añadidos en la ronda anterior y convertir los seis KPI operativos restantes en accesos directos a sus listados correspondientes, manteniendo el diseño actual.

## Cambios

### Dashboard principal

- Eliminar los KPI nuevos que ya no aplican:
  - Saldo pendiente de cobro.
  - Documentos vencidos.
  - Expedientes con desviación de costo.
  - Cotizaciones sin movimiento como tarjeta independiente.
- Conservar únicamente:
  - Cotizaciones sin convertir.
  - Expedientes en proceso.
  - Facturados.
  - Permisos VUCE por vencer.
  - Transportes en tránsito.
  - Alertas activas.
- Retirar también las consultas y cálculos usados exclusivamente por los indicadores eliminados.
- Convertir cada tarjeta conservada en un enlace accesible, con foco visible, cursor y una sombra sutil al pasar el puntero.
- Destinos:
  - Cotizaciones sin convertir → `/cotizaciones` (listado correspondiente; no se añadirá un filtro adicional fuera del alcance solicitado).
  - Expedientes en proceso → `/expedientes?estado=digitar,en_transito,presentar,verificar,entregado`.
  - Facturados → `/expedientes?estado=facturar`.
  - Permisos VUCE por vencer → `/permisos?vencimiento=15`.
  - Transportes en tránsito → `/transportes?estado=en_transito,programado`.
  - Alertas activas → panel “Atención requerida” del mismo Dashboard mediante ancla, ya que no existe una ruta general de alertas.

### Listado de Expedientes

- Validar `estado` junto con el parámetro `tipo` existente.
- Aceptar uno o varios estados separados por coma.
- Aplicar esos estados desde la URL sin alterar el filtro por tipo, búsqueda o urgencia.
- Mantener operativo el selector manual; cuando la URL contenga varios estados, mostrará una opción descriptiva de filtro múltiple.
- Preservar el filtro de estado al cambiar entre Todos, Importación, Exportación y Facturados.

### Listado de Permisos VUCE

- Validar el parámetro `vencimiento`.
- Con `vencimiento=15`, mostrar únicamente permisos no rechazados ni vencidos cuya fecha de vencimiento esté entre hoy y los próximos 15 días.
- Mantener compatibles los filtros actuales por estado, cliente y búsqueda.

### Listado de Transportes

- Validar el parámetro `estado`.
- Aceptar uno o varios estados separados por coma y aplicar el filtro al abrir la pantalla.
- Mantener operativo el selector manual, mostrando una opción descriptiva cuando haya varios estados preseleccionados.

## Verificación

- Comprobar que solo quedan los seis KPI solicitados.
- Abrir cada KPI y confirmar su destino y el subconjunto mostrado.
- Verificar especialmente los filtros múltiples de Expedientes y Transportes, y el rango de 15 días de Permisos VUCE.
- Ejecutar la comprobación de TypeScript y revisar visualmente el Dashboard y los tres listados.
