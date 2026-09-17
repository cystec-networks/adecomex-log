# Múltiples tipos de despacho en el Servicio Aduanero

Hoy cada Expediente admite un solo tipo de despacho con una cantidad. El cambio permite una lista (ej. 1 contenedor de 20' + 1 de 40'), con subtotal por línea, total general y autocompletado desde los contenedores ya capturados.

## 1. Nueva tabla

Se crea `expediente_servicio_aduanero` (expediente, tipo de despacho, cantidad), con acceso restringido al personal interno igual que el resto del expediente.

Los 16 expedientes que ya tienen tipo y cantidad guardados se trasladan automáticamente a la nueva lista (una línea cada uno). Los campos anteriores se dejan intactos, sin usar, por seguridad.

Detalle del mapeo: los expedientes guardan hoy el nombre del tipo (ej. "Despacho contenedores importados de 20 pies") mientras la nueva tabla guarda el código de unidad (`contenedor20`, `contenedor4045`, `kg`, `tm`, `vehiculo`); la migración hace la conversión cruzando con el catálogo de tarifas.

## 2. Lista editable (componente compartido)

`ServicioAduaneroFields` pasa de un par único a un arreglo de líneas:

- Selector de tipo de despacho + campo de cantidad con la etiqueta correcta por unidad (kg, contenedores, vehículos, TM).
- Botón "+ Agregar tipo" y botón eliminar por línea, con el mismo estilo de tabla que la lista de Contenedores.
- Subtotal por línea (tarifa del catálogo × cantidad) y TOTAL destacado al pie.
- En modo solo lectura se muestran las líneas sin poder editarlas.

Consumidores:
- **Expediente**: lee y guarda las líneas en la nueva tabla (se reemplazan al guardar, igual que se hace con los contenedores). El total alimenta el campo "Servicio Aduanero (US$)".
- **Calculadora Rápida**: pasa de tipo único a lista en memoria por escenario; el total se usa en el cálculo y en el PDF comparativo, con una línea de desglose por tipo.

## 3. Autocompletar desde Contenedores (solo Expediente)

Botón junto a la lista que cuenta los contenedores capturados: los que contienen 40 o 45 suman a "contenedores de 40 y 45 pies", los que contienen 20 a "contenedores de 20 pies", y reemplaza las líneas con el resultado. Los contenedores cuyo tipo no se reconoce se listan en un aviso con sus números, para completarlos a mano; nunca se descartan en silencio.

## 4. Totales de liquidación

El total del Servicio Aduanero en Pre-Liquidación, Liquidación Final y los PDFs pasa a calcularse sumando todas las líneas de la nueva tabla, en lugar del tipo/cantidad únicos. El resto del cálculo (CIF, gravamen, ITBIS, Formulario DUA) no cambia.

## Notas técnicas

- Migración: `CREATE TABLE` + GRANTs + RLS `private.is_staff(auth.uid())` + backfill `INSERT ... SELECT` desde `expedientes` cruzando `catalogo_tasa_servicio_aduanero` por nombre para obtener `unidad`.
- `src/lib/servicio-aduanero.tsx`: nuevos tipos `FilaServicio`, helper `totalServicioUsd(filas, tarifas)`, hook `useServicioAduaneroFilas(expedienteId)` para lectura y `servicioAduaneroDeExpediente(exp)` reescrito para sumar desde la nueva tabla (mismo nombre y firma, usado por los PDFs).
- Archivos tocados: `src/lib/servicio-aduanero.tsx`, `src/routes/_authenticated/expedientes.$id.tsx`, `src/routes/_authenticated/cotizaciones.calculadora.tsx`.
