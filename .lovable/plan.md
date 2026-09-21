# Encabezado estable del Expediente

## Objetivo
Mantener cada dato del encabezado siempre en la misma posición, sin que la longitud ni la cantidad de contenedores desplace los demás campos.

## Cambios
- Sustituir la fila flexible de referencias por una cuadrícula estable de dos líneas en escritorio.
- Mantener posiciones fijas para cliente, estado, fecha, BL/AWB, contenedor, progreso de despacho, DUA, número de despacho, permiso y alerta legal.
- Reservar el espacio de cada campo aun cuando no tenga valor, mostrando “—” donde corresponda.
- Limitar BL/AWB, contenedores y permisos a su celda con recorte visual y conservar el valor completo al pasar el cursor.
- Mantener una distribución adaptable y legible en pantallas pequeñas, sin alterar acciones, datos ni lógica.

## Verificación
- Comparar expedientes con uno y múltiples contenedores.
- Confirmar que ningún dato cambia de posición y que las pestañas permanecen alineadas.
- Revisar escritorio y móvil.
