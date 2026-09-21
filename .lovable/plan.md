# Reubicar campos aduaneros en la ficha Declaración

## Cambio visual
- Mover **Régimen Aduanero** a “3. Declaración”, conservando su selector, obligatoriedad y resaltado de validación.
- Mover **Rectificación técnica** y su **N.º de Trámite** condicional a “3. Declaración”.
- Mover **Preferencia comercial** y su **N.º Certificado de Origen** condicional a “3. Declaración”.
- Mover **Canal de riesgo** a “3. Declaración”.
- Retirar esos controles de “4. Descripción de mercancía”, sin duplicarlos.

## Conservación funcional
- Mantener los mismos nombres de datos, valores, eventos y permisos de edición.
- Mantener intacto el guardado, las validaciones, el detalle de mercancía y la generación XML/PDF.
- Ajustar únicamente el alcance de la lista de regímenes para que el selector funcione desde su nueva ubicación.

## Verificación
- Comprobar tipos y compilación.
- Revisar en la vista previa que los cuatro grupos aparecen en “3. Declaración” y ya no en “4. Descripción de mercancía”.
