# Consolidar documentos de Operaciones Logísticas

## Objetivo
Reemplazar los cuatro botones independientes del encabezado por un solo desplegable **Documentos**, sin cambiar la generación, vista previa ni descarga de ningún PDF.

## Cambios
- Permitir que cada componente de documento reciba opcionalmente un activador personalizado, manteniendo su botón actual como comportamiento predeterminado.
- Añadir en el encabezado de la operación un menú desplegable con Constancia, BL Hijo, Solicitud de Booking y Cotización.
- Renderizar cada visor fuera del contenido visible del menú mediante sus componentes existentes, conservando estados de generación y errores.
- Verificar que cada opción cierre el menú y abra su vista previa correspondiente.

## Archivos
- `src/routes/_authenticated/logistica.$id.tsx`
- Los cuatro componentes existentes de generación de documentos.
