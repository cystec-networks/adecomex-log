# Ajustes de Operación Logística

## Objetivo
Incorporar el ciclo completo de papelera para Operaciones Logísticas y permitir editar su número desde el encabezado, reutilizando los patrones existentes de Cotizaciones y Órdenes.

## Cambios

### 1. Listado de Logística
- Mantener el filtro actual que excluye registros con `eliminado_en`.
- Añadir una columna de acciones y el botón con ícono de papelera solo para usuarios con permiso de edición.
- Mostrar una confirmación antes de mover la operación.
- Al confirmar, guardar la fecha de eliminación y el usuario responsable.
- Actualizar inmediatamente el listado y el contador de la Papelera, con mensajes claros de éxito o error.
- Ajustar los separadores y estados vacíos al nuevo número de columnas.

### 2. Papelera de Reciclaje
- Incorporar `operaciones_logistica` al conjunto de registros administrados por la Papelera.
- Consultar las operaciones eliminadas junto con el nombre del cliente.
- Añadir la pestaña **Logística** con contador y columnas: número, cliente, tipo, estado, fecha de eliminación y acciones.
- Reutilizar las acciones existentes para restaurar y eliminar definitivamente.
- Al restaurar, limpiar `eliminado_en` y `eliminado_por`; al eliminar definitivamente, conservar la confirmación reforzada con la palabra `ELIMINAR`.
- Invalidar tanto la consulta de Papelera como el listado principal de Logística para reflejar los cambios.

### 3. Número editable en el detalle
- Incorporar `numero` al estado editable de la operación y cargarlo desde el registro actual.
- Sustituir el texto fijo del encabezado por el mismo campo inline usado en Cotizaciones y Órdenes cuando el usuario tenga permiso; mantener texto fijo para solo lectura.
- Incluir `numero` en la actualización al guardar y usar el valor editado en la Constancia PDF.
- Detectar el error de número duplicado `23505` y mostrar: **“Ese número de operación ya está en uso — elige otro.”**
- Mantener intactos el modo lectura/edición, etapas, documentos, historial, costos e incidencias.

## Validación
- Verificar tipos del proyecto.
- Probar en la vista que una operación se mueve a Papelera y desaparece del listado.
- Probar restauración desde la pestaña Logística.
- Confirmar que el número se edita y guarda, y que un duplicado muestra el mensaje solicitado.
