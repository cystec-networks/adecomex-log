# Rediseño del BL Hijo y separación de buque/naviera

## Objetivo
Corregir la extracción y persistencia de **Buque** y **Naviera** como datos distintos, y reemplazar el PDF actual por un House Bill of Lading profesional con cajas y líneas de posición fija.

## Cambios
1. **OCR y datos de logística**
   - Agregar `buque` a la respuesta del escaneo y aclarar al modelo la diferencia entre el buque y la naviera.
   - Agregar `naviera` a operaciones de logística mediante una migración segura.
   - Mostrar ambos campos juntos en “Datos de la carga”, guardarlos y rellenarlos por separado al escanear.

2. **Nuevo diseño del BL Hijo**
   - Reconstruir la página A4 con líneas negras finas y cajas dibujadas directamente.
   - Crear el encabezado con logo, título y caja de referencias, incluyendo Booking.
   - Dibujar las cajas horizontales de Shipper, Consignee y Notify Party.
   - Dibujar las filas del viaje, conservando la tabla azul únicamente para la carga.
   - Añadir total cuando existan varios contenedores, términos de flete, agente de entrega, fecha y aviso legal.
   - Controlar cortes de texto y salto de página cuando la tabla de carga crezca.

3. **Validación**
   - Aplicar la migración y comprobar que guardar/leer una operación conserva ambos valores.
   - Generar un PDF de prueba con contenido largo y varios contenedores.
   - Renderizar todas sus páginas como imágenes, revisar solapamientos, cortes, márgenes y legibilidad, y corregir cualquier problema encontrado.

## Detalles técnicos
- Se mantiene `BlHijoPdfButton` sin cambios en su lógica de obtención de datos.
- `BlHijoInput` incorporará `booking`; `naviera` queda disponible en la operación, aunque la fila solicitada del PDF seguirá mostrando el buque real.
- El logo horizontal se servirá desde `public/logo-adecomex-horizontal.png`; se restaurará allí a partir del recurso horizontal existente si actualmente falta.