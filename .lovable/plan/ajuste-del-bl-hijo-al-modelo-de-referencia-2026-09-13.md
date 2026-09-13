# Ajuste del BL Hijo al modelo de referencia

## Objetivo
Adaptar el BL Hijo al formato visual del documento enviado, usando una sola página tamaño carta (8½ × 11 pulgadas) y aprovechando toda su altura.

## Cambios
1. **Formato y estructura**
   - Cambiar el PDF de A4 a tamaño carta vertical.
   - Reorganizar el contenido como una cuadrícula continua de Bill of Lading, con líneas negras finas y bloques unidos.
   - Mantener Shipper, Consignee y Notify Party apilados a la izquierda; referencias, logo e identificación del emisor a la derecha.

2. **Marca y encabezado**
   - Mostrar el logo horizontal de ADECOMEX una sola vez.
   - Eliminar la repetición textual de “ADECOMEX SRL” y “Agencia de Comercio Exterior” debajo del logo.
   - Mantener “HOUSE BILL OF LADING” y la caja de B/L, referencia y Booking con jerarquía compacta.

3. **Cuerpo y pie**
   - Extender las filas de viaje, la tabla de carga, términos, agente de entrega, fecha y aviso legal hasta ocupar profesionalmente la hoja completa.
   - Ajustar automáticamente alturas y tamaños de texto para datos largos y varios contenedores, priorizando una sola página.
   - Conservar el encabezado azul de la tabla de carga.

4. **Validación visual**
   - Generar un BL de prueba con contenido largo y varios contenedores.
   - Renderizarlo como imagen y revisar dimensiones carta, cortes, solapamientos, márgenes y legibilidad.
   - Corregir cualquier defecto detectado antes de finalizar.

## Detalles técnicos
- El cambio se limita a `src/lib/pdf-bl-hijo.ts`; no se altera la obtención de datos ni el botón de vista previa.
- La hoja se generará en formato Letter de jsPDF (612 × 792 pt), con márgenes de 18–24 pt para acercarse al modelo aportado.
- Si el contenido excede razonablemente una página, se aplicará compactación controlada antes de permitir una página adicional, evitando ocultar información.
