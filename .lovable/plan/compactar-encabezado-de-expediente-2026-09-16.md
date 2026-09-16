# Compactar encabezado de Expediente

## Objetivo
Reducir la altura del encabezado sticky del Expediente, especialmente a 375 px, sin cambiar el contenido ni la lógica de las acciones existentes.

## Cambios
- Mantener en `md:` en adelante los controles secundarios actuales visibles en fila.
- En móvil, reemplazar ese bloque por un único botón “⋮ Más acciones” con:
  - Duplicar.
  - Documentos y Reportes, conservando sus opciones actuales.
  - Herramientas DGA/VUCE, conservando sus enlaces actuales.
  - Rastreos de Envío, conservando sus enlaces actuales.
  - Rastrear Embarque.
- Mover WhatsApp, correo y búsqueda de correo al final del popover del cliente.
- Mostrar Contenedor y BL/AWB en una sola línea truncable, con el valor completo en tooltip.
- Ajustar la distribución móvil del encabezado y sus pestañas para reducir el apilamiento vertical sin alterar los controles de estado, edición o guardado.

## Verificación
- Comprobar visualmente el Expediente a 375 px y en escritorio.
- Confirmar que los menús, popover y acciones siguen abriendo y ejecutándose.
- Verificar que el encabezado no tenga desbordes ni solapamientos y que el recorrido móvil hasta Guardar/Editar quede sensiblemente más corto.

## Detalles técnicos
- Cambios limitados a la presentación del detalle de Expediente y, solo si hace falta para reutilizar la acción de rastreo dentro del menú, a su componente de botón existente.
- Se usarán utilidades responsivas `md:` y los componentes de menú ya instalados.
